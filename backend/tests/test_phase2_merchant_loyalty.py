"""HappyHour Phase 2 backend tests — merchant panel + loyalty/referrals + chat + promo codes + sample videos."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://local-deals-now.preview.emergentagent.com"
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

LAT, LNG = 37.7749, -122.4194


def _no_id(obj):
    if isinstance(obj, dict):
        assert "_id" not in obj, f"MongoDB _id leaked: keys={list(obj.keys())}"
        for v in obj.values():
            _no_id(v)
    elif isinstance(obj, list):
        for v in obj:
            _no_id(v)


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _register(email=None, referral_code=None):
    email = email or f"test_{uuid.uuid4().hex[:8]}@happyhour.io"
    payload = {"email": email, "password": "Passw0rd!", "name": f"User {email[:8]}"}
    if referral_code:
        payload["referral_code"] = referral_code
    r = requests.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    return {"email": email, "token": body["access_token"], "user": body["user"]}


def _onboard(token, name=None):
    body = {
        "name": name or f"Merch {uuid.uuid4().hex[:6]}",
        "category": "food",
        "description": "Phase2 test merchant",
        "address": "1 Test Way",
        "lat": LAT + 0.001,
        "lng": LNG + 0.001,
        "hours": "10:00 - 22:00",
        "phone": "+1 555 000 1111",
    }
    r = requests.post(f"{API}/merchant/onboard", json=body, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


# =============================================================
# 1. REGISTER now returns referral_code & accepts referral input
# =============================================================
class TestRegistrationReferral:
    def test_register_returns_referral_code(self):
        u = _register()
        assert u["user"].get("referral_code"), "referral_code missing on register"
        assert u["user"]["referral_code"].startswith("HH")
        assert u["user"].get("referred_by") is None

    def test_register_accepts_referral_code_and_links(self):
        referrer = _register()
        referee = _register(referral_code=referrer["user"]["referral_code"])
        assert referee["user"]["referred_by"] == referrer["user"]["id"]

    def test_register_unknown_referral_code_ignored(self):
        u = _register(referral_code="HHNOPE99")
        assert u["user"]["referred_by"] is None


# =============================================================
# 2. MERCHANT ONBOARD / ME / PATCH
# =============================================================
class TestMerchantOnboard:
    def test_onboard_elevates_role_and_verifies(self):
        u = _register()
        m = _onboard(u["token"])
        _no_id(m)
        assert m["verified"] is True
        assert m["verification_status"] == "verified"
        # role elevated
        me = requests.get(f"{API}/auth/me", headers=_auth(u["token"])).json()
        assert me["role"] == "merchant"

    def test_merchant_me_forbidden_for_customer(self):
        u = _register()
        r = requests.get(f"{API}/merchant/me", headers=_auth(u["token"]))
        assert r.status_code == 403

    def test_merchant_me_ok_and_patch(self):
        u = _register()
        _onboard(u["token"])
        r = requests.get(f"{API}/merchant/me", headers=_auth(u["token"]))
        assert r.status_code == 200
        _no_id(r.json())
        r2 = requests.patch(f"{API}/merchant/me", json={"description": "Updated desc"},
                            headers=_auth(u["token"]))
        assert r2.status_code == 200
        assert r2.json()["description"] == "Updated desc"


# =============================================================
# 3. DEAL CRUD
# =============================================================
@pytest.fixture(scope="module")
def merchant_ctx():
    u = _register()
    m = _onboard(u["token"])
    return {"token": u["token"], "user": u["user"], "merchant": m}


class TestMerchantDeals:
    def test_create_deal_auto_discount(self, merchant_ctx):
        body = {
            "title": "TEST Flash Deal",
            "description": "Testing",
            "category": "food",
            "deal_type": "flash",
            "before_price": 20.0,
            "after_price": 10.0,
            "quantity": 5,
            "per_customer_limit": 1,
        }
        r = requests.post(f"{API}/merchant/deals", json=body, headers=_auth(merchant_ctx["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        _no_id(d)
        assert d["discount_pct"] == 50
        assert d["quantity_remaining"] == 5
        assert d["merchant_id"] == merchant_ctx["merchant"]["id"]
        merchant_ctx["flash_deal_id"] = d["id"]

    def test_create_draft_excluded_from_public(self, merchant_ctx):
        body = {"title": "TEST Draft", "description": "d", "category": "food",
                "deal_type": "regular", "after_price": 5.0, "is_draft": True}
        r = requests.post(f"{API}/merchant/deals", json=body, headers=_auth(merchant_ctx["token"]))
        assert r.status_code == 200
        draft_id = r.json()["id"]
        public = requests.get(f"{API}/deals").json()
        assert draft_id not in [x["id"] for x in public]
        merchant_ctx["draft_id"] = draft_id

    def test_patch_deal_quantity_delta(self, merchant_ctx):
        did = merchant_ctx["flash_deal_id"]
        r = requests.patch(f"{API}/merchant/deals/{did}", json={"quantity": 8},
                           headers=_auth(merchant_ctx["token"]))
        assert r.status_code == 200
        assert r.json()["quantity"] == 8
        assert r.json()["quantity_remaining"] == 8  # 5 + delta(3)

    def test_end_deal(self, merchant_ctx):
        body = {"title": "TEST End", "description": "e", "category": "food",
                "deal_type": "flash", "after_price": 5.0, "quantity": 2}
        did = requests.post(f"{API}/merchant/deals", json=body,
                            headers=_auth(merchant_ctx["token"])).json()["id"]
        r = requests.post(f"{API}/merchant/deals/{did}/end", headers=_auth(merchant_ctx["token"]))
        assert r.status_code == 200
        # verify deal shows expired
        det = requests.get(f"{API}/deals/{did}").json()
        assert det["expired"] is True

    def test_duplicate_deal_creates_draft_copy(self, merchant_ctx):
        did = merchant_ctx["flash_deal_id"]
        r = requests.post(f"{API}/merchant/deals/{did}/duplicate", headers=_auth(merchant_ctx["token"]))
        assert r.status_code == 200
        new = r.json()
        assert new["id"] != did
        assert new["title"].endswith("(copy)")
        assert new["is_draft"] is True

    def test_delete_soft_deletes(self, merchant_ctx):
        body = {"title": "TEST Delete", "description": "d", "category": "food",
                "deal_type": "regular", "after_price": 5.0}
        did = requests.post(f"{API}/merchant/deals", json=body,
                            headers=_auth(merchant_ctx["token"])).json()["id"]
        r = requests.delete(f"{API}/merchant/deals/{did}", headers=_auth(merchant_ctx["token"]))
        assert r.status_code == 200
        public = requests.get(f"{API}/deals").json()
        assert did not in [x["id"] for x in public]

    def test_paused_deal_excluded_from_public(self, merchant_ctx):
        body = {"title": "TEST Pause", "description": "d", "category": "food",
                "deal_type": "regular", "after_price": 5.0}
        did = requests.post(f"{API}/merchant/deals", json=body,
                            headers=_auth(merchant_ctx["token"])).json()["id"]
        r = requests.patch(f"{API}/merchant/deals/{did}", json={"is_paused": True},
                           headers=_auth(merchant_ctx["token"]))
        assert r.status_code == 200
        public = requests.get(f"{API}/deals").json()
        assert did not in [x["id"] for x in public]
        # also excluded from live-now and reels
        live = requests.get(f"{API}/deals/live-now").json()
        assert did not in [x["id"] for x in live]
        reels = requests.get(f"{API}/deals/reels").json()
        assert did not in [x["id"] for x in reels]


# =============================================================
# 4. MERCHANT CLAIMS + REDEEM + LOYALTY + REFERRAL BONUS
# =============================================================
class TestRedemptionAndLoyalty:
    def test_full_referral_redemption_flow(self):
        # 1. referrer registers
        referrer = _register()
        # 2. referee registers with referrer's code
        referee = _register(referral_code=referrer["user"]["referral_code"])
        # 3. new merchant registers + onboards + creates flash deal
        mu = _register()
        m = _onboard(mu["token"])
        body = {"title": "TEST Redeem", "description": "r", "category": "food",
                "deal_type": "flash", "before_price": 20.0, "after_price": 8.0, "quantity": 5}
        deal = requests.post(f"{API}/merchant/deals", json=body,
                             headers=_auth(mu["token"])).json()
        # 4. referee claims the deal
        r = requests.post(f"{API}/deals/{deal['id']}/claim", headers=_auth(referee["token"]))
        assert r.status_code == 200, r.text
        claim = r.json()
        code = claim["redemption_code"]

        # 5. GET /merchant/claims returns the claim
        mc = requests.get(f"{API}/merchant/claims", headers=_auth(mu["token"])).json()
        assert any(c["id"] == claim["id"] for c in mc)
        active = requests.get(f"{API}/merchant/claims?status=active",
                              headers=_auth(mu["token"])).json()
        assert all(c["status"] == "active" for c in active)

        # 6. Validate raw code
        v = requests.post(f"{API}/merchant/redeem/validate", json={"code": code},
                          headers=_auth(mu["token"]))
        assert v.status_code == 200, v.text
        assert v.json()["id"] == claim["id"]

        # 7. Validate full QR payload
        v2 = requests.post(f"{API}/merchant/redeem/validate",
                           json={"code": claim["qr_payload"]}, headers=_auth(mu["token"]))
        assert v2.status_code == 200
        assert v2.json()["id"] == claim["id"]

        # 8. Validate unknown → 404
        v3 = requests.post(f"{API}/merchant/redeem/validate", json={"code": "ZZZZZZ"},
                           headers=_auth(mu["token"]))
        assert v3.status_code == 404

        # 9. Validate belonging to another merchant → 403 (create a 2nd merchant to try)
        other_mu = _register()
        _onboard(other_mu["token"])
        v4 = requests.post(f"{API}/merchant/redeem/validate", json={"code": claim["qr_payload"]},
                           headers=_auth(other_mu["token"]))
        assert v4.status_code == 403, f"Expected 403 got {v4.status_code}: {v4.text}"

        # 10. Redeem
        red = requests.post(f"{API}/merchant/redeem", json={"claim_id": claim["id"]},
                            headers=_auth(mu["token"]))
        assert red.status_code == 200, red.text
        body = red.json()
        # 25 base + 100 referee bonus = 125
        assert body["points_awarded"] == 125, f"Expected 125, got {body['points_awarded']}"
        assert body["claim"]["status"] == "redeemed"

        # 11. Loyalty: referee has 125 pts
        ref_loyalty = requests.get(f"{API}/loyalty/me", headers=_auth(referee["token"])).json()
        assert ref_loyalty["points"] == 125
        assert ref_loyalty["referral_code"]
        assert isinstance(ref_loyalty["ledger"], list) and len(ref_loyalty["ledger"]) >= 1

        # 12. Loyalty: referrer has 200 pts
        rr_loyalty = requests.get(f"{API}/loyalty/me", headers=_auth(referrer["token"])).json()
        assert rr_loyalty["points"] == 200, f"Expected 200 pts, got {rr_loyalty['points']}"

    def test_redeem_non_referred_awards_25(self):
        customer = _register()
        mu = _register()
        _onboard(mu["token"])
        body = {"title": "TEST Base25", "description": "b", "category": "food",
                "deal_type": "flash", "after_price": 6.0, "quantity": 3}
        deal = requests.post(f"{API}/merchant/deals", json=body,
                             headers=_auth(mu["token"])).json()
        claim = requests.post(f"{API}/deals/{deal['id']}/claim",
                              headers=_auth(customer["token"])).json()
        red = requests.post(f"{API}/merchant/redeem", json={"claim_id": claim["id"]},
                            headers=_auth(mu["token"])).json()
        assert red["points_awarded"] == 25
        loy = requests.get(f"{API}/loyalty/me", headers=_auth(customer["token"])).json()
        assert loy["points"] == 25

    def test_void_claim_restores_quantity(self):
        customer = _register()
        mu = _register()
        _onboard(mu["token"])
        body = {"title": "TEST Void", "description": "v", "category": "food",
                "deal_type": "flash", "after_price": 5.0, "quantity": 3}
        deal = requests.post(f"{API}/merchant/deals", json=body,
                             headers=_auth(mu["token"])).json()
        claim = requests.post(f"{API}/deals/{deal['id']}/claim",
                              headers=_auth(customer["token"])).json()
        # quantity should now be 2
        d1 = requests.get(f"{API}/deals/{deal['id']}").json()
        assert d1["quantity_remaining"] == 2
        vd = requests.post(f"{API}/merchant/claims/{claim['id']}/void",
                           json={"reason": "no_show"}, headers=_auth(mu["token"]))
        assert vd.status_code == 200
        d2 = requests.get(f"{API}/deals/{deal['id']}").json()
        assert d2["quantity_remaining"] == 3


# =============================================================
# 5. ANALYTICS
# =============================================================
class TestAnalytics:
    def test_analytics_summary_shape(self):
        u = _register()
        _onboard(u["token"])
        r = requests.get(f"{API}/merchant/analytics/summary", headers=_auth(u["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("totals", "daily", "heatmap", "benchmark", "video_performance"):
            assert k in body
        totals = body["totals"]
        for k in ("views", "claims", "redemptions", "no_shows", "active_deals",
                  "gmv", "redemption_rate", "no_show_rate"):
            assert k in totals
        assert len(body["daily"]) == 7
        assert len(body["heatmap"]) == 7
        assert all(len(row) == 24 for row in body["heatmap"])
        assert "category_avg_redemption_rate" in body["benchmark"]


# =============================================================
# 6. PROMO CODES CRUD
# =============================================================
class TestPromoCodes:
    def test_promo_create_and_list(self):
        u = _register()
        _onboard(u["token"])
        r = requests.post(f"{API}/merchant/promo-codes",
                          json={"code": "TEST10", "discount_pct": 10, "max_uses": 50},
                          headers=_auth(u["token"]))
        assert r.status_code == 200
        p = r.json()
        assert p["code"] == "TEST10"
        assert p["discount_pct"] == 10
        _no_id(p)
        lst = requests.get(f"{API}/merchant/promo-codes", headers=_auth(u["token"])).json()
        assert any(x["id"] == p["id"] for x in lst)


# =============================================================
# 7. SAMPLE VIDEOS
# =============================================================
class TestSampleVideos:
    def test_sample_videos(self):
        r = requests.get(f"{API}/sample-videos")
        assert r.status_code == 200
        vids = r.json()
        assert isinstance(vids, list)
        assert len(vids) > 0
        for v in vids:
            assert v["url"].startswith("http")
            assert "id" in v
            assert "label" in v


# =============================================================
# 8. CHAT
# =============================================================
class TestChat:
    def test_chat_end_to_end(self):
        customer = _register()
        mu = _register()
        m = _onboard(mu["token"])
        # customer sends message
        r = requests.post(f"{API}/chat/send",
                          json={"merchant_id": m["id"], "text": "Hi from test"},
                          headers=_auth(customer["token"]))
        assert r.status_code == 200, r.text
        msg = r.json()
        _no_id(msg)
        assert msg["text"] == "Hi from test"

        # thread for customer
        thread = requests.get(f"{API}/chat/thread/{m['id']}",
                              headers=_auth(customer["token"])).json()
        assert any(x["id"] == msg["id"] for x in thread)

        # merchant threads
        threads = requests.get(f"{API}/merchant/chat/threads",
                               headers=_auth(mu["token"])).json()
        assert any(t.get("user_id") == customer["user"]["id"] for t in threads)


# =============================================================
# 9. REGRESSION: Phase 1 endpoints still work
# =============================================================
class TestPhase1Regression:
    def test_categories(self):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 200 and len(r.json()) == 6

    def test_merchants_list(self):
        r = requests.get(f"{API}/merchants", params={"lat": LAT, "lng": LNG})
        assert r.status_code == 200
        _no_id(r.json())

    def test_deals_list(self):
        r = requests.get(f"{API}/deals")
        assert r.status_code == 200
        _no_id(r.json())

    def test_deals_live_now(self):
        r = requests.get(f"{API}/deals/live-now")
        assert r.status_code == 200

    def test_deals_reels(self):
        r = requests.get(f"{API}/deals/reels")
        assert r.status_code == 200
