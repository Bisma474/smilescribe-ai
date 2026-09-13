import json
import logging
import re
from groq import Groq
from app.core.config import settings

logger = logging.getLogger(__name__)

# A timeout is set explicitly — the default Groq/httpx client has no
# request timeout at all. Confirmed live: a hung network call here left a
# real recording stuck at "processing" for 4+ minutes with nothing logged
# (no warning, no error) and the existing 2-attempt retry loop below never
# even triggered, since a hang isn't a raised exception. 60s is generous
# for this call (observed well under 10s normally) while still bounding
# the worst case.
client = Groq(api_key=settings.GROQ_API_KEY, timeout=60.0)

EXTRACTION_PROMPT = """You are a dental charting assistant. Given a dentist-patient transcript and optional context from a dental knowledge base, extract all clinical findings as a JSON array inside a root JSON object with a single key "findings".

The structure of the root object must be:
{
  "findings": [
    {
      "tooth_number": "14",
      "surface": "M",
      "finding": "Bleeding on probing",
      "detail": "Slight bleeding on probing at tooth 14 mesial",
      "verbatim_quote": "there is slight bleeding on probing at fourteen mesial",
      "char_offset_start": 396,
      "char_offset_end": 433,
      "confidence": 100,
      "pageindex_context": "Periodontal > Probing Depths"
    }
  ]
}

Each entry in the findings array must have these fields:
- tooth_number: str using the Universal tooth system only: "1" through "32", or "ALL" for non-tooth-specific findings. Never use FDI tooth numbers such as 46.
- surface: str (e.g. "M", "O", "MO", "MOD", "B", "L", "All", or "")
- finding: str (short name like "Bleeding on probing", "Existing restoration", "Possible caries", "Calculus buildup", "Fluoride varnish")
- detail: str (clinical detail sentence)
- verbatim_quote: str (exact substring from the transcript that supports this finding)
- char_offset_start: int (character index where verbatim_quote starts in the transcript)
- char_offset_end: int (character index where verbatim_quote ends)
- confidence: int (0-100, how certain you are based on the transcript)
- pageindex_context: str (relevant knowledge domain path, e.g. "Periodontal > Probing Depths")

CRITICAL RULES:
1. Every verbatim_quote MUST be a non-empty, exact character-for-character match of a substring in the transcript.
2. Calculate char_offset_start and char_offset_end precisely (0-indexed).
3. Use Universal tooth numbers 1 through 32 only. Do not use FDI numbers.
4. If you cannot find verbatim evidence, set the entry confidence to 0 and note "no verbatim evidence" in detail.
5. Do not create a billable procedure merely because it was discussed or recommended.

Return ONLY valid JSON, no markdown, no explanation."""


CHUNK_THRESHOLD_CHARS = 3500  # Transcripts longer than this trigger chunked processing
TARGET_CHUNK_CHARS = 2800     # Preferred size per chunk
CHUNK_OVERLAP_CHARS = 250     # Overlap with preceding chunk


def split_transcript_into_chunks(transcript: str, target_size: int = TARGET_CHUNK_CHARS, overlap: int = CHUNK_OVERLAP_CHARS) -> list[dict]:
    """Split a long transcript into overlapping chunks at natural sentence or speaker turn boundaries.
    
    Returns a list of dicts: [{'text': str, 'start_offset': int, 'end_offset': int, 'index': int}]
    """
    if len(transcript) <= CHUNK_THRESHOLD_CHARS:
        return [{"text": transcript, "start_offset": 0, "end_offset": len(transcript), "index": 0}]

    chunks = []
    total_len = len(transcript)
    curr_start = 0

    while curr_start < total_len:
        raw_end = min(curr_start + target_size, total_len)

        if raw_end >= total_len:
            actual_end = total_len
        else:
            search_window = transcript[max(curr_start, raw_end - 400):min(total_len, raw_end + 200)]
            matches = list(re.finditer(r"(\n+|[.!?]\s+)", search_window))
            if matches:
                best_match = min(matches, key=lambda m: abs((max(curr_start, raw_end - 400) + m.end()) - raw_end))
                actual_end = max(curr_start, raw_end - 400) + best_match.end()
            else:
                actual_end = raw_end

        chunk_text = transcript[curr_start:actual_end]
        chunks.append({
            "text": chunk_text,
            "start_offset": curr_start,
            "end_offset": actual_end,
            "index": len(chunks),
        })

        if actual_end >= total_len:
            break

        next_start = max(actual_end - overlap, curr_start + 100)
        snap_space = transcript.find(" ", next_start, min(total_len, next_start + 50))
        if snap_space != -1:
            curr_start = snap_space + 1
        else:
            curr_start = next_start

    return chunks


