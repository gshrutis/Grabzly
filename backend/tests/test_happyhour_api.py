"""HappyHour backend API tests — first iteration."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://local-deals-now.preview.emergentagent.com"
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

LAT, LNG = 37.7749, -122.4194

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})


def _no_mongo_id(obj):
    """Recursively assert no '_id' key present in dict/list."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"MongoDB _id leaked: {obj.keys()}"
        for v in obj.values():
            _no_mongo_id(v)
    elif isinstance(obj, list):
        for v in obj:
            _no_mongo_id(v)


# ---------------- Categories ----------------
def test_categories_returns_six():
    r = session.get(f"{API}/categories")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 6
    ids = {c["id"] for c in data}
    assert {"food", "grocery", "clothing", "kitchenware", "cafe", "bakery"}.issubset(ids)
    for c in data:
        for k in ("id", "name", "icon", "color"):
            assert k in c


# ---------------- Merchants ----------------
def test_merchants_seeded_and_sorted():
    r = session.get(f"{API}/merchants", params={"lat": LAT, "lng": LNG})
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) == 6, f"Expected 6 seeded merchants, got {len(docs)}"
    _no_mongo_id(docs)
    required = {"id", "name", "category", "cover_image", "logo", "verified", "lat", "lng", "distance_km"}
    for m in docs:
        missing = required - set(m.keys())
        assert not missing, f"Merchant missing fields: {missing}"
    # sorted ascending by distance
    dists = [m["distance_km"] for m in docs]
    assert dists == sorted(dists)


def test_merchant_detail_with_deals():
    m_list = session.get(f"{API}/merchants", params={"lat": LAT, "lng": LNG}).json()
    mid = m_list[0]["id"]
    r = session.get(f"{API}/merchants/{mid}")
    assert r.status_code == 200
    m = r.json()
    _no_mongo_id(m)
    assert "deals" in m and isinstance(m["deals"], list)
    for d in m["deals"]:
        assert "is_live_now" in d
        assert "minutes_left" in d
        assert "expired" in d


def test_merchant_404():
    r = session.get(f"{API}/merchants/does-not-exist")
    assert r.status_code == 404


# ---------------- Deals ----------------
def test_deals_seeded_and_sorted():
    r = session.get(f"{API}/deals", params={"lat": LAT, "lng": LNG})
    assert r.status_code == 200
    deals = r.json()
    assert len(deals) == 15, f"Expected 15 seeded deals, got {len(deals)}"
    _no_mongo_id(deals)
    # Live-first heuristic
    live_flags = [d.get("is_live_now") for d in deals]
    # any live must appear before any non-live
    seen_non_live = False
    for f in live_flags:
        if not f:
            seen_non_live = True
        elif seen_non_live and f:
            pytest.fail("Live deals should come before non-live deals in default sort")


def test_deals_filter_category():
    r = session.get(f"{API}/deals", params={"category": "food"})
    assert r.status_code == 200
    deals = r.json()
    assert len(deals) > 0
    assert all(d["category"] == "food" for d in deals)


def test_deals_filter_deal_type_flash():
    r = session.get(f"{API}/deals", params={"deal_type": "flash"})
    assert r.status_code == 200
    deals = r.json()
    assert len(deals) > 0
    assert all(d["deal_type"] == "flash" for d in deals)


def test_deals_filter_live_now():
    r = session.get(f"{API}/deals", params={"live_now": "true"})
    assert r.status_code == 200
    deals = r.json()
    assert all(d.get("is_live_now") for d in deals)


def test_deals_filter_max_km():
    r = session.get(f"{API}/deals", params={"lat": LAT, "lng": LNG, "max_km": 1.0})
    assert r.status_code == 200
    deals = r.json()
    assert all(d["distance_km"] <= 1.0 for d in deals)


def test_deals_sort_discount():
    r = session.get(f"{API}/deals", params={"sort": "discount"})
    deals = r.json()
    pcts = [d.get("discount_pct", 0) for d in deals]
    assert pcts == sorted(pcts, reverse=True)


def test_deals_sort_price_low():
    r = session.get(f"{API}/deals", params={"sort": "price_low"})
    deals = r.json()
    prices = [d.get("after_price", 0) for d in deals]
    assert prices == sorted(prices)


def test_deals_text_search():
    r = session.get(f"{API}/deals", params={"q": "pizza"})
    assert r.status_code == 200


def test_deals_live_now_endpoint():
    r = session.get(f"{API}/deals/live-now", params={"lat": LAT, "lng": LNG})
    assert r.status_code == 200
    deals = r.json()
    for d in deals:
        assert d["deal_type"] in ("flash", "video")
        assert d["is_live_now"] is True
        assert 0 <= d["minutes_left"] <= 60


def test_deals_reels():
    r = session.get(f"{API}/deals/reels")
    assert r.status_code == 200
    deals = r.json()
    assert len(deals) > 0
    for d in deals:
        assert d.get("video_url"), "reels must have video_url"
        assert not d.get("expired")


