def derive_risk_flags(entries: list[dict], medications_allergies: dict | None) -> list[dict]:
    text = " ".join((str(item.get("label") or "") + " " + str(item.get("detail") or "")) for item in entries).lower()
    flags = []
    if any(term in text for term in ("bleeding", "gingivitis", "periodontitis", "pocket")):
        flags.append({"level": "review", "label": "Periodontal risk", "reason": "Transcript findings mention periodontal indicators."})
    if any(term in text for term in ("caries", "decay", "cavity", "lesion")):
        flags.append({"level": "review", "label": "Caries risk", "reason": "Transcript findings mention caries-related indicators."})
    allergies = (medications_allergies or {}).get("allergies") or []
    if allergies:
        flags.append({"level": "review", "label": "Reported allergy", "reason": "Confirm reported allergy: " + ", ".join(allergies) + "."})
    return flags