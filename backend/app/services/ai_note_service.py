import json
from groq import Groq
from app.core.config import settings

def generate_visit_note(transcript: str, findings: list[dict]) -> dict:
    keys = ("chief_complaint", "findings", "assessment", "plan", "instructions")
    fallback = {"chief_complaint": "Not documented", "findings": "; ".join(f"{item.get('tooth','')}: {item.get('label','')}" for item in findings[:8]) or "No validated findings documented.", "assessment": "Requires clinician review.", "plan": "Not documented", "instructions": "Not documented"}
    if not transcript or not settings.GROQ_API_KEY:
        return {"status": "draft", "sections": fallback, "source": "fallback"}
    prompt = "Create concise dental visit-note JSON with keys chief_complaint, findings, assessment, plan, instructions. Use only supplied transcript and findings. Write Not documented when absent. Never invent treatment, diagnosis, tooth, medication, or date."
    try:
        client = Groq(api_key=settings.GROQ_API_KEY, timeout=45.0)
        response = client.chat.completions.create(model="openai/gpt-oss-120b", messages=[{"role":"system","content":prompt},{"role":"user","content":json.dumps({"transcript":transcript,"findings":findings})}], response_format={"type":"json_object"}, temperature=0, max_completion_tokens=1200, reasoning_effort="low")
        sections = json.loads(response.choices[0].message.content or "{}")
        return {"status":"draft","sections":{key:str(sections.get(key) or "Not documented") for key in keys},"source":"ai"}
    except Exception:
        return {"status":"draft","sections":fallback,"source":"fallback"}