def test_deal_detail_with_merchant():
    ds = session.get(f"{API}/deals").json()
    did = ds[0]["id"]
    r = session.get(f"{API}/deals/{did}")
    assert r.status_code == 200
    d = r.json()
    _no_mongo_id(d)
    assert d.get("merchant") is not None
    assert d["merchant"]["id"] == d["merchant_id"]


def test_deal_404():
    r = session.get(f"{API}/deals/nope")
    assert r.status_code == 404


# ---------------- Auth ----------------
@pytest.fixture(scope="module")
def user():
    email = f"test_{uuid.uuid4().hex[:10]}@happyhour.io"
    pw = "Passw0rd!"
    r = session.post(f"{API}/auth/register", json={"email": email, "password": pw, "name": "Test User"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["user"]["email"] == email
    return {"email": email, "password": pw, "token": body["access_token"], "user": body["user"]}


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_register_duplicate_email(user):
    r = session.post(f"{API}/auth/register",
                     json={"email": user["email"], "password": "Passw0rd!", "name": "dup"})
    assert r.status_code == 400


def test_login_success(user):
    r = session.post(f"{API}/auth/login", json={"email": user["email"], "password": user["password"]})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_login_wrong_password(user):
    r = session.post(f"{API}/auth/login", json={"email": user["email"], "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_token():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_me_with_token(user):
    r = requests.get(f"{API}/auth/me", headers=auth_headers(user["token"]))
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == user["email"]
    assert "password_hash" not in body
    _no_mongo_id(body)


def test_patch_me(user):
    r = requests.patch(f"{API}/auth/me",
                       json={"name": "Updated Name", "preferred_categories": ["food", "cafe"]},
                       headers=auth_headers(user["token"]))
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Updated Name"
    assert body["preferred_categories"] == ["food", "cafe"]


# ---------------- Follow ----------------
def test_follow_toggle(user):
    m_list = session.get(f"{API}/merchants").json()
    mid = m_list[0]["id"]
    r1 = requests.post(f"{API}/merchants/{mid}/follow", headers=auth_headers(user["token"]))
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["following"] is True
    assert mid in b1["favorited_merchants"]

    r2 = requests.post(f"{API}/merchants/{mid}/follow", headers=auth_headers(user["token"]))
    b2 = r2.json()
    assert b2["following"] is False
    assert mid not in b2["favorited_merchants"]


# ---------------- Claims ----------------
def _find_flash_deal_with_qty():
    deals = session.get(f"{API}/deals").json()
    for d in deals:
        if d.get("deal_type") == "flash" and d.get("quantity") is not None and not d.get("expired"):
            return d
    return None


def test_claim_requires_auth():
    deals = session.get(f"{API}/deals").json()
    did = deals[0]["id"]
    r = requests.post(f"{API}/deals/{did}/claim")
    assert r.status_code == 401


def test_claim_and_quantity_decrement(user):
    deal = _find_flash_deal_with_qty()
    assert deal is not None, "No flash deal with quantity found"
    before_remaining = deal["quantity_remaining"]

    r = requests.post(f"{API}/deals/{deal['id']}/claim", headers=auth_headers(user["token"]))
    assert r.status_code == 200, r.text
    claim = r.json()
    _no_mongo_id(claim)
    assert claim["status"] == "active"
    assert len(claim["redemption_code"]) == 6
    assert claim["qr_payload"].startswith("HH:")
    assert claim["redemption_deadline"]

    # Verify quantity decremented
    d2 = session.get(f"{API}/deals/{deal['id']}").json()
    assert d2["quantity_remaining"] == before_remaining - 1
    assert d2["quantity_claimed"] == deal.get("quantity_claimed", 0) + 1

    # Cancel restores quantity
    r_cancel = requests.post(f"{API}/claims/{claim['id']}/cancel", headers=auth_headers(user["token"]))
    assert r_cancel.status_code == 200
    d3 = session.get(f"{API}/deals/{deal['id']}").json()
    assert d3["quantity_remaining"] == before_remaining

    # Second cancel should 400
    r_cancel2 = requests.post(f"{API}/claims/{claim['id']}/cancel", headers=auth_headers(user["token"]))
    assert r_cancel2.status_code == 400


def test_claims_me_list_and_status_filter(user):
    # create one claim on a regular deal (no qty)
    deals = session.get(f"{API}/deals").json()
    regular = next((d for d in deals if d["deal_type"] == "regular"), None)
    assert regular is not None
    r = requests.post(f"{API}/deals/{regular['id']}/claim", headers=auth_headers(user["token"]))
    assert r.status_code == 200

    r_list = requests.get(f"{API}/claims/me", headers=auth_headers(user["token"]))
    assert r_list.status_code == 200
    claims = r_list.json()
    assert len(claims) >= 1
    _no_mongo_id(claims)

    r_active = requests.get(f"{API}/claims/me?status=active", headers=auth_headers(user["token"]))
    assert r_active.status_code == 200
    assert all(c["status"] == "active" for c in r_active.json())

    r_cancelled = requests.get(f"{API}/claims/me?status=cancelled", headers=auth_headers(user["token"]))
    assert r_cancelled.status_code == 200
    assert all(c["status"] == "cancelled" for c in r_cancelled.json())
