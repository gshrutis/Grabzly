"""Iter 11 — SDK 57 upgrade smoke tests.

Runs against the public EXPO_BACKEND_URL (through Kubernetes ingress) so we
verify the same routes the mobile app hits after the Expo 54 → 57 bump.
Scope is deliberately small — deals, OTP auth, notifications gating.
"""

import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or (
    "https://local-deals-now.preview.emergentagent.com"
)

TEST_PHONE = "+919876543299"
TEST_OTP = "123456"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Deals (guest browsing) ------------------------------------------------
class TestDealsPublic:
    def test_get_deals_public_returns_list(self, api):
        r = api.get(f"{BASE_URL}/api/deals", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list), f"expected list, got {type(data)}"
        assert len(data) > 0, "expected seeded deals to be present"
        # Ensure ObjectID never leaks
        for d in data[:3]:
            assert "_id" not in d
            assert "id" in d
            assert "merchant_id" in d


# --- OTP auth --------------------------------------------------------------
class TestOtpAuth:
    def test_request_and_verify_otp_returns_jwt(self, api):
        # request
        r1 = api.post(
            f"{BASE_URL}/api/auth/otp/request",
            json={"phone": TEST_PHONE},
            timeout=30,
        )
        assert r1.status_code == 200, r1.text

        # verify
        r2 = api.post(
            f"{BASE_URL}/api/auth/otp/verify",
            json={"phone": TEST_PHONE, "code": TEST_OTP},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        payload = r2.json()
        # standard shape from prior iters: { token/access_token, user }
        token = (
            payload.get("token")
            or payload.get("access_token")
            or payload.get("jwt")
        )
        assert token, f"no token in response: {payload}"
        assert "user" in payload
        assert payload["user"].get("phone") in (TEST_PHONE, TEST_PHONE.lstrip("+"))
        # stash on the class for downstream tests
        pytest.iter11_token = token  # type: ignore[attr-defined]


# --- Notifications gating --------------------------------------------------
class TestNotificationsGating:
    def test_notifications_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/notifications", timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_unread_count_with_token(self, api):
        token = getattr(pytest, "iter11_token", None)
        if not token:
            pytest.skip("OTP verify did not produce a token")
        r = api.get(
            f"{BASE_URL}/api/notifications/unread-count",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "count" in body
        assert isinstance(body["count"], int)
        assert body["count"] == 0, f"expected 0 for a fresh user, got {body}"
