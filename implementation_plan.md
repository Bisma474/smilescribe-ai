# DentalScribeAI POC — Implementation Plan (v2)

Build a demoable proof-of-concept with 4 working components: ASR, PageIndex Cloud retrieval, chart extraction with evidence spans, and interactive citation UI.

## User Review Required

> [!IMPORTANT]
> **API Keys needed in `backend/.env`:**
> ```
> GROQ_API_KEY=gsk_...
> PAGEINDEX_API_KEY=your-pageindex-api-key
> PAGEINDEX_DOC_ID=pi-your-document-id
> ```
> Please share your **PageIndex Document ID** and confirm you have both API keys ready.

> [!IMPORTANT]
> **PageIndex integration**: Since your dental knowledge tree is **already built on PageIndex Cloud**, I'll use the `pageindex` Python SDK to:
> - Query your document via `pi_client.chat_completions(doc_id=...)` for context retrieval
> - Fetch the tree structure via `pi_client.get_tree(doc_id)` for visualization
> - Show the tree traversal path in the UI (via `stream_metadata=True`)

## Open Questions

1. **What is your PageIndex Document ID?** (format: `pi-xxxxxxxxxxxx`)
2. **Do you have a PageIndex API key?** (from [dash.pageindex.ai/api-keys](https://dash.pageindex.ai/api-keys))
3. **Do you have a Groq API key?** (for Whisper + chart extraction LLM)
4. **Groq model preference?** Default: `llama-3.3-70b-versatile` for chart extraction. Want a different one?

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js Frontend                      │
│  ┌──────────────┐  ┌──────────────────────────────────┐ │
│  │  Chart Panel  │  │     Transcript Panel              │ │
│  │  (findings)   │◄─┤  (text + highlight spans)        │ │
│  │  hover ──────►│  │  ◄── highlighted on hover        │ │
│  └──────────────┘  └──────────────────────────────────┘ │
│           │                                              │
│  ┌────────┴────────────────────────────────────────────┐ │
│  │  PageIndex Panel — tree viz + query comparison       │ │
│  └─────────────────────────────────────────────────────┘ │
│           │                                              │
│  POST /api/v1/poc/transcribe                             │
│  POST /api/v1/poc/extract-chart                          │
│  POST /api/v1/poc/pageindex/query                        │
│  GET  /api/v1/poc/pageindex/tree                         │
│  GET  /api/v1/poc/demo-transcript                        │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                   FastAPI Backend                        │
│  ┌──────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ ASR Svc  │  │ PageIndex Cloud │  │ Chart Extract  │ │
│  │ (Groq    │  │ (pageindex SDK) │  │ (Groq LLM +   │ │
│  │ Whisper) │  │ doc_id → query  │  │ JSON output)   │ │
│  └──────────┘  └─────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
           PageIndex Cloud API
           (your dental document tree)
```

---

## Proposed Changes

### Backend — Dependencies

#### [MODIFY] [requirements.txt](file:///d:/DentalScribeAI/backend/requirements.txt)
```diff
 # AI
 openai>=1.0.0
 groq>=0.5.0
+
+# PageIndex — vectorless RAG
+pageindex>=0.1.0
```

---

### Backend — Configuration

#### [MODIFY] [config.py](file:///d:/DentalScribeAI/backend/app/core/config.py)
Add PageIndex config fields:
```diff
 GROQ_API_KEY: str = ""
+
+# ── PageIndex (vectorless RAG) ──────────────────────────────────────
+PAGEINDEX_API_KEY: str = ""
+PAGEINDEX_DOC_ID: str = ""   # your dental knowledge document ID
```

---

### Backend — POC Services (4 new files)

#### [NEW] [synthetic_data.py](file:///d:/DentalScribeAI/backend/app/services/synthetic_data.py)
Pre-built synthetic dental conversation transcript (~4 min):
- Realistic dentist-patient dialogue covering: periodontal probing, caries detection, existing restorations, treatment planning
- Speaker-labeled (`DR:` / `PT:`)
- Used as fallback when no audio file is uploaded
- Designed so chart extraction can find 6-8 concrete findings with evidence spans

#### [NEW] [asr_service.py](file:///d:/DentalScribeAI/backend/app/services/asr_service.py)
Groq Whisper transcription wrapper:
- Accepts audio upload (`.wav`, `.mp3`, `.m4a`)
- Calls `groq.audio.transcriptions.create()` with `whisper-large-v3`
- Uses `verbose_json` for word-level timestamps
- Dental-specific prompt for terminology accuracy
- Returns `{ transcript: str, words: [{word, start, end}] }`

#### [NEW] [pageindex_service.py](file:///d:/DentalScribeAI/backend/app/services/pageindex_service.py)
PageIndex Cloud integration via Python SDK:

```python
from pageindex import PageIndexClient

pi_client = PageIndexClient(api_key=settings.PAGEINDEX_API_KEY)

# Query dental knowledge
def query_context(query: str) -> dict:
    """Use PageIndex Chat API to retrieve dental context."""
    response = pi_client.chat_completions(
        messages=[{"role": "user", "content": query}],
        doc_id=settings.PAGEINDEX_DOC_ID,
    )
    return response["choices"][0]["message"]["content"]

# Get tree structure for visualization
def get_tree() -> list:
    """Fetch the hierarchical tree index for display."""
    result = pi_client.get_tree(settings.PAGEINDEX_DOC_ID)
    return result.get("result", [])

# Streaming with traversal metadata (for showing the reasoning path)
def query_context_with_trace(query: str):
    """Stream with metadata to show tree traversal steps."""
    for chunk in pi_client.chat_completions(
        messages=[{"role": "user", "content": query}],
        doc_id=settings.PAGEINDEX_DOC_ID,
        stream=True,
        stream_metadata=True,
    ):
        yield chunk
```

#### [NEW] [chart_extraction_service.py](file:///d:/DentalScribeAI/backend/app/services/chart_extraction_service.py)
Single LLM call for chart extraction with evidence spans:
- **Input**: transcript text + PageIndex-retrieved context
- **Output**: JSON array of chart entries:
  ```json
  {
    "tooth_number": "14",
    "surface": "MO",
    "finding": "Caries detected",
    "detail": "Class II carious lesion on mesio-occlusal surface",
    "verbatim_quote": "I can see a cavity on the upper left first premolar",
    "char_offset_start": 342,
    "char_offset_end": 393,
    "confidence": 92,
    "pageindex_context": "Section: Restorative > Caries Classification"
  }
  ```
- **Post-processing**: Validates every `verbatim_quote` exists in transcript at claimed offset. Flags hallucinated spans.
- Uses Groq `llama-3.3-70b-versatile` with JSON mode

---

### Backend — POC API Endpoints

#### [NEW] [poc.py](file:///d:/DentalScribeAI/backend/app/api/v1/endpoints/poc.py)
New router with 5 endpoints (no auth for POC):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/poc/demo-transcript` | Returns synthetic dental transcript |
| `POST` | `/poc/transcribe` | Upload audio → Groq Whisper → transcript |
| `POST` | `/poc/pageindex/query` | Query PageIndex Cloud with a dental term |
| `GET` | `/poc/pageindex/tree` | Fetch full tree structure for visualization |
| `POST` | `/poc/extract-chart` | Transcript → chart entries with evidence spans |

#### [MODIFY] [router.py](file:///d:/DentalScribeAI/backend/app/api/v1/router.py)
```diff
+from app.api.v1.endpoints import poc
+api_router.include_router(poc.router, prefix="/poc", tags=["POC"])
```

---

### Frontend — Citation UI (3 new files)

#### [NEW] [page.tsx](file:///d:/DentalScribeAI/frontend/src/app/poc/page.tsx)
POC demo route at `/poc`

#### [NEW] [CitationWorkspace.tsx](file:///d:/DentalScribeAI/frontend/src/components/features/poc/CitationWorkspace.tsx)
Main demo component — split-panel layout:

**Left Panel — Chart Entries:**
- Card per finding with tooth number, finding, confidence badge
- PageIndex source path as breadcrumb (e.g. `Periodontal > Probing Depths > Classification`)
- Hover → highlights the card + sends signal to transcript panel

**Right Panel — Transcript:**
- Full transcript with speaker labels styled (DR: in navy, PT: in gray)
- Evidence spans wrapped in `<mark>` elements with data attributes
- Hover a chart entry → corresponding span highlights with glow animation + auto-scroll

**Top Bar:**
- "Upload Audio" / "Use Demo Transcript" buttons
- "Extract Chart" button → calls backend
- Processing state indicators (spinner, step dots)

#### [NEW] [PageIndexPanel.tsx](file:///d:/DentalScribeAI/frontend/src/components/features/poc/PageIndexPanel.tsx)
PageIndex visualization + comparison:
- **Tree view**: Collapsible tree of the dental knowledge hierarchy (fetched from `/poc/pageindex/tree`)
- **Query input**: Type a dental term → shows PageIndex result with tree traversal trace
- **Comparison**: Side-by-side "what naive keyword search returns" vs "what PageIndex returns" for the same query
- Highlights which tree nodes were visited during retrieval

#### [NEW] [poc.css](file:///d:/DentalScribeAI/frontend/src/styles/poc.css)
Dedicated POC styles:
- Split-panel layout (responsive — stacks on mobile)
- Evidence span highlight animation (golden glow on hover)
- Chart entry cards matching existing design system (navy/teal palette)
- Tree node expand/collapse with indentation guides
- Confidence bars, speaker label badges
- Dark JSON viewer panel for raw output

---

## File Summary

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `backend/requirements.txt` | MODIFY | Add `pageindex` SDK |
| 2 | `backend/app/core/config.py` | MODIFY | Add PageIndex env vars |
| 3 | `backend/app/services/synthetic_data.py` | NEW | Synthetic dental transcript |
| 4 | `backend/app/services/asr_service.py` | NEW | Groq Whisper wrapper |
| 5 | `backend/app/services/pageindex_service.py` | NEW | PageIndex Cloud SDK integration |
| 6 | `backend/app/services/chart_extraction_service.py` | NEW | LLM chart extraction + span validation |
| 7 | `backend/app/api/v1/endpoints/poc.py` | NEW | POC API endpoints (5 routes) |
| 8 | `backend/app/api/v1/router.py` | MODIFY | Register POC router |
| 9 | `frontend/src/app/poc/page.tsx` | NEW | POC demo page |
| 10 | `frontend/src/components/features/poc/CitationWorkspace.tsx` | NEW | Chart ↔ Transcript hover-highlight UI |
| 11 | `frontend/src/components/features/poc/PageIndexPanel.tsx` | NEW | Tree viz + query comparison |
| 12 | `frontend/src/styles/poc.css` | NEW | POC-specific styles |

---

## Verification Plan

### Automated Tests
1. **Backend startup**: `uvicorn app.main:app --reload` — no import errors
2. **Demo transcript**: `GET /api/v1/poc/demo-transcript` → JSON with transcript text
3. **PageIndex query**: `POST /api/v1/poc/pageindex/query` with `{"query": "periodontal probing"}` → context from your PageIndex document
4. **PageIndex tree**: `GET /api/v1/poc/pageindex/tree` → hierarchical tree JSON
5. **Chart extraction**: `POST /api/v1/poc/extract-chart` with demo transcript → chart JSON with evidence spans
6. **Span validation**: Every `verbatim_quote` verified at claimed `char_offset` in transcript

### Manual Verification
1. Open `http://localhost:3000/poc` — see demo transcript + extracted chart entries
2. Hover chart entries → transcript spans highlight with smooth scroll
3. PageIndex panel shows tree structure from your dental document
4. Query a dental term → see PageIndex result with tree traversal trace
5. Browser recording of the hover-highlight interaction for demo

### Success Criteria
- ✅ All 4 POC components working end-to-end
- ✅ No hallucinated evidence spans (all quotes verified in transcript)
- ✅ PageIndex returns coherent, structured dental context vs naive search
- ✅ Citation UI hover interaction is smooth and demoable
