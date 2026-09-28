"""Iteration 21 — Admin Panel Phase 3: Settings + Global Search + Live Loyalty wiring.

Scope (per review request):
- Settings: GET/PATCH /api/admin/settings, validation, persistence.
- Public settings: GET /api/settings (no auth) returns whitelisted subset.
- Live wiring: PATCH loyalty_points_per_redemption -> merchant redeem awards new value.
- Global search: /api/admin/search — case-insensitive, regex escape, limit, empty q.
- Regression smoke: /api/admin/categories, /api/admin/cities, customer & admin logins.
- Cleanup: restore defaults; remove test data.
"""
from __future__ import annotations
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://local-deals-now.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@happyhour.local"
ADMIN_PASSWORD = "HappyAdmin@2026"

PUBLIC_SETTING_KEYS = {
    "brand_name", "brand_logo_url", "support_email",
    "default_deal_radius_km",
    "loyalty_points_per_redemption",
    "referral_referrer_reward", "referral_referee_reward",
    "guest_browsing_enabled", "reels_tab_enabled",
}

DEFAULTS = {
    "brand_name": "Happy Hour",
    "default_deal_radius_km": 5,
    "loyalty_points_per_redemption": 25,
    "referral_referrer_reward": 200,
    "referral_referee_reward": 100,
    "guest_browsing_enabled": True,
    "reels_tab_enabled": True,
}

# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def ahdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# --------------- SETTINGS ---------------
class TestSettings:
    def test_get_admin_settings_has_defaults(self, ahdr):
        r = requests.get(f"{BASE_URL}/api/admin/settings", headers=ahdr, timeout=10)
        assert r.status_code == 200, r.text
        doc = r.json()
        for k in ["brand_name", "brand_logo_url", "support_email",
                  "default_deal_radius_km", "loyalty_points_per_redemption",
                  "referral_referrer_reward", "referral_referee_reward",
                  "guest_browsing_enabled", "reels_tab_enabled"]:
            assert k in doc, f"Missing default key: {k}"

    def test_patch_settings_partial_merge_and_persist(self, ahdr):
        # snapshot
        original = requests.get(f"{BASE_URL}/api/admin/settings", headers=ahdr, timeout=10).json()
        new_brand = f"HH-Test-{uuid.uuid4().hex[:6]}"
        r = requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                           json={"brand_name": new_brand}, timeout=10)
        assert r.status_code == 200, r.text
        merged = r.json()
        assert merged["brand_name"] == new_brand
        # other keys still present unchanged
        assert merged["loyalty_points_per_redemption"] == original["loyalty_points_per_redemption"]
        # GET should reflect the change (persistence)
        r2 = requests.get(f"{BASE_URL}/api/admin/settings", headers=ahdr, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["brand_name"] == new_brand
        # restore
        requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                       json={"brand_name": original.get("brand_name") or "Happy Hour"}, timeout=10)

    def test_settings_validation_radius_out_of_range(self, ahdr):
        for bad in [0, -1, 501, 1000]:
            r = requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                               json={"default_deal_radius_km": bad}, timeout=10)
            assert r.status_code == 422, f"Expected 422 for radius={bad}, got {r.status_code} {r.text}"

    def test_settings_validation_loyalty_and_referrals_out_of_range(self, ahdr):
        cases = [
            ("loyalty_points_per_redemption", -1),
            ("loyalty_points_per_redemption", 100001),
            ("referral_referrer_reward", -5),
            ("referral_referrer_reward", 100001),
            ("referral_referee_reward", -1),
            ("referral_referee_reward", 200000),
        ]
        for key, val in cases:
            r = requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                               json={key: val}, timeout=10)
            assert r.status_code == 422, f"Expected 422 for {key}={val}, got {r.status_code}"

    def test_settings_validation_boundary_accept(self, ahdr):
        # 0 and 100000 should be accepted; 500 for radius; 0.01 lower bound
        r = requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                           json={"loyalty_points_per_redemption": 0}, timeout=10)
        assert r.status_code == 200, r.text
        r = requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                           json={"loyalty_points_per_redemption": 100000}, timeout=10)
        assert r.status_code == 200, r.text
        r = requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                           json={"default_deal_radius_km": 500}, timeout=10)
        assert r.status_code == 200, r.text
        # restore default 25 + 5
        requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                       json={"loyalty_points_per_redemption": 25, "default_deal_radius_km": 5}, timeout=10)

    def test_public_settings_endpoint_no_auth_and_whitelisted(self):
        r = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        assert r.status_code == 200, r.text
        doc = r.json()
        # Every key returned must be in whitelist
        for k in doc.keys():
            assert k in PUBLIC_SETTING_KEYS, f"Non-whitelisted key exposed: {k}"
        # And every whitelisted key must be present
        assert set(doc.keys()) == PUBLIC_SETTING_KEYS, \
            f"Public keys mismatch. Missing: {PUBLIC_SETTING_KEYS - set(doc.keys())}"

    def test_admin_settings_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/settings", timeout=10)
        assert r.status_code in (401, 403), r.status_code
        r2 = requests.patch(f"{BASE_URL}/api/admin/settings", json={"brand_name": "x"}, timeout=10)
        assert r2.status_code in (401, 403)