def _deduplicate_findings(findings: list[dict], transcript: str) -> list[dict]:
    """Deduplicate findings extracted across multiple overlapping transcript chunks."""
    deduped = []
    seen = set()

    for f in findings:
        tooth = str(f.get("tooth_number", "")).strip().upper()
        surface = str(f.get("surface", "")).strip().upper()
        finding_type = str(f.get("finding", "")).strip().lower()
        start = f.get("char_offset_start", -1)

        key = (tooth, surface, finding_type, start // 150 if start != -1 else start)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(f)

    return deduped


def _extract_single_pass(transcript: str, pageindex_context: str = "") -> list[dict]:
    system_msg = EXTRACTION_PROMPT
    if pageindex_context:
        system_msg += f"\n\nRelevant dental knowledge context:\n{pageindex_context}"

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": f"Transcript:\n{transcript}"},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_completion_tokens=4000,
                reasoning_effort="low",
            )
            content = response.choices[0].message.content
            return _parse_and_validate(content, transcript)
        except Exception as e:  # noqa: BLE001 — any Groq/SDK failure, retried once
            last_error = e
            logger.warning("extract_chart attempt %d failed: %s", attempt + 1, e)

    logger.error("extract_chart failed after retry: %s", last_error)
    return [{"error": "AI chart extraction failed after retrying", "raw": str(last_error)}]


def extract_chart_chunked(transcript: str, pageindex_context: str = "") -> list[dict]:
    """Extract findings from long transcripts by chunking, running per-chunk LLM extraction,
    translating relative offsets to master transcript offsets, and deduplicating results."""
    chunks = split_transcript_into_chunks(transcript)
    if len(chunks) == 1:
        return _extract_single_pass(transcript, pageindex_context)

    all_findings = []
    failed_chunks = 0

    for chunk in chunks:
        chunk_text = chunk["text"]
        chunk_offset = chunk["start_offset"]

        chunk_findings = _extract_single_pass(chunk_text, pageindex_context)

        for finding in chunk_findings:
            if "error" in finding:
                failed_chunks += 1
                continue

            rel_start = finding.get("char_offset_start", -1)
            rel_end = finding.get("char_offset_end", -1)
            if rel_start != -1 and rel_end != -1:
                abs_start = chunk_offset + rel_start
                abs_end = chunk_offset + rel_end
                finding["char_offset_start"] = abs_start
                finding["char_offset_end"] = abs_end

                quote = finding.get("verbatim_quote", "")
                if quote and transcript[abs_start:abs_end] != quote:
                    actual_abs = transcript.find(quote, max(0, abs_start - 300))
                    if actual_abs != -1:
                        finding["char_offset_start"] = actual_abs
                        finding["char_offset_end"] = actual_abs + len(quote)

            finding["chunk_index"] = chunk["index"]
            all_findings.append(finding)

    if failed_chunks == len(chunks) and not all_findings:
        return [{"error": "AI chart extraction failed across all transcript chunks", "raw": "All chunks failed"}]

    return _deduplicate_findings(all_findings, transcript)


def extract_chart(transcript: str, pageindex_context: str = "") -> list[dict]:
    """Extract clinical findings from a transcript via the LLM.
    Automatically uses chunked extraction for long transcripts (>3500 chars).
    """
    if len(transcript) > CHUNK_THRESHOLD_CHARS:
        return extract_chart_chunked(transcript, pageindex_context)
    return _extract_single_pass(transcript, pageindex_context)


