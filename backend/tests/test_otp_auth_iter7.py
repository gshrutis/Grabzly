"""
Iteration 7 backend tests - Mobile OTP auth + regression check for /auth/me phone shape.

Tests:
- POST /api/auth/otp/request → { sent: true, demo_code: '123456' } and creates otp_codes record
- POST /api/auth/otp/verify with 123456 + name → new customer user, phone set, email null
- POST /api/auth/otp/verify same phone no name → SAME user id (upsert-by-phone)
- POST /api/auth/otp/verify wrong code → 401
- Token from otp/verify works for GET /api/auth/me and role-elevation via /merchant/onboard
- Regression: /auth/register + /auth/login (email+password) still work, /auth/me shape includes phone + email
"""
import os
import uuid
import pathlib

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(pathlib.Path("/app/frontend/.env"))
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


def _phone() -> str:
    # Unique-ish phone per test
    return "+1555" + str(uuid.uuid4().int)[:7]


def _email() -> str:
    return f"iter7_{uuid.uuid4().hex[:8]}@happyhour.io"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---------- OTP flow ---------------------------------------------------------
class TestOtpFlow:
    def test_otp_request_returns_demo_code(self, s):
        phone = _phone()
        r = s.post(f"{BASE}/api/auth/otp/request", json={"phone": phone}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("sent") is True
        assert body.get("demo_code") == "123456"

    def test_otp_verify_creates_new_customer(self, s):
        phone = _phone()
        # Prime the record
        s.post(f"{BASE}/api/auth/otp/request", json={"phone": phone}, timeout=15)
        r = s.post(
            f"{BASE}/api/auth/otp/verify",
            json={"phone": phone, "code": "123456", "name": "Iter7 Otp"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        u = body["user"]
        assert u["phone"] == phone
        assert u["email"] in (None, "")
        assert u["role"] == "customer"
        assert u["name"] == "Iter7 Otp"
        assert "id" in u and u["id"]

    def test_otp_verify_second_call_same_phone_is_upsert(self, s):
        phone = _phone()
        s.post(f"{BASE}/api/auth/otp/request", json={"phone": phone}, timeout=15)
        r1 = s.post(
            f"{BASE}/api/auth/otp/verify",
            json={"phone": phone, "code": "123456", "name": "First Name"},
            timeout=15,
        )
        assert r1.status_code == 200
        first_id = r1.json()["user"]["id"]

        # Second call w/o name — must return SAME user id (no duplicate)
        r2 = s.post(
            f"{BASE}/api/auth/otp/verify",
            json={"phone": phone, "code": "123456"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        second_id = r2.json()["user"]["id"]
        assert first_id == second_id
        # Name preserved from initial signup
        assert r2.json()["user"]["name"] == "First Name"

    def test_otp_verify_wrong_code_401(self, s):
        phone = _phone()
        s.post(f"{BASE}/api/auth/otp/request", json={"phone": phone}, timeout=15)
        r = s.post(
            f"{BASE}/api/auth/otp/verify",
            json={"phone": phone, "code": "000000"},
            timeout=15,
        )
        assert r.status_code == 401, r.text
        assert "Invalid or expired code" in r.text

    def test_otp_token_works_with_me_and_merchant_onboard(self, s):
        phone = _phone()
        s.post(f"{BASE}/api/auth/otp/request", json={"phone": phone}, timeout=15)
        r = s.post(
            f"{BASE}/api/auth/otp/verify",
            json={"phone": phone, "code": "123456", "name": "Iter7 Merch"},
            timeout=15,
        )
        assert r.status_code == 200
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        # GET /api/auth/me
        me = s.get(f"{BASE}/api/auth/me", headers=h, timeout=15)
        assert me.status_code == 200, me.text
        me_body = me.json()
        assert me_body["phone"] == phone
        assert me_body["role"] == "customer"
        # both keys present in shape
        assert "email" in me_body and "phone" in me_body

        # Role elevation via /merchant/onboard
        payload = {
            "name": f"Iter7 Bar {uuid.uuid4().hex[:6]}",
            "category": "bar",
            "sub_category": "cocktail",
            "address": "1 Test St, San Francisco, CA",
            "hours": "5pm-11pm",
            "phone": phone,
            "price_range": "$$",
            "description": "iter7 test bar",
            "lat": 37.7749,
            "lng": -122.4194,
        }
        onb = s.post(
            f"{BASE}/api/merchant/onboard", headers=h, json=payload, timeout=15
        )
        assert onb.status_code in (200, 201), onb.text

        me2 = s.get(f"{BASE}/api/auth/me", headers=h, timeout=15).json()
        assert me2["role"] == "merchant"


# ---------- Regression: email+password auth still returns 'phone' key --------
class TestEmailPasswordRegression:
    def test_register_login_me_shape(self, s):
        email = _email()
        pw = "Passw0rd!"
        r = s.post(
            f"{BASE}/api/auth/register",
            json={"email": email, "password": pw, "name": "Iter7 EMail"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        u = body["user"]
        # Shape includes phone key (may be None for email-signup)
        assert "phone" in u
        assert "email" in u
        assert u["email"] == email.lower()
        assert u["phone"] in (None, "")

        # Login again
        r2 = s.post(
            f"{BASE}/api/auth/login",
            json={"email": email, "password": pw},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        token = r2.json()["access_token"]
        me = s.get(
            f"{BASE}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        ).json()
        assert me["email"] == email.lower()
        assert "phone" in me

    def test_reset_password_still_works(self, s):
        email = _email()
        s.post(
            f"{BASE}/api/auth/register",
            json={"email": email, "password": "Passw0rd!", "name": "Reset User"},
            timeout=15,
        )
        r = s.post(
            f"{BASE}/api/auth/reset-password",
            json={"email": email, "new_password": "NewPassw0rd!"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("reset") is True
        # Old password fails
        bad = s.post(
            f"{BASE}/api/auth/login",
            json={"email": email, "password": "Passw0rd!"},
            timeout=15,
        )
        assert bad.status_code == 401
        # New works
        ok = s.post(
            f"{BASE}/api/auth/login",
            json={"email": email, "password": "NewPassw0rd!"},
            timeout=15,
        )
        assert ok.status_code == 200
