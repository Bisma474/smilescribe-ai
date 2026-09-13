"""Review API regression tests; no database or external AI calls."""
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.v1.endpoints import review
from app.core.dependencies import get_current_active_user

@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(review.router, prefix="/review")
    return TestClient(app)

@pytest.mark.parametrize("method,path,kwargs", [
    ("get", "/review/demo-transcript", {}),
    ("get", "/review/pageindex/tree", {}),
    ("post", "/review/pageindex/query", {"json": {"query": "test"}}),
    ("post", "/review/extract-chart", {"json": {"transcript": "test"}}),
    ("post", "/review/transcribe", {"files": {"file": ("test.wav", b"audio")}}),
])
def test_anonymous_requests_rejected(client, method, path, kwargs):
    assert getattr(client, method)(path, **kwargs).status_code == 401

@pytest.fixture
def signed_in(client, monkeypatch):
    client.app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id=1)
    monkeypatch.setattr(review.settings, "GROQ_API_KEY", "test-only")
    return client

def test_signed_in_review_still_works(signed_in, monkeypatch):
    findings = [{"finding": "test finding"}]
    extract = Mock(return_value=findings)
    monkeypatch.setattr(review, "extract_chart", extract)
    response = signed_in.post("/review/extract-chart", json={"transcript": "test transcript"})
    assert response.status_code == 200
    assert response.json() == {"entries": findings, "count": 1}
    extract.assert_called_once_with("test transcript", "")

@pytest.mark.parametrize("filename,body,status", [("test.exe", b"audio", 400), ("test.wav", b"", 400), ("test.wav", b"12345", 413)])
def test_invalid_upload_never_calls_provider(signed_in, monkeypatch, filename, body, status):
    monkeypatch.setattr(review, "MAX_AUDIO_BYTES", 4)
    provider = Mock()
    monkeypatch.setattr(review, "transcribe_audio", provider)
    response = signed_in.post("/review/transcribe", files={"file": (filename, body)})
    assert response.status_code == status
    provider.assert_not_called()

def test_valid_upload_preserves_response(signed_in, monkeypatch):
    provider = Mock(return_value={"transcript": "hello", "words": []})
    monkeypatch.setattr(review, "transcribe_audio", provider)
    response = signed_in.post("/review/transcribe", files={"file": ("test.webm", b"audio")})
    assert response.status_code == 200
    assert response.json()["transcript"] == "hello"
    provider.assert_called_once_with(b"audio", "test.webm")

@pytest.mark.parametrize("body", [{"transcript": ""}, {"transcript": "x" * 100001}, {"transcript": "x", "pageindex_context": "x" * 20001}])
def test_extraction_input_limits(signed_in, monkeypatch, body):
    provider = Mock()
    monkeypatch.setattr(review, "extract_chart", provider)
    assert signed_in.post("/review/extract-chart", json=body).status_code == 422
    provider.assert_not_called()
