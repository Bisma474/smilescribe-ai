"""Unit tests for merge_with_transcript — the pure logic that combines
diarization speaker turns with ASR word timestamps into a speaker-labeled
transcript. Doesn't touch the actual pyannote pipeline (that needs a real
HF_TOKEN + accepted model license + real audio, so it's exercised manually/
in the live app, not in the test suite)."""
from app.services.diarization_service import merge_with_transcript


def test_merge_produces_alternating_speaker_lines():
    turns = [
        {"start": 0.0, "end": 2.5, "speaker": "SPEAKER_00"},
        {"start": 2.5, "end": 5.0, "speaker": "SPEAKER_01"},
        {"start": 5.0, "end": 7.0, "speaker": "SPEAKER_00"},
    ]
    words = [
        {"word": "Good", "start": 0.1, "end": 0.4},
        {"word": "morning", "start": 0.4, "end": 0.9},
        {"word": "Pretty", "start": 2.6, "end": 3.0},
        {"word": "good", "start": 3.0, "end": 3.3},
        {"word": "Great", "start": 5.2, "end": 5.5},
    ]
    result = merge_with_transcript(turns, words)
    assert result == "Dentist: Good morning\nPatient: Pretty good\nDentist: Great"


def test_merge_returns_empty_string_when_no_turns():
    """Caller (session_pipeline._diarize_transcript) falls back to the
    plain ASR transcript when this returns "" — e.g. diarization was
    unavailable or produced no turns."""
    words = [{"word": "Hello", "start": 0.0, "end": 0.5}]
    assert merge_with_transcript([], words) == ""


def test_merge_returns_empty_string_when_no_words():
    turns = [{"start": 0.0, "end": 2.0, "speaker": "SPEAKER_00"}]
    assert merge_with_transcript(turns, []) == ""


def test_merge_assigns_words_to_nearest_turn_in_small_gaps():
    """A word whose timestamp falls in a small gap between two turns
    (pyannote turns rarely cover every millisecond exactly) should still
    be attributed to the closest turn rather than dropped."""
    turns = [
        {"start": 0.0, "end": 1.0, "speaker": "SPEAKER_00"},
        {"start": 1.2, "end": 2.0, "speaker": "SPEAKER_01"},
    ]
    words = [{"word": "um", "start": 1.05, "end": 1.1}]  # falls in the 1.0-1.2 gap
    result = merge_with_transcript(turns, words)
    assert "um" in result


def test_merge_falls_back_to_raw_label_for_a_third_speaker():
    """SPEAKER_LABEL_MAP only defines two labels (Dentist/Patient) — a
    third distinct voice (e.g. a hygienist) shouldn't crash, just fall
    back to a generic label."""
    turns = [
        {"start": 0.0, "end": 1.0, "speaker": "SPEAKER_00"},
        {"start": 1.0, "end": 2.0, "speaker": "SPEAKER_01"},
        {"start": 2.0, "end": 3.0, "speaker": "SPEAKER_02"},
    ]
    words = [
        {"word": "one", "start": 0.1, "end": 0.5},
        {"word": "two", "start": 1.1, "end": 1.5},
        {"word": "three", "start": 2.1, "end": 2.5},
    ]
    result = merge_with_transcript(turns, words)
    assert "Dentist: one" in result
    assert "Patient: two" in result
    assert "Speaker 3: three" in result
