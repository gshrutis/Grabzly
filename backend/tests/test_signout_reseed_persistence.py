"""
Iteration 6 backend regression tests
Bug: After a customer switches city (triggers POST /api/seed?force=true), user-created
merchants and their deals were being wiped along with demo data.

Fix: _do_seed() with force=True now only deletes docs where owner_id == None
(demo data). User-created merchants + their deals must survive.
"""
import os
import uuid
import pytest
import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as _f:
        for _line in _f:
            if _line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = _line.split("=", 1)[1].strip().rstrip("/")
                break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

LAT, LNG = 37.7749, -122.4194


def _auth(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _register():
    email = f"iter6_{uuid.uuid4().hex[:10]}@happyhour.io"
    password = "Passw0rd!"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": password, "name": "Iter6 Persist User",
    })
    assert r.status_code == 200, r.text
    return {"email": email, "password": password, "token": r.json()["access_token"],
            "user": r.json()["user"]}


def _onboard(token: str, name: str):
    body = {
        "name": name,
        "category": "cafe",
        "sub_category": "espresso bar",
        "description": "Persist-across-reseed store",
        "address": "42 Persistence Way",
        "lat": LAT + 0.0021,
        "lng": LNG - 0.0031,
        "hours": "08:00 - 20:00",
        "phone": "+1 555 000 4242",
        "price_range": "$$",
    }
    r = requests.post(f"{API}/merchant/onboard", json=body, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


# =============================================================
# 1. FULL END-TO-END: signout -> force reseed -> login -> data survives
# =============================================================
class TestMerchantSurvivesForceReseed:
    def test_full_e2e_persistence(self):
        # Step 1-2: register + onboard as merchant
        u = _register()
        store_name = f"Iter6 Persist Cafe {uuid.uuid4().hex[:6]}"
        m = _onboard(u["token"], store_name)
        assert m.get("name") == store_name
        assert m.get("owner_id") == u["user"]["id"]
        merchant_id = m["id"]

        # Step 3: /merchant/me returns the profile
        r_me = requests.get(f"{API}/merchant/me", headers=_auth(u["token"]))
        assert r_me.status_code == 200
        assert r_me.json()["id"] == merchant_id

        # Step 4: create a merchant-owned deal in cafe category
        deal_body = {
            "title": "Iter6 Persist Deal",
            "description": "Should survive force reseed",
            "category": "cafe",
            "deal_type": "flash",
            "before_price": 8.0,
            "after_price": 4.0,
            "quantity": 10,
            "per_customer_limit": 1,
        }
        r_deal = requests.post(f"{API}/merchant/deals", json=deal_body,
                               headers=_auth(u["token"]))
        assert r_deal.status_code == 200, r_deal.text
        created_deal = r_deal.json()
        deal_id = created_deal["id"]
        assert created_deal["owner_id"] == u["user"]["id"]
        assert created_deal["merchant_id"] == merchant_id

        # Capture demo count BEFORE force reseed for regression assertion
        merchants_before = requests.get(f"{API}/merchants").json()
        demo_before = [x for x in merchants_before if x.get("id") != merchant_id]
        user_before = [x for x in merchants_before if x.get("id") == merchant_id]
        assert len(user_before) == 1, "user merchant should be in the pre-reseed list"

        # Step 5: simulate signout — just drop token client-side (no server call)
        old_token = u["token"]

        # Step 6: trigger force reseed as anonymous city switcher
        r_seed = requests.post(
            f"{API}/seed",
            params={"force": True, "lat": LAT + 0.5, "lng": LNG + 0.5},
        )
        assert r_seed.status_code == 200, r_seed.text
        seed_body = r_seed.json()
        assert seed_body.get("seeded") is True
        # 6 demo merchants + 15 demo deals from SAMPLE_MERCHANTS
        assert seed_body.get("merchants") == 6, seed_body
        assert seed_body.get("deals") == 15, seed_body

        # Step 7: re-login with same credentials
        r_login = requests.post(f"{API}/auth/login", json={
            "email": u["email"], "password": u["password"],
        })
        assert r_login.status_code == 200, r_login.text
        new_token = r_login.json()["access_token"]
        # user role should still be merchant
        assert r_login.json()["user"]["role"] == "merchant"

        # Step 8: /merchant/me MUST still return the same merchant (NOT 404)
        r_me2 = requests.get(f"{API}/merchant/me", headers=_auth(new_token))
        assert r_me2.status_code == 200, (
            f"CRITICAL BUG: merchant profile lost after force reseed. "
            f"Status={r_me2.status_code} body={r_me2.text}"
        )
        m2 = r_me2.json()
        assert m2["id"] == merchant_id
        assert m2["name"] == store_name
        assert m2["owner_id"] == u["user"]["id"]

        # Step 9: /merchant/deals MUST still return the created deal
        r_deals = requests.get(f"{API}/merchant/deals", headers=_auth(new_token))
        assert r_deals.status_code == 200
        my_deals = r_deals.json()
        my_deal_ids = [d["id"] for d in my_deals]
        assert deal_id in my_deal_ids, (
            f"CRITICAL BUG: user's merchant deal lost after force reseed. "
            f"Expected deal_id={deal_id} in {my_deal_ids}"
        )

        # Also confirm via public deal GET (the deal itself must still be queryable)
        r_pub = requests.get(f"{API}/deals/{deal_id}")
        assert r_pub.status_code == 200, r_pub.text

        # Step 10: /api/deals?category=cafe includes BOTH user deal AND fresh demo cafe deals
        r_cafe = requests.get(f"{API}/deals", params={"category": "cafe"})
        assert r_cafe.status_code == 200
        cafe_deals = r_cafe.json()
        cafe_ids = [d["id"] for d in cafe_deals]
        assert deal_id in cafe_ids, "user's cafe deal must appear in category filter"
        # fresh demo cafe deals should also exist (Brew House Coffee seeds 3 cafe deals)
        demo_cafe = [d for d in cafe_deals if d.get("owner_id") is None]
        assert len(demo_cafe) >= 2, (
            f"expected fresh demo cafe deals after reseed, got {len(demo_cafe)}"
        )

    def test_force_reseed_regenerates_exact_counts(self):
        """Regression: force reseed must still produce 6 demo merchants + 15 demo deals."""
        r = requests.post(
            f"{API}/seed",
            params={"force": True, "lat": LAT, "lng": LNG},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("merchants") == 6
        assert body.get("deals") == 15

        merchants = requests.get(f"{API}/merchants").json()
        demo_merchants = [m for m in merchants if m.get("owner_id") is None]
        assert len(demo_merchants) == 6, (
            f"expected 6 demo merchants after reseed, got {len(demo_merchants)}"
        )
        # user merchants (any owner_id set) must also still exist
        user_merchants = [m for m in merchants if m.get("owner_id") is not None]
        # We created at least one in the previous test, so must be >= 1
        assert len(user_merchants) >= 1, (
            "expected user-owned merchants to persist across force reseed"
        )

    def test_multiple_reseeds_do_not_accumulate_demo(self):
        """Regression: repeated force reseeds should not create duplicate demo merchants."""
        for _ in range(3):
            r = requests.post(f"{API}/seed", params={"force": True, "lat": LAT, "lng": LNG})
            assert r.status_code == 200
        merchants = requests.get(f"{API}/merchants").json()
        demo_merchants = [m for m in merchants if m.get("owner_id") is None]
        assert len(demo_merchants) == 6, (
            f"demo merchants accumulated across reseeds: {len(demo_merchants)}"
        )
