import re

MEDICATIONS = ("amoxicillin", "penicillin", "ibuprofen", "acetaminophen", "aspirin", "warfarin", "metformin", "lisinopril", "clindamycin", "lidocaine", "articaine")
ALLERGY_PATTERN = re.compile(r"(?:allerg(?:y|ic)\s+to|allergic\s+to)\s+([a-zA-Z][a-zA-Z -]{1,40})", re.I)

def extract_medications_allergies(transcript: str) -> dict:
    text = transcript.lower()
    medications = [name for name in MEDICATIONS if re.search(r"\b" + re.escape(name) + r"\b", text)]
    allergies = []
    for match in ALLERGY_PATTERN.finditer(transcript):
        value = match.group(1).strip(" .,;:")
        if value and value.lower() not in ("anything", "nothing", "none"):
            allergies.append(value)
    return {"medications": medications, "allergies": list(dict.fromkeys(allergies)), "status": "needs_clinician_confirmation"}