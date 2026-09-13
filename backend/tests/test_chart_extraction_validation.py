import json
from app.services.chart_extraction_service import _parse_and_validate


def test_recovers_a_real_source_excerpt_for_a_paraphrased_quote():
    transcript = "The patient reports sensitivity in the lower right molar while brushing."
    raw = json.dumps({"findings": [{"tooth_number": "ALL", "finding": "Sensitivity", "detail": "Patient reports sensitivity in lower right molar", "verbatim_quote": "lower right tooth is sensitive", "confidence": 92}]})
    entry = _parse_and_validate(raw, transcript)[0]
    assert entry["verbatim_quote"] == transcript
    assert entry["char_offset_start"] == 0
    assert entry["confidence"] > 0
    assert entry["_evidence_recovered"] is True


def test_rejects_unsupported_universal_tooth_number():
    transcript = "Tooth forty-six is sensitive."
    raw = json.dumps({"findings": [{"tooth_number": "46", "finding": "Sensitivity", "detail": "Sensitivity", "verbatim_quote": transcript, "confidence": 93, "char_offset_start": 0}]})
    entry = _parse_and_validate(raw, transcript)[0]
    assert entry["tooth_number"] == ""
    assert entry["confidence"] == 0
    assert "Universal teeth must be 1-32" in entry["detail"]