# --------------- LIVE WIRING (loyalty) ---------------
class TestLiveLoyaltyWiring:
    """PATCH loyalty setting -> next merchant redeem awards new points value."""

    def test_patch_loyalty_then_redeem_awards_new_value(self, ahdr):
        # 1) Set loyalty to 55
        r = requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                           json={"loyalty_points_per_redemption": 55}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["loyalty_points_per_redemption"] == 55

        # 2) Register a fresh customer
        cust_email = f"testloyal_{uuid.uuid4().hex[:8]}@happyhour.io"
        rc = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"email": cust_email, "password": "Passw0rd!", "name": "TEST Loyalty"},
                           timeout=15)
        assert rc.status_code == 200, rc.text
        cust_token = rc.json()["access_token"]
        cust_id = rc.json()["user"]["id"]
        chdr = {"Authorization": f"Bearer {cust_token}"}

        # 3) Register + onboard a merchant
        m_email = f"testmerch_{uuid.uuid4().hex[:8]}@happyhour.io"
        rm = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"email": m_email, "password": "Passw0rd!", "name": "TEST Merchant"},
                           timeout=15)
        assert rm.status_code == 200, rm.text
        m_token = rm.json()["access_token"]
        mhdr = {"Authorization": f"Bearer {m_token}"}
        onboard = {
            "name": f"TEST Merch {uuid.uuid4().hex[:5]}", "category": "food",
            "description": "test", "address": "1 Test", "lat": 37.7749, "lng": -122.4194,
            "hours": "09:00 - 18:00", "phone": "+1 555 000 0000",
        }
        rom = requests.post(f"{BASE_URL}/api/merchant/onboard", headers=mhdr, json=onboard, timeout=15)
        assert rom.status_code == 200, rom.text
        merchant_id = rom.json()["id"]

        # 4) Merchant creates a deal
        deal_body = {
            "title": "TEST Loyalty Deal", "description": "test",
            "category": "food", "deal_type": "regular",
            "before_price": 20, "after_price": 10, "per_customer_limit": 5,
        }
        rd = requests.post(f"{BASE_URL}/api/merchant/deals", headers=mhdr, json=deal_body, timeout=15)
        assert rd.status_code == 200, rd.text
        deal_id = rd.json()["id"]

        # 5) Customer claims
        rclaim = requests.post(f"{BASE_URL}/api/deals/{deal_id}/claim", headers=chdr, timeout=15)
        assert rclaim.status_code == 200, rclaim.text
        claim_id = rclaim.json()["id"]

        # 6) Merchant redeems
        rr = requests.post(f"{BASE_URL}/api/merchant/redeem", headers=mhdr,
                           json={"claim_id": claim_id}, timeout=15)
        assert rr.status_code == 200, rr.text
        pts = rr.json().get("points_awarded")
        assert pts == 55, f"Expected 55 points, got {pts}"

        # 7) Verify /auth/me reflects 55 points on customer
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=chdr, timeout=10)
        assert me.status_code == 200
        assert me.json()["points"] == 55, me.json()

        # store cleanup handles (module-scoped teardown via pytest.fixture would be nicer)
        TestLiveLoyaltyWiring._cleanup = {
            "customer_id": cust_id, "merchant_id": merchant_id,
            "deal_id": deal_id, "claim_id": claim_id,
            "customer_email": cust_email, "merchant_email": m_email,
        }


