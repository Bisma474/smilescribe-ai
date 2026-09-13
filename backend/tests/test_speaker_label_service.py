from types import SimpleNamespace
from app.services import speaker_label_service


def _install_fake_groq(monkeypatch, content):
    class FakeCompletion:
        def create(self, **_kwargs):
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])
    class FakeGroq:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(completions=FakeCompletion())
    monkeypatch.setattr(speaker_label_service, "Groq", FakeGroq)
    monkeypatch.setattr(speaker_label_service.settings, "GROQ_API_KEY", "test")


def test_role_segments_preserve_every_original_word(monkeypatch):
    _install_fake_groq(monkeypatch, '{"segments":[{"speaker":"Dentist","text":"Hello, John."},{"speaker":"Patient","text":"I am nervous."}]}')
    result = speaker_label_service.label_transcript_roles("Hello, John. I am nervous.")
    assert result == "Dentist: Hello, John.\nPatient: I am nervous."


def test_rejects_a_model_response_that_omits_text(monkeypatch):
    _install_fake_groq(monkeypatch, '{"segments":[{"speaker":"Dentist","text":"Hello, John."}]}')
    assert speaker_label_service.label_transcript_roles("Hello, John. I am nervous.") is None


def test_rejects_a_model_response_that_rewrites_text(monkeypatch):
    _install_fake_groq(monkeypatch, '{"segments":[{"speaker":"Dentist","text":"Hello John."},{"speaker":"Patient","text":"I am nervous."}]}')
    assert speaker_label_service.label_transcript_roles("Hello, John. I am nervous.") is None
