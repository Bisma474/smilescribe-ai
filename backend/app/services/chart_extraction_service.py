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


def extract_chart(transcript: str, pageindex_context: str = "") -> list[dict]:
    """Extract clinical findings from a transcript via the LLM.

    openai/gpt-oss-120b is a reasoning model — without reasoning_effort
    capped and a generous max_completion_tokens, it was observed (live,
    reproduced directly against the Groq API) to spend its entire token
    budget on internal chain-of-thought before ever emitting the JSON
    response, returning a completely empty completion. Groq's own
    json_object validator then rejects that empty output with a 400
    'json_validate_failed' and an empty failed_generation, which looks
    like a transient API error but is actually deterministic for a given
    transcript — reproduced identically on every retry until these
    params were added. reasoning_effort='low' is enough for a
    straightforward extraction task like this one.

    As defense in depth (the params above fixed every case tested, but
    Groq's own API can still fail for unrelated reasons — rate limits,
    an outage, etc.), the call is still retried once, and if it fails
    even after that, this returns a synthetic error entry instead of
    raising — the caller (session_pipeline) already has a real, saved
    transcript by this point, so an extraction failure shouldn't throw
    that away and mark the whole visit as failed. The synthetic error
    entry is rendered as a visible "Extraction error" card on the Chart
    page rather than silently vanishing (see chart_mapping.py)."""
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

