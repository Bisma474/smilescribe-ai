import io
from groq import Groq
from app.core.config import settings

# A timeout is set explicitly — the default Groq/httpx client has no
# request timeout, and a hung network call here (confirmed live: this
# happened to chart_extraction_service's client, same default, blocking a
# whole recording at "processing" for 4+ minutes with no error and nothing
# logged) blocks the background recording pipeline indefinitely with no
# way for the UI to recover.
client = Groq(api_key=settings.GROQ_API_KEY, timeout=60.0)

# Whisper's `prompt` param biases vocabulary/style by example, not by
# instruction — live-tested and confirmed: an instructional prompt
# ("This is a dental appointment... Transcribe accurately including...")
# got literally echoed back as the "transcript" on real recordings (e.g.
# "Transcribe accurately including dental terminology." as the entire
# output for one visit, and fabricated lines like "The patient is a
# dentist, but a nurse" mixed into another), especially over quiet or
# unclear audio where Whisper tends to hallucinate a continuation of
# whatever text the prompt already established. Rewritten as a plausible
# example of actual dental-visit transcript text instead of an
# instruction, matching Whisper's documented prompting guidance.
#
# Previously also told Whisper to "label speakers as DR: and PT:" — but
# Whisper doesn't actually identify speakers, it would just insert those
# literal tokens into the transcript unreliably (guessing from context, not
# hearing distinct voices). Real speaker labels now come from
# diarization_service.py (pyannote.audio, which does hear distinct voices)
# merged in afterward.
DENTAL_PROMPT = (
    "Okay, let's take a look. I see some bleeding on probing at tooth "
    "fourteen, mesial surface, and mild calculus buildup along the "
    "lower anteriors. Probing depths are within normal limits elsewhere. "
    "I'd recommend a fluoride varnish today and we'll do a scaling next visit."
)


def transcribe_audio(file_bytes: bytes, filename: str) -> dict:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "wav"
    content_type_map = {
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "m4a": "audio/mp4",
        "webm": "audio/webm",
        "ogg": "audio/ogg",
    }
    content_type = content_type_map.get(suffix, "audio/wav")

    file_obj = io.BytesIO(file_bytes)
    file_obj.name = filename

    response = client.audio.transcriptions.create(
        file=(filename, file_obj, content_type),
        model="whisper-large-v3",
        response_format="verbose_json",
        # Without this, verbose_json still returns segment-level timing but
        # segments[].words comes back empty — confirmed live: diarization's
        # word/speaker-turn merge (diarization_service.merge_with_transcript)
        # silently produced nothing until this was added.
        timestamp_granularities=["word"],
        prompt=DENTAL_PROMPT,
        language="en",
    )

    text = response.text.strip()
    words = []
    if hasattr(response, "words") and response.words:
        # Groq returns top-level `words` when timestamp_granularities
        # includes "word" — segments[].words is a separate (and, per the
        # above, unreliable) field.
        for w in response.words:
            words.append({
                "word": w.word.strip() if hasattr(w, "word") else w["word"].strip(),
                "start": w.start if hasattr(w, "start") else w["start"],
                "end": w.end if hasattr(w, "end") else w["end"],
            })
    elif hasattr(response, "segments"):
        for seg in response.segments:
            if hasattr(seg, "words") and seg.words:
                for w in seg.words:
                    words.append({
                        "word": w.word.strip(),
                        "start": w.start,
                        "end": w.end,
                    })

    return {"transcript": text, "words": words}
