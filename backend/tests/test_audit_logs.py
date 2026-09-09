from tests.conftest import unique_email


def test_create_and_list_own_audit_log(client, registered_user):
    r = client.post("/api/v1/audit-logs/", json={
        "action": "Access",
        "user_name": "Dr. Test",
        "details": "Accessed patient chart",
    }, headers=registered_user["headers"])
    assert r.status_code == 201

    r = client.get("/api/v1/audit-logs/", headers=registered_user["headers"])
    assert r.status_code == 200
    assert any(log["details"] == "Accessed patient chart" for log in r.json())


def test_audit_logs_are_scoped_to_the_owning_practice(client, registered_user):
    """This endpoint previously had no tenant scoping at all — every
    dentist could read every other practice's HIPAA access-log entries."""
    client.post("/api/v1/audit-logs/", json={
        "action": "Access", "user_name": "Dr. A", "details": "Practice A private note",
    }, headers=registered_user["headers"])

    other_email = unique_email("other-dentist")
    client.post("/api/v1/auth/register", json={
        "email": other_email, "password": "Testpass123!", "full_name": "Other Dentist",
    })
    r = client.post("/api/v1/auth/login", json={"email": other_email, "password": "Testpass123!"})
    other_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.get("/api/v1/audit-logs/", headers=other_headers)
    assert r.status_code == 200
    assert all(log["details"] != "Practice A private note" for log in r.json())


def test_audit_logs_require_authentication(client):
    r = client.get("/api/v1/audit-logs/")
    assert r.status_code == 401