# --------------- GLOBAL SEARCH ---------------
class TestGlobalSearch:
    def test_empty_q_returns_422(self, ahdr):
        r = requests.get(f"{BASE_URL}/api/admin/search?q=&limit=5", headers=ahdr, timeout=10)
        assert r.status_code == 422, f"expected 422, got {r.status_code} {r.text}"

    def test_search_returns_expected_shape(self, ahdr):
        r = requests.get(f"{BASE_URL}/api/admin/search", headers=ahdr,
                         params={"q": "pizza", "limit": 5}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ["merchants", "deals", "customers", "total"]:
            assert k in body
        assert isinstance(body["merchants"], list)
        assert isinstance(body["deals"], list)
        assert isinstance(body["customers"], list)
        assert body["total"] == len(body["merchants"]) + len(body["deals"]) + len(body["customers"])

    def test_search_case_insensitive(self, ahdr):
        r1 = requests.get(f"{BASE_URL}/api/admin/search", headers=ahdr,
                          params={"q": "PIZZA", "limit": 5}, timeout=10)
        r2 = requests.get(f"{BASE_URL}/api/admin/search", headers=ahdr,
                          params={"q": "pizza", "limit": 5}, timeout=10)
        assert r1.status_code == 200 and r2.status_code == 200
        ids1 = sorted([m["id"] for m in r1.json()["merchants"]])
        ids2 = sorted([m["id"] for m in r2.json()["merchants"]])
        assert ids1 == ids2, f"Case-insensitive mismatch: {ids1} vs {ids2}"
        dids1 = sorted([d["id"] for d in r1.json()["deals"]])
        dids2 = sorted([d["id"] for d in r2.json()["deals"]])
        assert dids1 == dids2

    def test_search_regex_escape(self, ahdr):
        # '.*' would match everything if unescaped -> should NOT explode and results bounded.
        r = requests.get(f"{BASE_URL}/api/admin/search", headers=ahdr,
                         params={"q": ".*", "limit": 5}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # Because escaped, '.*' is treated literally; unless a merchant/deal name contains ".*",
        # the result should be empty or few — critically must be bounded by limit.
        assert len(body["merchants"]) <= 5
        assert len(body["deals"]) <= 5
        assert len(body["customers"]) <= 5

    def test_search_limit_max_20(self, ahdr):
        r = requests.get(f"{BASE_URL}/api/admin/search", headers=ahdr,
                         params={"q": "a", "limit": 20}, timeout=10)
        assert r.status_code == 200
        assert len(r.json()["merchants"]) <= 20
        # 21 must 422
        r2 = requests.get(f"{BASE_URL}/api/admin/search", headers=ahdr,
                          params={"q": "a", "limit": 21}, timeout=10)
        assert r2.status_code == 422, r2.text
        # 0 must 422
        r3 = requests.get(f"{BASE_URL}/api/admin/search", headers=ahdr,
                          params={"q": "a", "limit": 0}, timeout=10)
        assert r3.status_code == 422

    def test_search_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/search?q=pizza", timeout=10)
        assert r.status_code in (401, 403)


# --------------- REGRESSION SMOKE ---------------
class TestRegressionSmoke:
    def test_admin_categories_still_lists(self, ahdr):
        r = requests.get(f"{BASE_URL}/api/admin/categories", headers=ahdr, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)
        assert len(body["items"]) >= 1

    def test_admin_cities_still_lists(self, ahdr):
        r = requests.get(f"{BASE_URL}/api/admin/cities", headers=ahdr, timeout=10)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_customer_register_and_login(self):
        email = f"regr_{uuid.uuid4().hex[:6]}@happyhour.io"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "Passw0rd!", "name": "TEST Regr"},
                          timeout=15)
        assert r.status_code == 200, r.text
        r2 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": email, "password": "Passw0rd!"}, timeout=15)
        assert r2.status_code == 200
        assert "access_token" in r2.json()

    def test_admin_login_regression(self):
        r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
        assert r.status_code == 200
        assert r.json()["admin"]["role"] in ("admin", "super_admin")


# --------------- FINAL CLEANUP: restore defaults ---------------
def test_zzz_restore_defaults_and_cleanup(ahdr):
    """Runs last (zzz prefix) — restore settings AND remove test data."""
    r = requests.patch(f"{BASE_URL}/api/admin/settings", headers=ahdr,
                       json={
                           "brand_name": "Happy Hour",
                           "default_deal_radius_km": 5,
                           "loyalty_points_per_redemption": 25,
                           "referral_referrer_reward": 200,
                           "referral_referee_reward": 100,
                           "guest_browsing_enabled": True,
                           "reels_tab_enabled": True,
                       }, timeout=10)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["loyalty_points_per_redemption"] == 25
    assert doc["default_deal_radius_km"] == 5
    assert doc["brand_name"] == "Happy Hour"

    # Best-effort DB cleanup of TEST_-created data via mongo directly.
    try:
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        mdb = mc[os.environ.get("DB_NAME", "test_database")]
        # Remove test users, merchants, deals, claims created by this run
        test_users = list(mdb.users.find({"$or": [
            {"email": {"$regex": "^testloyal_"}},
            {"email": {"$regex": "^testmerch_"}},
            {"email": {"$regex": "^regr_"}},
            {"name": {"$regex": "^TEST "}},
        ]}, {"id": 1}))
        uids = [u["id"] for u in test_users]
        if uids:
            mdb.claims.delete_many({"user_id": {"$in": uids}})
            mdb.points_ledger.delete_many({"user_id": {"$in": uids}})
            mdb.notifications.delete_many({"user_id": {"$in": uids}})
        merch_docs = list(mdb.merchants.find({"owner_id": {"$in": uids}}, {"id": 1}))
        mids = [m["id"] for m in merch_docs]
        if mids:
            mdb.deals.delete_many({"merchant_id": {"$in": mids}})
            mdb.claims.delete_many({"merchant_id": {"$in": mids}})
            mdb.merchants.delete_many({"id": {"$in": mids}})
        if uids:
            mdb.users.delete_many({"id": {"$in": uids}})
        print(f"Cleanup: removed {len(uids)} test users, {len(mids)} test merchants")
    except Exception as e:
        print(f"Cleanup warning (non-fatal): {e}")
