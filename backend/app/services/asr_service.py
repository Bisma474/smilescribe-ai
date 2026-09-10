import io
from groq import Groq
from app.core.config import settings

client = Groq(api_key=settings.GROQ_API_KEY)

# Previously also told Whisper to "label speakers as DR: and PT:" — but
# Whisper doesn't actually identify speakers, it would just insert those
# literal tokens into the transcript unreliably (guessing from context, not
# hearing distinct voices). Real speaker labels now come from
# diarization_service.py (pyannote.audio, which does hear distinct voices)
# merged in afterward — keeping this instruction here would just add
# spurious/conflicting labels into the plain transcript text.
DENTAL_PROMPT = (
    "This is a dental appointment conversation between a dentist and a patient. "
    "Transcribe accurately including dental terminology: tooth numbers, surfaces (mesial, distal, buccal, lingual, occlusal), "
    "periodontal probing depths, caries, restorations, scaling, and fluoride treatments."
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
        prompt=DENTAL_PROMPT,
        language="en",
    )

    text = response.text.strip()
    words = []
    if hasattr(response, "segments"):
        for seg in response.segments:
            if hasattr(seg, "words") and seg.words:
                for w in seg.words:
                    words.append({
                        "word": w.word.strip(),
                        "start": w.start,
                        "end": w.end,
                    })

    return {"transcript": text, "words": words}
