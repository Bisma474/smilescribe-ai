from tests.conftest import unique_email


def _second_dentist_headers(client):
    email = unique_email("other-dentist")
    client.post("/api/v1/auth/register", json={
        "email": email, "password": "Testpass123!", "full_name": "Other Dentist",
    })
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "Testpass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_get_session_creates_an_empty_session_with_no_fake_data(client, registered_user):
    """GET /session/{patient_id} used to seed a brand-new patient's first
    session with a hardcoded demo transcript, findings, and $272 in fake
    billing recommendations. It must now return a real, honestly-empty
    session instead."""
    r = client.post("/api/v1/patients/", json={"first_name": "New", "last_name": "Patient"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]

    r = client.get(f"/api/v1/transcription/session/{patient_id}", headers=registered_user["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["transcript"] is None
    assert body["clinical_entries"] is None
    assert body["summary_report"] is None
    assert body["perio_data"] is None


def test_get_session_for_nonexistent_patient_is_404(client, registered_user):
    r = client.get("/api/v1/transcription/session/999999999", headers=registered_user["headers"])
    assert r.status_code == 404


def test_get_session_is_scoped_to_the_owning_practice(client, registered_user):
    """A second dentist must not be able to read a session for a patient
    they don't own — this endpoint previously had no ownership check at
    all."""
    r = client.post("/api/v1/patients/", json={"first_name": "Owned", "last_name": "ByFirst"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]
    # Trigger session creation as the owning dentist.
    client.get(f"/api/v1/transcription/session/{patient_id}", headers=registered_user["headers"])

    other_headers = _second_dentist_headers(client)
    r = client.get(f"/api/v1/transcription/session/{patient_id}", headers=other_headers)
    assert r.status_code == 404


def test_update_session_is_scoped_to_the_owning_practice(client, registered_user):
    """A second dentist must not be able to overwrite another practice's
    session by guessing its session_id — previously unrestricted."""
    r = client.post("/api/v1/patients/", json={"first_name": "Owned", "last_name": "ByFirst"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]
    session = client.get(f"/api/v1/transcription/session/{patient_id}",
                          headers=registered_user["headers"]).json()

    other_headers = _second_dentist_headers(client)
    r = client.put(f"/api/v1/notes/session/{session['id']}", json={"transcript": "hijacked"},
                    headers=other_headers)
    assert r.status_code == 404

    # Confirm the owning dentist's data was untouched.
    r = client.get(f"/api/v1/transcription/session/{patient_id}", headers=registered_user["headers"])
    assert r.json()["transcript"] is None


def test_update_session_persists_for_the_owning_dentist(client, registered_user):
    r = client.post("/api/v1/patients/", json={"first_name": "Owned", "last_name": "ByFirst"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]
    session = client.get(f"/api/v1/transcription/session/{patient_id}",
                          headers=registered_user["headers"]).json()

    r = client.put(f"/api/v1/notes/session/{session['id']}", json={"transcript": "real transcript"},
                    headers=registered_user["headers"])
    assert r.status_code == 200
    assert r.json()["transcript"] == "real transcript"


def test_recording_endpoint_rejects_a_patient_the_dentist_does_not_own(client, registered_user):
    other_headers = _second_dentist_headers(client)
    r = client.post("/api/v1/patients/", json={"first_name": "Not", "last_name": "Theirs"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]

    r = client.post(
        f"/api/v1/transcription/session/{patient_id}/record",
        files={"file": ("recording.wav", b"fake-audio-bytes", "audio/wav")},
        headers=other_headers,
    )
    assert r.status_code == 404


def test_session_history_lists_multiple_visits_most_recent_first(client, registered_user):
    """A second recording used to overwrite the patient's only session row
    in place, destroying the first visit's data. Each recording is now its
    own row, and the history endpoint should list all of them."""
    r = client.post("/api/v1/patients/", json={"first_name": "Multi", "last_name": "Visit"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]

    first = client.post(
        f"/api/v1/transcription/session/{patient_id}/record",
        files={"file": ("recording.wav", b"fake-audio-bytes-1", "audio/wav")},
        headers=registered_user["headers"],
    ).json()
    second = client.post(
        f"/api/v1/transcription/session/{patient_id}/record",
        files={"file": ("recording.wav", b"fake-audio-bytes-2", "audio/wav")},
        headers=registered_user["headers"],
    ).json()
    assert first["id"] != second["id"]

    r = client.get(f"/api/v1/transcription/session/{patient_id}/history",
                    headers=registered_user["headers"])
    assert r.status_code == 200
    ids = [s["id"] for s in r.json()]
    assert first["id"] in ids
    assert second["id"] in ids
    assert ids.index(second["id"]) < ids.index(first["id"])  # most recent first


def test_session_history_is_scoped_to_the_owning_practice(client, registered_user):
    r = client.post("/api/v1/patients/", json={"first_name": "Owned", "last_name": "History"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]
    client.get(f"/api/v1/transcription/session/{patient_id}", headers=registered_user["headers"])

    other_headers = _second_dentist_headers(client)
    r = client.get(f"/api/v1/transcription/session/{patient_id}/history", headers=other_headers)
    assert r.status_code == 404


def test_get_session_by_id_is_scoped_to_the_owning_practice(client, registered_user):
    r = client.post("/api/v1/patients/", json={"first_name": "Owned", "last_name": "ById"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]
    session = client.get(f"/api/v1/transcription/session/{patient_id}",
                          headers=registered_user["headers"]).json()

    other_headers = _second_dentist_headers(client)
    r = client.get(f"/api/v1/transcription/session/by-id/{session['id']}", headers=other_headers)
    assert r.status_code == 404

    r = client.get(f"/api/v1/transcription/session/by-id/{session['id']}", headers=registered_user["headers"])
    assert r.status_code == 200
    assert r.json()["id"] == session["id"]


def test_recording_endpoint_rejects_an_unsupported_file_extension(client, registered_user):
    r = client.post("/api/v1/patients/", json={"first_name": "Test", "last_name": "Patient"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]

    r = client.post(
        f"/api/v1/transcription/session/{patient_id}/record",
        files={"file": ("recording.exe", b"not-audio", "application/octet-stream")},
        headers=registered_user["headers"],
    )
    assert r.status_code == 400
