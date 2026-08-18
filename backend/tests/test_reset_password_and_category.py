"""
Iteration 5 backend tests
- POST /api/auth/reset-password (happy + error paths)
- GET /api/deals?category=cafe (category filter accuracy)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env explicitly (public preview URL)
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def registered_user(api):
    """Create a fresh user for reset-password tests."""
    email = f"test_reset_{uuid.uuid4().hex[:8]}@happyhour.io"
    password = "OldPass123!"
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": password, "name": "Reset Test User",
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return {"email": email, "old_password": password}


# ---------------------- reset-password ----------------------

class TestResetPassword:
    def test_reset_happy_path(self, api, registered_user):
        new_password = "NewPass456!"
        r = api.post(f"{BASE_URL}/api/auth/reset-password", json={
            "email": registered_user["email"],
            "new_password": new_password,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("reset") is True

        # login with OLD password should now 401
        r_old = api.post(f"{BASE_URL}/api/auth/login", json={
            "email": registered_user["email"],
            "password": registered_user["old_password"],
        })
        assert r_old.status_code == 401, f"expected 401 with old password, got {r_old.status_code}"

        # login with NEW password should 200
        r_new = api.post(f"{BASE_URL}/api/auth/login", json={
            "email": registered_user["email"],
            "password": new_password,
        })
        assert r_new.status_code == 200, r_new.text
        data = r_new.json()
        assert "access_token" in data
        assert data["user"]["email"] == registered_user["email"]

        # store new password so subsequent tests can rely on it if needed
        registered_user["new_password"] = new_password

    def test_reset_unknown_email_404(self, api):
        r = api.post(f"{BASE_URL}/api/auth/reset-password", json={
            "email": f"nobody_{uuid.uuid4().hex[:8]}@nowhere.example",
            "new_password": "Whatever123!",
        })
        assert r.status_code == 404, r.text
        detail = r.json().get("detail", "")
        assert "No account" in detail

    def test_reset_short_password_422(self, api, registered_user):
        r = api.post(f"{BASE_URL}/api/auth/reset-password", json={
            "email": registered_user["email"],
            "new_password": "12345",  # 5 chars — below min_length=6
        })
        assert r.status_code == 422, r.text

    def test_reset_missing_email_422(self, api):
        r = api.post(f"{BASE_URL}/api/auth/reset-password", json={
            "new_password": "Whatever123!",
        })
        assert r.status_code == 422


# ---------------------- deals category filter ----------------------

class TestDealsCategoryFilter:
    def test_category_cafe_returns_only_cafe(self, api):
        r = api.get(f"{BASE_URL}/api/deals?category=cafe")
        assert r.status_code == 200, r.text
        deals = r.json()
        assert isinstance(deals, list)
        # must have at least one cafe deal from the auto-seed (cafe merchant)
        assert len(deals) > 0, "expected at least one cafe deal from auto-seed"
        for d in deals:
            assert d.get("category") == "cafe", (
                f"non-cafe deal leaked in cafe filter: id={d.get('id')} "
                f"category={d.get('category')} title={d.get('title')}"
            )

    def test_category_food_returns_only_food(self, api):
        r = api.get(f"{BASE_URL}/api/deals?category=food")
        assert r.status_code == 200
        deals = r.json()
        assert isinstance(deals, list)
        for d in deals:
            assert d.get("category") == "food"

    def test_no_category_returns_multi_category(self, api):
        r = api.get(f"{BASE_URL}/api/deals")
        assert r.status_code == 200
        deals = r.json()
        assert isinstance(deals, list)
        assert len(deals) > 0
        cats = {d.get("category") for d in deals}
        # auto-seed puts 6 merchants across food/grocery/clothing/kitchenware/cafe/bakery
        # so multiple categories should be present in the unfiltered list
        assert len(cats) >= 2, f"expected multiple categories in unfiltered list, got: {cats}"

    def test_category_bakery_only_bakery(self, api):
        r = api.get(f"{BASE_URL}/api/deals?category=bakery")
        assert r.status_code == 200
        for d in r.json():
            assert d.get("category") == "bakery"
