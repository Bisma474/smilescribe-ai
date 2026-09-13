from tests.conftest import unique_email


def test_register_creates_a_real_profile(client):
    email = unique_email("register")
    r = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Testpass123!",
        "full_name": "New Dentist",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == email
    assert body["full_name"] == "New Dentist"
    assert body["is_active"] is True


def test_register_duplicate_email_is_rejected(client):
    email = unique_email("dupe")
    payload = {"email": email, "password": "Testpass123!", "full_name": "First"}
    r1 = client.post("/api/v1/auth/register", json=payload)
    assert r1.status_code == 201

    r2 = client.post("/api/v1/auth/register", json={**payload, "full_name": "Second"})
    assert r2.status_code == 400


def test_login_with_correct_credentials_returns_a_token(registered_user):
    assert "Authorization" in registered_user["headers"]
    assert registered_user["headers"]["Authorization"].startswith("Bearer ")


def test_login_with_wrong_password_is_rejected(client, registered_user):
    r = client.post("/api/v1/auth/login", json={
        "email": registered_user["email"],
        "password": "WrongPassword999!",
    })
    assert r.status_code == 401


def test_login_with_nonexistent_email_is_rejected(client):
    r = client.post("/api/v1/auth/login", json={
        "email": unique_email("nobody"),
        "password": "Whatever123!",
    })
    assert r.status_code == 401


def test_me_requires_authentication(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_me_returns_the_authenticated_users_profile(client, registered_user):
    r = client.get("/api/v1/auth/me", headers=registered_user["headers"])
    assert r.status_code == 200
    assert r.json()["email"] == registered_user["email"]


def test_me_rejects_a_garbage_token(client):
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401
