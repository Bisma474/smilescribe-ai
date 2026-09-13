"""Unit tests for long conversation chunking, absolute offset translation, and deduplication
in chart_extraction_service.py.
"""
from app.services.chart_extraction_service import (
    split_transcript_into_chunks,
    _deduplicate_findings,
    _validate_tooth_number,
    CHUNK_THRESHOLD_CHARS,
)


def test_short_transcript_not_chunked():
    short_text = "Dentist: Good morning Marcus. Patient: Hi doctor, I am ready."
    chunks = split_transcript_into_chunks(short_text)
    assert len(chunks) == 1
    assert chunks[0]["text"] == short_text
    assert chunks[0]["start_offset"] == 0
    assert chunks[0]["end_offset"] == len(short_text)


def test_long_transcript_chunk_boundaries_and_offsets():
    # Build a long transcript that exceeds CHUNK_THRESHOLD_CHARS
    sentence = "Dentist: Checking tooth 14 mesial surface for bleeding on probing. Patient: Okay doctor.\n"
    long_text = sentence * 60  # ~5,400 chars
    assert len(long_text) > CHUNK_THRESHOLD_CHARS

    chunks = split_transcript_into_chunks(long_text, target_size=2000, overlap=150)
    assert len(chunks) > 1

    # Verify that each chunk's slice matches master transcript
    for chunk in chunks:
        start = chunk["start_offset"]
        end = chunk["end_offset"]
        assert long_text[start:end] == chunk["text"]

    # Verify last chunk ends at full length
    assert chunks[-1]["end_offset"] == len(long_text)


def test_deduplicate_findings_removes_duplicates():
    transcript = "Tooth 14 has slight bleeding on probing."
    findings = [
        {
            "tooth_number": "14",
            "surface": "M",
            "finding": "Bleeding on probing",
            "char_offset_start": 0,
            "confidence": 100,
        },
        {
            "tooth_number": "14",
            "surface": "M",
            "finding": "Bleeding on probing",
            "char_offset_start": 5,  # Slight offset overlap from adjacent chunk
            "confidence": 95,
        },
        {
            "tooth_number": "19",
            "surface": "O",
            "finding": "Existing restoration",
            "char_offset_start": 200,
            "confidence": 100,
        },
    ]

    deduped = _deduplicate_findings(findings, transcript)
    assert len(deduped) == 2
    teeth = [f["tooth_number"] for f in deduped]
    assert teeth == ["14", "19"]


def test_validate_tooth_number_accepts_universal_and_all():
    e1 = {"tooth_number": "14"}
    _validate_tooth_number(e1)
    assert e1["tooth_number"] == "14"

    e2 = {"tooth_number": "ALL"}
    _validate_tooth_number(e2)
    assert e2["tooth_number"] == "ALL"

    e3 = {"tooth_number": "46"}  # FDI tooth number — invalid in Universal system
    _validate_tooth_number(e3)
    assert e3["tooth_number"] == ""
    assert e3["confidence"] == 0
    assert "unsupported tooth number" in e3["detail"]
