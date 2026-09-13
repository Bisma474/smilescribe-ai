import logging
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from app.core.dependencies import get_current_active_user
from app.services.synthetic_data import SYNTHETIC_TRANSCRIPT
from app.services.asr_service import transcribe_audio
from app.services.pageindex_service import query_context, get_tree
from app.services.chart_extraction_service import extract_chart
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(get_current_active_user)])
MAX_AUDIO_BYTES = 25 * 1024 * 1024
ALLOWED_AUDIO_EXTENSIONS = {"wav", "mp3", "m4a", "webm", "ogg"}


class PageIndexQuery(BaseModel):
    query: str = Field(min_length=1, max_length=4000)


class ExtractChartRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=100000)
    pageindex_context: str = Field(default="", max_length=20000)


@router.get("/demo-transcript")
async def get_demo_transcript():
    return {"transcript": SYNTHETIC_TRANSCRIPT}


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    if not settings.GROQ_API_KEY:
        return {"transcript": SYNTHETIC_TRANSCRIPT, "words": [], "note": "No GROQ_API_KEY set — returned demo transcript instead"}
    extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if extension not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported audio format")
    contents = bytearray()
    while chunk := await file.read(1024 * 1024):
        if len(contents) + len(chunk) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio file too large (max 25 MB)")
        contents.extend(chunk)
    if not contents:
        raise HTTPException(status_code=400, detail="Empty audio file")
    result = await run_in_threadpool(transcribe_audio, bytes(contents), file.filename)
    return result


@router.post("/pageindex/query")
def query_pageindex(body: PageIndexQuery):
    try:
        context = query_context(body.query)
        return {"query": body.query, "context": context}
    except Exception as e:
        logger.warning(f"PageIndex query failed (using mock): {e}")
        return {"query": body.query, "context": f"Mock context for '{body.query}'. PageIndex Cloud unavailable (no API key configured).", "note": "mock"}


@router.get("/pageindex/tree")
def get_pageindex_tree():
    try:
        tree = get_tree()
        return {"tree": tree}
    except Exception as e:
        logger.warning(f"PageIndex tree failed (using mock): {e}")
        from app.services.pageindex_service import MOCK_TREE
        return {"tree": MOCK_TREE, "note": "mock — PageIndex Cloud unavailable"}


@router.post("/extract-chart")
def extract_chart_endpoint(body: ExtractChartRequest):
    if not settings.GROQ_API_KEY:
        return chart_extraction_fallback(body.transcript)
    try:
        entries = extract_chart(body.transcript, body.pageindex_context)
        return {"entries": entries, "count": len(entries)}
    except Exception as e:
        logger.warning(f"Chart extraction failed (using fallback): {e}")
        return chart_extraction_fallback(body.transcript)


def chart_extraction_fallback(transcript: str):
    findings = [
        {"tooth_number": "14", "surface": "M", "finding": "Bleeding on probing", "detail": "Slight bleeding at mesial of tooth 14", "verbatim_quote": "slight bleeding on probing at fourteen mesial", "char_offset_start": -1, "char_offset_end": -1, "confidence": 91, "pageindex_context": "Periodontal > Probing Depths > Bleeding"},
        {"tooth_number": "19", "surface": "O", "finding": "Existing restoration", "detail": "Occlusal composite restoration with intact margins", "verbatim_quote": "existing occlusal composite restoration", "char_offset_start": -1, "char_offset_end": -1, "confidence": 95, "pageindex_context": "Restorative > Existing Restorations"},
        {"tooth_number": "30", "surface": "O", "finding": "Possible caries", "detail": "Suspicious occlusal carious lesion", "verbatim_quote": "suspicious carious lesion on tooth thirty", "char_offset_start": -1, "char_offset_end": -1, "confidence": 88, "pageindex_context": "Restorative > Caries Classification"},
        {"tooth_number": "ALL", "surface": "All", "finding": "Fluoride varnish", "detail": "Fluoride varnish planned after scaling", "verbatim_quote": "apply fluoride varnish on all surfaces", "char_offset_start": -1, "char_offset_end": -1, "confidence": 97, "pageindex_context": "Preventive > Fluoride Treatment"},
    ]
    return {"entries": findings, "count": len(findings), "note": "mock — no GROQ_API_KEY set"}
