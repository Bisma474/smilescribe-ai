"""Unit tests for merge_with_transcript — the pure logic that combines
diarization speaker turns with ASR word timestamps into a speaker-labeled
transcript. Doesn't touch the actual pyannote pipeline (that needs a real
HF_TOKEN + accepted model license + real audio, so it's exercised manually/
in the live app, not in the test suite).

merge_with_transcript returns (transcript, speaker_count) — speaker_count
is how many distinct voices pyannote detected before any minor-speaker
folding, so callers can tell "only one voice recorded" (nothing to
diarize) apart from "we produced a two-speaker transcript"."""
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
    transcript, speaker_count = merge_with_transcript(turns, words)
    assert transcript == "Dentist: Good morning\nPatient: Pretty good\nDentist: Great"
    assert speaker_count == 2


def test_merge_returns_empty_string_when_no_turns():
    """Caller (session_pipeline._diarize_transcript) falls back to the
    plain ASR transcript when this returns "" — e.g. diarization was
    unavailable or produced no turns."""
    words = [{"word": "Hello", "start": 0.0, "end": 0.5}]
    assert merge_with_transcript([], words) == ("", 0)


def test_merge_returns_empty_string_when_no_words():
    turns = [{"start": 0.0, "end": 2.0, "speaker": "SPEAKER_00"}]
    assert merge_with_transcript(turns, []) == ("", 0)


def test_merge_returns_empty_string_for_a_single_speaker():
    """One voice for the whole recording means there's nothing to
    diarize — labeling every line "Dentist" would be a guess with zero
    evidence behind it, so this should fall back like the no-turns case
    rather than fabricate speaker labels."""
    turns = [{"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00"}]
    words = [{"word": "Hello", "start": 0.1, "end": 0.5}]
    transcript, speaker_count = merge_with_transcript(turns, words)
    assert transcript == ""
    assert speaker_count == 1


def test_merge_assigns_words_to_nearest_turn_in_small_gaps():
    """A word whose timestamp falls in a small gap between two turns
    (pyannote turns rarely cover every millisecond exactly) should still
    be attributed to the closest turn rather than dropped."""
    turns = [
        {"start": 0.0, "end": 1.0, "speaker": "SPEAKER_00"},
        {"start": 1.2, "end": 2.0, "speaker": "SPEAKER_01"},
    ]
    words = [{"word": "um", "start": 1.05, "end": 1.1}]  # falls in the 1.0-1.2 gap
    transcript, _ = merge_with_transcript(turns, words)
    assert "um" in transcript


def test_merge_folds_a_third_speaker_into_the_nearest_main_speaker():
    """SPEAKER_LABEL_MAP only defines two labels (Dentist/Patient). A
    third distinct voice (e.g. a hygienist, or a pyannote misfire) is
    folded into whichever of the two main speakers (ranked by total
    speaking time) it sits temporally closest to, rather than leaking a
    raw "Speaker 3" label into the transcript the clinician reads."""
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
    transcript, speaker_count = merge_with_transcript(turns, words)
    # SPEAKER_02's turn is closer in time to SPEAKER_01's than SPEAKER_00's,
    # so it's folded into SPEAKER_01 ("Patient") and merges into one line.
    assert transcript == "Dentist: one\nPatient: two three"
    assert "Speaker 3" not in transcript
    assert speaker_count == 3


def test_merge_smooths_spurious_short_turns():
    """A sub-second turn sandwiched between two longer turns of the other
    speaker (a cough, a breath, cross-talk bleed picked up by pyannote)
    should be folded into a neighbor rather than fragmenting the
    transcript into single-word speaker-flipping lines."""
    turns = [
        {"start": 0.0, "end": 2.0, "speaker": "SPEAKER_00"},
        {"start": 2.0, "end": 2.1, "speaker": "SPEAKER_01"},  # 0.1s misfire
        {"start": 2.1, "end": 4.0, "speaker": "SPEAKER_00"},
    ]
    words = [
        {"word": "Good", "start": 0.1, "end": 0.4},
        {"word": "morning", "start": 0.4, "end": 0.9},
        {"word": "today", "start": 2.05, "end": 2.15},
        {"word": "sir", "start": 2.2, "end": 2.5},
    ]
    transcript, speaker_count = merge_with_transcript(turns, words)
    # The misfire gets folded away entirely, leaving one real speaker for
    # the whole recording — correctly treated the same as "only one
    # speaker detected" (see test_merge_returns_empty_string_for_a_single_speaker)
    # rather than flipping speaker for the single misfired word.
    assert transcript == ""
    assert speaker_count == 1
