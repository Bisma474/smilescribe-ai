"""Shared test fixtures.

There is no separate local test database — the backend talks to a real
Supabase project (Postgres + Supabase Auth) for both dev and tests, same
as it always has. These tests exercise the actual app against whatever
project `backend/.env` points at, creating throwaway accounts/patients
with unique, randomly-suffixed identifiers per test run rather than
relying on fixtures or mocks. This mirrors how the app was manually
verified end-to-end throughout earlier branches.

Known limitation: rows created by test runs accumulate in that project
rather than being cleaned up afterward — acceptable for a dev/test
Supabase project, but this suite should never be pointed at a
production database.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def unique_email(prefix: str = "test") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}@example.com"


@pytest.fixture
def registered_user(client):
    """Registers and logs in a fresh throwaway dentist account, returning
    (email, password, auth_headers)."""
    email = unique_email()
    password = "Testpass123!"
    r = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "Test Dentist",
    })
    assert r.status_code == 201, r.text

    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]

    return {
        "email": email,
        "password": password,
        "headers": {"Authorization": f"Bearer {token}"},
    }
