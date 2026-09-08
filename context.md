# DentalScribeAI Project Context & Status

Welcome to **DentalScribeAI**! This file provides context on what has been set up in the repository and the planned next steps, so that everyone (Bisma, Naimah, and Hassan) is aligned.

---

## 📅 Project History & Setup

1. **Initial Repository Setup**
   - The basic project structure has been established with `/backend`, `/frontend`, `/supabase`, and `docker-compose.yml`.

2. **Supabase Schema & Migrations**
   - Located at: `supabase/full_migration.sql`
   - Tables: `users`, `patients`, `sessions`, `chart_entries`, `billing_codes`
   - Seed data: demo dentist (`dr.kim@brightsmile.com`) and sample patients.

3. **POC Implementation Plan (v2)**
   - Full POC with 4 working components: ASR, PageIndex Cloud retrieval, chart extraction with evidence spans, and interactive citation UI.

---

## ✅ Completed Work

### Backend — 5 POC Endpoints (all in `backend/app/api/v1/endpoints/poc.py`)

| Endpoint | Method | Description | Status |
|---|---|---|---|
| `/api/v1/poc/demo-transcript` | GET | Returns synthetic dental transcript (DR/PT labeled) | ✅ Done |
| `/api/v1/poc/transcribe` | POST | Upload audio → Groq Whisper transcription | ✅ Done |
| `/api/v1/poc/pageindex/query` | POST | Query PageIndex knowledge base (mock fallback if no API key) | ✅ Done |
| `/api/v1/poc/pageindex/tree` | GET | Fetch knowledge tree structure (mock fallback if no API key) | ✅ Done |
| `/api/v1/poc/extract-chart` | POST | Transcript → chart entries with evidence spans + span validation | ✅ Done |

### Backend Services

| Service | File | Description |
|---|---|---|
| Synthetic Data | `services/synthetic_data.py` | Pre-written dentist-patient transcript for fallback testing |
| ASR Service | `services/asr_service.py` | Groq Whisper wrapper with dental vocabulary prompt |
| PageIndex Service | `services/pageindex_service.py` | PageIndex SDK integration — returns mock tree/context when no API key configured |
| Chart Extraction | `services/chart_extraction_service.py` | LLM-based chart extraction with JSON mode + verbatim quote validation (auto-corrects offsets, flags hallucinations) |

### Backend Config

- `config.py` — Added `PAGEINDEX_API_KEY` and `PAGEINDEX_DOC_ID` env vars
- `requirements.txt` — Added `pageindex>=0.1.0`
- `router.py` — Registered POC router

### Frontend Pages & Components

| Route | Component | Description |
|---|---|---|
| `/poc` | `CitationWorkspace` + `PageIndexPanel` | Citation workspace with transcript/chart linking + knowledge tree viz |
| `/dashboard` | Dashboard page | Stats, schedule, revenue alerts — Review buttons navigate to chart |
| `/dashboard/chart` | Chart Review | Working tabs (Perio/Clinical/Summary), bidirectional entry↔transcript highlighting |
| `/dashboard/recording` | Recording screen | Live timer, waveform, mock transcript |
| `/dashboard/processing` | Processing screen | Step indicators, progress bar |
| `/dashboard/billing` | Billing & Revenue | CDT codes, confidence bars, revenue flags |
| `/dashboard/patients` | Patients list | Search, filters, patient cards |
| `/dashboard/settings` | Settings | 6 section tabs with unique content per section |

### Frontend Fixes Applied

| Issue | Fix |
|---|---|
| Sidebar overlapping content on desktop | Layout corrected (sidebar uses sticky positioning) |
| Dashboard Review buttons not working | Added `onClick` navigation to chart page |
| Chart Review tab switching broken | Added state-based tab rendering |
| Chart entry ↔ transcript highlighting not working | Added bidirectional state linking with scrollIntoView |
| Top bar search not functional | Converted to real `<input>` with dropdown results |
| Settings showing same content for all sections | Added `switch(activeSection)` with unique content per tab |
| POC styles not loading | Inlined styles removed broken CSS `<link>` |

### Key Decisions

- **No PageIndex API key required** — falls back to mock tree + mock context data
- **Groq API key** — set in `.env` for real Whisper + LLM chart extraction
- **PageIndex query removed from UI** — frontend only shows tree visualization
- **Cleaned up** — deleted 3 empty stub services, dev logs, `__pycache__/`

---

## 🚀 Architecture

```
Frontend (Next.js)                    Backend (FastAPI)
───────────────                       ────────────────
/poc                                   GET  /poc/demo-transcript
  CitationWorkspace                    POST /poc/transcribe
  PageIndexPanel                       GET  /poc/pageindex/tree
/dashboard                             POST /poc/pageindex/query
  Chart, Recording,                    POST /poc/extract-chart
  Processing, Billing,
  Patients, Settings
```

---

## 🛠️ Current Git Status

- Local git repo at parent level (`Dental-Scribe-AI/`) has **no commits and no remote configured**
- All code is inside `DentalScribeAI-hassan/` (untracked)
- GitHub repo: `https://github.com/m-hassanqureshi/DentalScribeAI` (private — collaborator access needed)

---

## 📝 Next Steps

1. **Push to GitHub** — clone the repo, copy code in, commit, push
2. **GROQ_API_KEY** — already set in `backend/.env` (provided by Hassan)
3. **Supabase** — not yet connected. Need project URL + anon key + service key if DB features required
4. **Deploy**:
   - Frontend → Vercel (free)
   - Backend → Render.com (free — spins down after 15min inactivity)
5. **Optional enhancements**:
   - Add audio file upload UI in CitationWorkspace
   - Add real PageIndex API key if tree visualization from actual document is needed
   - Connect Supabase for auth + persistent storage
