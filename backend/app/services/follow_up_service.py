def build_follow_up_draft(patient_name: str, opportunities: list[dict]) -> dict:
    items = [str(item.get("desc") or item.get("detail") or "").strip() for item in opportunities if item]
    items = [item for item in items if item]
    if items:
        message = "Hello " + patient_name + ", following your dental visit, please contact us to discuss or schedule: " + "; ".join(items[:3]) + "."
    else:
        message = "Hello " + patient_name + ", please contact our office if you have questions after your recent dental visit."
    return {"status": "draft", "message": message, "source": "visit follow-up", "requires_clinician_review": True}