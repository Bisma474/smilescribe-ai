import json
import re
from groq import Groq
from app.core.config import settings

client = Groq(api_key=settings.GROQ_API_KEY)

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
- tooth_number: str (e.g. "14", "19", "30", or "ALL" for non-tooth-specific findings)
- surface: str (e.g. "M", "O", "MO", "MOD", "B", "L", "All", or "")
- finding: str (short name like "Bleeding on probing", "Existing restoration", "Possible caries", "Calculus buildup", "Fluoride varnish")
- detail: str (clinical detail sentence)
- verbatim_quote: str (exact substring from the transcript that supports this finding)
- char_offset_start: int (character index where verbatim_quote starts in the transcript)
- char_offset_end: int (character index where verbatim_quote ends)
- confidence: int (0-100, how certain you are based on the transcript)
- pageindex_context: str (relevant knowledge domain path, e.g. "Periodontal > Probing Depths")

CRITICAL RULES:
1. Every verbatim_quote MUST be an exact character-for-character match of a substring in the transcript.
2. Calculate char_offset_start and char_offset_end precisely (0-indexed).
3. If you cannot find verbatim evidence, set the entry confidence to 0 and note "no verbatim evidence" in detail.

Return ONLY valid JSON, no markdown, no explanation."""


def extract_chart(transcript: str, pageindex_context: str = "") -> list[dict]:
    system_msg = EXTRACTION_PROMPT
    if pageindex_context:
        system_msg += f"\n\nRelevant dental knowledge context:\n{pageindex_context}"

    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": f"Transcript:\n{transcript}"},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )

    content = response.choices[0].message.content
    entries = _parse_and_validate(content, transcript)
    return entries


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
        start = entry.get("char_offset_start", -1)
        end = entry.get("char_offset_end", -1)

        actual_start = transcript.find(quote)
        quote_valid = actual_start != -1 and (start == -1 or actual_start == start)

        if not quote_valid and actual_start != -1:
            entry["char_offset_start"] = actual_start
            entry["char_offset_end"] = actual_start + len(quote)
            entry["_offset_corrected"] = True
        elif not quote_valid:
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

        validated.append(entry)

    return validated

