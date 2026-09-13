from datetime import datetime, timezone
from typing import Any


def build_patient_summary(ai_note: dict[str, Any], follow_up: dict[str, Any], opportunities: list[Any]) -> dict[str, Any]:
    sections = ai_note.get("sections", {}) if isinstance(ai_note, dict) else {}
    plan = str(sections.get("plan") or "").strip()
    instructions = str(sections.get("instructions") or "").strip()
    findings = str(sections.get("findings") or "").strip()
    next_steps = follow_up.get("next_steps", []) if isinstance(follow_up, dict) else []
    if not isinstance(next_steps, list):
        next_steps = []
    if not next_steps:
        next_steps = [str(item.get("description") or item.get("label") or "Review your care plan with the dental team.") for item in opportunities if isinstance(item, dict)][:3]
    return {
        "status": "draft",
        "sections": {
            "visit_summary": findings or "Your dental team reviewed your visit and discussed your oral-health needs.",
            "next_steps": next_steps,
            "care_instructions": instructions or plan or "Follow the care instructions discussed with your dental team.",
            "when_to_contact": "Contact the practice if you have questions, worsening symptoms, or concerns about your care plan.",
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }