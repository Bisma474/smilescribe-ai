from app.services.session_pipeline import _diarize_transcript, _label_for_display


def test_partial_diarization_never_replaces_clean_transcript(monkeypatch):
    monkeypatch.setattr("app.services.session_pipeline.diarize_audio", lambda _: [{"start": 0, "end": 1, "speaker": "SPEAKER_00"}, {"start": 1, "end": 2, "speaker": "SPEAKER_01"}])
    monkeypatch.setattr("app.services.session_pipeline.merge_with_transcript", lambda _turns, _words: ("Dentist: hello", 2))
    words = [{"word": "hello"}, {"word": "complete"}, {"word": "transcript"}]
    transcript, status = _diarize_transcript(b"audio", "test.wav", words, "hello complete transcript")
    assert transcript == "hello complete transcript"
    assert status == "unavailable"


def test_text_label_fallback_preserves_transcript_words(monkeypatch):
    monkeypatch.setattr("app.services.session_pipeline._diarize_transcript", lambda *_: ("Hello. How are you?", "unavailable"))
    monkeypatch.setattr("app.services.session_pipeline.label_transcript_roles", lambda _: "Dentist: Hello.\nPatient: How are you?")
    transcript, status = _label_for_display(b"audio", "test.wav", [], "Hello. How are you?")
    assert transcript == "Dentist: Hello.\nPatient: How are you?"
    assert status == "ai_assigned"
