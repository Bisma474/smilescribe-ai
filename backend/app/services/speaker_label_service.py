"""Text-only role labels used when audio diarization is unavailable.

The model infers likely Dentist/Patient roles from wording. It never supplies
clinical text: every returned passage must match the original Whisper
transcript sequentially before it is displayed.
"""
import json

from groq import Groq
from app.core.config import settings

_SYSTEM_PROMPT = """Split the supplied dental-visit transcript into consecutive
speaker passages and assign each passage Dentist or Patient. Return only JSON:
{"segments":[{"speaker":"Dentist","text":"exact transcript passage"}]}.
Every text value must be an exact, character-for-character substring from the
input. Keep passages in original order. Cover the complete input without
omitting, rewriting, combining, or adding words. Return one sentence per
passage whenever punctuation permits; never combine adjacent sentences, even if
you think they share a speaker. A passage must not span two speakers. Classify
each sentence from its wording and nearby context. If unsure, use Patient. Do
not include any commentary."""


def label_transcript_roles(transcript: str) -> str | None:
    """Return original transcript passages with inferred roles, or None.

    Model output is accepted only when its passages reconstruct the supplied
    transcript in order, allowing whitespace between passages. This prevents a
    role-labeling model from introducing or changing clinical text.
    """
    source = transcript.strip()
    if not source or not settings.GROQ_API_KEY:
        return None
    client = Groq(api_key=settings.GROQ_API_KEY, timeout=30.0)
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({"transcript": source})},
        ],
        response_format={"type": "json_object"}, temperature=0,
        max_completion_tokens=4000, reasoning_effort="low",
    )
    segments = json.loads(response.choices[0].message.content or "{}").get("segments")
    if not isinstance(segments, list) or not segments:
        return None

    cursor = 0
    labeled: list[str] = []
    for segment in segments:
        if not isinstance(segment, dict) or not isinstance(segment.get("text"), str):
            return None
        requested_text = segment["text"].strip()
        if not requested_text:
            return None
        start = source.find(requested_text, cursor)
        if start < cursor or source[cursor:start].strip():
            return None
        end = start + len(requested_text)
        role = segment.get("speaker") if segment.get("speaker") in {"Dentist", "Patient"} else "Patient"
        labeled.append(f"{role}: {source[start:end]}")
        cursor = end
    if source[cursor:].strip():
        return None
    return "\n".join(labeled)
