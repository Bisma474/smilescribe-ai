def test_dashboard_stats_for_a_brand_new_practice(client, registered_user):
    r = client.get("/api/v1/patients/dashboard-stats", headers=registered_user["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "today_visits": 0,
        "pending_review": 0,
        "revenue_suggested": 0,
        "active_patients": 0,
        "recent_sessions": [],
    }


def test_dashboard_stats_counts_active_patients(client, registered_user):
    client.post("/api/v1/patients/", json={"first_name": "A", "last_name": "One"},
                headers=registered_user["headers"])
    client.post("/api/v1/patients/", json={"first_name": "B", "last_name": "Two"},
                headers=registered_user["headers"])

    r = client.get("/api/v1/patients/dashboard-stats", headers=registered_user["headers"])
    assert r.status_code == 200
    assert r.json()["active_patients"] == 2


def test_dashboard_stats_are_scoped_to_the_owning_practice(client, registered_user):
    """Another dentist's patients must never inflate this practice's stats."""
    client.post("/api/v1/patients/", json={"first_name": "Mine", "last_name": "Patient"},
                 headers=registered_user["headers"])

    from tests.conftest import unique_email
    other_email = unique_email("other-dentist")
    client.post("/api/v1/auth/register", json={
        "email": other_email, "password": "Testpass123!", "full_name": "Other Dentist",
    })
    r = client.post("/api/v1/auth/login", json={"email": other_email, "password": "Testpass123!"})
    other_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    client.post("/api/v1/patients/", json={"first_name": "Theirs", "last_name": "Patient"},
                 headers=other_headers)

    r = client.get("/api/v1/patients/dashboard-stats", headers=other_headers)
    assert r.json()["active_patients"] == 1


def test_dashboard_stats_requires_authentication(client):
    r = client.get("/api/v1/patients/dashboard-stats")
    assert r.status_code == 401
