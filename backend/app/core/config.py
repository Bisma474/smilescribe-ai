import json
import os
from typing import List
from pydantic_settings import BaseSettings


def _parse_origins(v) -> List[str]:
    """Accept JSON list, comma-separated string, or empty. Always returns a list."""
    if isinstance(v, list):
        return v
    if not v:
        return []
    s = str(v).strip()
    if s.startswith("["):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except json.JSONDecodeError:
            pass
    return [item.strip() for item in s.split(",") if item.strip()]


class Settings(BaseSettings):
    PROJECT_NAME: str = "DentalScribeAI"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"

    # ── Supabase ──────────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # SQLAlchemy points at the Supabase Postgres connection pooler (Transaction mode)
    DATABASE_URL: str = "postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres"

    # ── Auth ─────────────────────────────────────────────────────────────────
    # Auth is delegated to Supabase Auth — token issuance/verification and
    # expiry are managed by Supabase, not by this app.

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Read as raw string from env, then parse in property.
    ALLOWED_ORIGINS_RAW: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        return _parse_origins(self.ALLOWED_ORIGINS_RAW)

    # ── AI / Vectorless RAG (Pageindex) ──────────────────────────────────────
    PAGEINDEX_API_KEY: str = ""
    PAGEINDEX_DOCUMENT_ID: str = ""

    # ── AI / Transcription ───────────────────────────────────────────────────
    GROQ_API_KEY: str = ""

    # ML Pipeline Settings (kept for compatibility, not used by POC)
    WHISPER_MODEL: str = "base"
    WHISPER_INITIAL_PROMPT: str = (
        "Dental clinical encounter. Terms include: tooth numbering Universal system, "
        "CDT codes D2392 D4910 D1330 D0150 D0274, "
        "surfaces MOD MO DO buccal lingual mesial distal occlusal, "
        "probing depths furcation involvement calculus bleeding on probing, "
        "composite restoration amalgam crown periapical bitewing radiograph, "
        "local anesthetic lidocaine articaine, "
        "gingivitis periodontitis recession mobility, "
        "maxillary mandibular anterior posterior quadrant."
    )
    HF_TOKEN: str = ""
    PYANNOTE_MODEL: str = "pyannote/speaker-diarization-3.1"
    SPEAKER_LABEL_MAP: dict = {
        "SPEAKER_00": "Dentist",
        "SPEAKER_01": "Patient",
    }
    AUDIO_FILE: str = "dentist_miles_clara_wav.wav"
    OUTPUT_TRANSCRIPT: str = "final_transcript.txt"
    OUTPUT_JSON: str = "transcript_segments.json"

    PAGEINDEX_DOC_ID: str = ""

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore",
    }

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if "ALLOWED_ORIGINS" in os.environ:
            self.ALLOWED_ORIGINS_RAW = os.environ["ALLOWED_ORIGINS"]


settings = Settings()