_VALID_UNIVERSAL_TEETH = {str(number) for number in range(1, 33)}
_EVIDENCE_TOKEN_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)
_EVIDENCE_STOPWORDS = {"a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "with", "your"}


def _meaningful_tokens(value: str) -> set[str]:
    return {token.lower() for token in _EVIDENCE_TOKEN_RE.findall(value) if token.lower() not in _EVIDENCE_STOPWORDS}


def _recover_evidence(entry: dict, transcript: str) -> tuple[str, int, int, int] | None:
    """Find a conservative source sentence when an LLM paraphrases its quote.

    This returns a real transcript excerpt only when at least three meaningful
    tokens and 45% of the query tokens overlap. The confidence is capped at 85
    because it is recovered evidence, not an exact model quote.
    """
    query = " ".join(str(entry.get(key, "")) for key in ("verbatim_quote", "finding", "detail"))
    query_tokens = _meaningful_tokens(query)
    if len(query_tokens) < 3:
        return None
    best: tuple[float, str, int] | None = None
    for match in re.finditer(r"[^.!?]+[.!?]?", transcript):
        excerpt = match.group(0).strip()
        excerpt_tokens = _meaningful_tokens(excerpt)
        overlap = len(query_tokens & excerpt_tokens)
        score = overlap / len(query_tokens)
        if overlap >= 3 and (best is None or score > best[0]):
            best = (score, excerpt, match.start() + (len(match.group(0)) - len(match.group(0).lstrip())))
    if best is None or best[0] < 0.45:
        return None
    score, excerpt, start = best
    original_confidence = entry.get("confidence")
    original_confidence = original_confidence if isinstance(original_confidence, int) else 0
    confidence = min(85, original_confidence, max(50, round(score * 100)))
    return excerpt, start, start + len(excerpt), confidence


def _validate_tooth_number(entry: dict) -> None:
    tooth = str(entry.get("tooth_number") or "").strip().upper()
    if tooth in {"", "ALL"}:
        entry["tooth_number"] = tooth
        return
    if tooth not in _VALID_UNIVERSAL_TEETH:
        entry["tooth_number"] = ""
        entry["confidence"] = 0
        entry["detail"] = f"{entry.get('detail', '')} [WARNING: unsupported tooth number '{tooth}'; Universal teeth must be 1-32]".strip()


def _parse_and_validate(raw: str, transcript: str) -> list[dict]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return [{"error": "Failed to parse LLM output", "raw": raw}]

    if isinstance(data, list):
        entries = data
    elif isinstance(data, dict):
        # Look for typical list keys
        for key in ["findings", "entries", "clinical_findings"]:
            if key in data and isinstance(data[key], list):
                entries = data[key]
                break
        else:
            # Fallback: find any value in the dict that is a list
            for val in data.values():
                if isinstance(val, list):
                    entries = val
                    break
            else:
                entries = [data]
    else:
        entries = [data]

    validated = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        quote = entry.get("verbatim_quote", "")
        quote = quote if isinstance(quote, str) else ""
        start = entry.get("char_offset_start", -1)
        end = entry.get("char_offset_end", -1)

        actual_start = transcript.find(quote) if quote else -1
        quote_valid = bool(quote) and actual_start != -1 and (start == -1 or actual_start == start)

        if not quote_valid and actual_start != -1:
            entry["char_offset_start"] = actual_start
            entry["char_offset_end"] = actual_start + len(quote)
            entry["_offset_corrected"] = True
        elif not quote_valid:
            recovered = _recover_evidence(entry, transcript)
            if recovered:
                recovered_quote, recovered_start, recovered_end, recovered_confidence = recovered
                entry["verbatim_quote"] = recovered_quote
                entry["char_offset_start"] = recovered_start
                entry["char_offset_end"] = recovered_end
                entry["confidence"] = recovered_confidence
                entry["_evidence_recovered"] = True
            else:
                entry["confidence"] = 0
                entry["detail"] = (entry.get("detail", "") +
                                   " [WARNING: verbatim quote not found in transcript]")
                entry["char_offset_start"] = -1
                entry["char_offset_end"] = -1

        entry.setdefault("tooth_number", "")
        entry.setdefault("surface", "")
        entry.setdefault("finding", "")
        entry.setdefault("detail", "")
        entry.setdefault("confidence", 0)
        entry.setdefault("pageindex_context", "")
        _validate_tooth_number(entry)

        validated.append(entry)

    return validated

