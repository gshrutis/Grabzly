"""Iteration 8 — Backend regression tests
Focus: GET /api/deals radius filtering (max_km) + mock OTP flow.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://local-deals-now.preview.emergentagent.com").rstrip("/")
SF_LAT = 37.7749
SF_LNG = -122.4194


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ==================== RADIUS FILTERING ====================
class TestDealsRadiusFilter:
    def test_deals_no_geo_params_returns_list(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/deals", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0, "expected seeded deals to be present"

    def test_deals_wide_radius_returns_all(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/deals",
                           params={"lat": SF_LAT, "lng": SF_LNG, "max_km": 999},
                           timeout=30)
        assert r.status_code == 200
        deals = r.json()
        assert isinstance(deals, list)
        assert len(deals) > 0
        for d in deals:
            assert "distance_km" in d, f"deal {d.get('id')} missing distance_km"

    def test_deals_small_radius_filters(self, api_client):
        r_wide = api_client.get(f"{BASE_URL}/api/deals",
                                params={"lat": SF_LAT, "lng": SF_LNG, "max_km": 999})
        r_narrow = api_client.get(f"{BASE_URL}/api/deals",
                                  params={"lat": SF_LAT, "lng": SF_LNG, "max_km": 0.5})
        assert r_wide.status_code == 200 and r_narrow.status_code == 200
        wide = r_wide.json()
        narrow = r_narrow.json()
        # Narrow subset should be <= wide
        assert len(narrow) <= len(wide), f"narrow={len(narrow)} > wide={len(wide)}"
        # Every deal in narrow must be within 0.5 km
        for d in narrow:
            assert d.get("distance_km") is not None
            assert d["distance_km"] <= 0.5, f"deal within radius has {d['distance_km']}km"

    def test_deals_medium_radius_between(self, api_client):
        r05 = api_client.get(f"{BASE_URL}/api/deals",
                             params={"lat": SF_LAT, "lng": SF_LNG, "max_km": 0.5}).json()
        r3 = api_client.get(f"{BASE_URL}/api/deals",
                            params={"lat": SF_LAT, "lng": SF_LNG, "max_km": 3}).json()
        r999 = api_client.get(f"{BASE_URL}/api/deals",
                              params={"lat": SF_LAT, "lng": SF_LNG, "max_km": 999}).json()
        assert len(r05) <= len(r3) <= len(r999)


# ==================== OTP FLOW ====================
class TestOtpAuth:
    PHONE = "+919876543210"

    def test_otp_request_returns_demo_code(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/otp/request",
                            json={"phone": self.PHONE}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("sent") is True
        assert data.get("demo_code") == "123456"

    def test_otp_verify_success_creates_customer(self, api_client):
        # ensure code exists
        api_client.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": self.PHONE})
        r = api_client.post(f"{BASE_URL}/api/auth/otp/verify",
                            json={"phone": self.PHONE, "code": "123456", "name": "OTP Tester"},
                            timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        user = data.get("user")
        assert user is not None
        assert user.get("role") == "customer"
        assert user.get("phone") == self.PHONE

    def test_otp_verify_wrong_code_returns_401(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/otp/verify",
                            json={"phone": self.PHONE, "code": "000000"}, timeout=30)
        assert r.status_code == 401

    def test_otp_verify_token_works_on_me(self, api_client):
        api_client.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": self.PHONE})
        r = api_client.post(f"{BASE_URL}/api/auth/otp/verify",
                            json={"phone": self.PHONE, "code": "123456", "name": "OTP Tester"})
        token = r.json()["access_token"]
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert me.status_code == 200
        assert me.json().get("phone") == self.PHONE

    def test_otp_verify_merchant_phone(self, api_client):
        # Use a distinct phone for merchant path
        merchant_phone = "+919000000123"
        api_client.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": merchant_phone})
        r = api_client.post(f"{BASE_URL}/api/auth/otp/verify",
                            json={"phone": merchant_phone, "code": "123456", "name": "Merchant Tester"})
        assert r.status_code == 200
        # NOTE: backend does not accept role param — user is created as customer.
        # Frontend elevates role via /merchant/onboard.
        assert r.json()["user"]["role"] == "customer"
