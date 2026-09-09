def test_create_and_list_patient(client, registered_user):
    r = client.post("/api/v1/patients/", json={
        "first_name": "Jane",
        "last_name": "Doe",
    }, headers=registered_user["headers"])
    assert r.status_code == 201
    patient = r.json()
    assert patient["first_name"] == "Jane"
    assert patient["is_active"] is True

    r = client.get("/api/v1/patients/", headers=registered_user["headers"])
    assert r.status_code == 200
    assert any(p["id"] == patient["id"] for p in r.json())


def test_get_patient_by_id(client, registered_user):
    r = client.post("/api/v1/patients/", json={"first_name": "Sam", "last_name": "Lee"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]

    r = client.get(f"/api/v1/patients/{patient_id}", headers=registered_user["headers"])
    assert r.status_code == 200
    assert r.json()["last_name"] == "Lee"


def test_get_nonexistent_patient_returns_404(client, registered_user):
    r = client.get("/api/v1/patients/999999999", headers=registered_user["headers"])
    assert r.status_code == 404


def test_patient_list_and_get_are_scoped_to_the_owning_practice(client, registered_user):
    """A second dentist must not be able to see or fetch the first
    dentist's patients by ID — this was a real, previously-fixed IDOR."""
    r = client.post("/api/v1/patients/", json={"first_name": "Private", "last_name": "Patient"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]

    from tests.conftest import unique_email
    other_email = unique_email("other-dentist")
    client.post("/api/v1/auth/register", json={
        "email": other_email, "password": "Testpass123!", "full_name": "Other Dentist",
    })
    r = client.post("/api/v1/auth/login", json={"email": other_email, "password": "Testpass123!"})
    other_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.get(f"/api/v1/patients/{patient_id}", headers=other_headers)
    assert r.status_code == 404

    r = client.get("/api/v1/patients/", headers=other_headers)
    assert all(p["id"] != patient_id for p in r.json())


def test_update_patient(client, registered_user):
    r = client.post("/api/v1/patients/", json={"first_name": "Old", "last_name": "Name"},
                     headers=registered_user["headers"])
    patient_id = r.json()["id"]

    r = client.put(f"/api/v1/patients/{patient_id}", json={"first_name": "New"},
                    headers=registered_user["headers"])
    assert r.status_code == 200
    assert r.json()["first_name"] == "New"
    assert r.json()["last_name"] == "Name"


def test_patients_require_authentication(client):
    r = client.get("/api/v1/patients/")
    assert r.status_code == 401
