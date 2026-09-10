"""Iteration 10 — Notifications endpoints + end-to-end emit flow.

Tests:
- GET /api/notifications (auth, sorted desc)
- GET /api/notifications/unread-count
- POST /api/notifications/{id}/read (404 on foreign/missing)
- POST /api/notifications/read-all
- DELETE /api/notifications/{id}
- End-to-end: customer claim -> notifications for customer + merchant owner
- End-to-end: merchant redeem -> notifications for customer + merchant owner
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL (or EXPO_BACKEND_URL) must be set"

API = f"{BASE_URL}/api"

# Unique-per-run phones so re-runs don't collide against existing DB users.
_run = int(time.time()) % 100000
CUSTOMER_PHONE = f"+9111{_run:05d}"
MERCHANT_PHONE = f"+9122{_run:05d}"


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _otp_signup(phone: str, name: str) -> dict:
    r = requests.post(f"{API}/auth/otp/request", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(
        f"{API}/auth/otp/verify",
        json={"phone": phone, "code": "123456", "name": name},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and "user" in data
    return data


@pytest.fixture(scope="module")
def customer():
    return _otp_signup(CUSTOMER_PHONE, "Iter10 Customer")


@pytest.fixture(scope="module")
def merchant(customer):  # customer created first for phone-slot separation
    data = _otp_signup(MERCHANT_PHONE, "Iter10 Merchant")
    token = data["access_token"]
    body = {
        "name": f"Iter10 Store {_run}",
        "category": "food",
        "address": "Test 123",
        "hours": "10-22",
        "phone": "1234",
        "description": "iter10 store",
        "lat": 37.7749,
        "lng": -122.4194,
    }
    r = requests.post(f"{API}/merchant/onboard", json=body, headers=_headers(token), timeout=15)
    assert r.status_code == 200, r.text
    merch = r.json()
    # Verify role elevated
    me = requests.get(f"{API}/auth/me", headers=_headers(token), timeout=10).json()
    assert me.get("role") == "merchant", f"role not elevated: {me}"
    return {**data, "merchant": merch}


@pytest.fixture(scope="module")
def deal(merchant):
    token = merchant["access_token"]
    exp = (datetime.now(timezone.utc) + timedelta(minutes=120)).isoformat()
    body = {
        "title": f"Iter10 Deal {_run}",
        "description": "test deal",
        "category": "food",
        "deal_type": "regular",
        "before_price": 20.0,
        "after_price": 10.0,
        "expires_at": exp,
        "per_customer_limit": 1,
    }
    r = requests.post(f"{API}/merchant/deals", json=body, headers=_headers(token), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("id")
    return d


# ---------------------------------------------------------------------------
# Notifications endpoints — auth required
# ---------------------------------------------------------------------------
class TestNotificationsAuth:
    def test_list_requires_auth(self):
        r = requests.get(f"{API}/notifications", timeout=10)
        assert r.status_code in (401, 403), r.status_code

    def test_unread_count_requires_auth(self):
        r = requests.get(f"{API}/notifications/unread-count", timeout=10)
        assert r.status_code in (401, 403), r.status_code


class TestNotificationsBaseline:
    """Fresh user should start with 0 notifications (or at least an empty array response shape)."""

    def test_customer_initial_list(self, customer):
        r = requests.get(f"{API}/notifications", headers=_headers(customer["access_token"]), timeout=10)
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        # This is a brand-new user in this test-run so should be empty.
        assert arr == [], f"expected empty notifications for fresh user, got {arr}"

    def test_customer_initial_unread(self, customer):
        r = requests.get(
            f"{API}/notifications/unread-count",
            headers=_headers(customer["access_token"]),
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json() == {"count": 0}


# ---------------------------------------------------------------------------
# End-to-end emit flow: claim + redeem
# ---------------------------------------------------------------------------
class TestClaimRedeemEmit:
    """Claim a deal → both parties get notifications; redeem → both parties get notifications."""

    _claim_id = None

    def test_customer_claims_deal(self, customer, deal):
        r = requests.post(
            f"{API}/deals/{deal['id']}/claim",
            headers=_headers(customer["access_token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        c = r.json()
        assert c.get("status") == "active"
        TestClaimRedeemEmit._claim_id = c["id"]

    def test_customer_receives_claim_created(self, customer):
        r = requests.get(f"{API}/notifications", headers=_headers(customer["access_token"]), timeout=10)
        assert r.status_code == 200
        arr = r.json()
        types = [n.get("type") for n in arr]
        assert "claim_created" in types, f"missing claim_created for customer, got={types}"
        n = next(x for x in arr if x["type"] == "claim_created")
        # Field shape assertions
        for k in ("id", "type", "title", "body", "meta", "read", "created_at"):
            assert k in n, f"missing key {k} in notification {n}"
        assert n["read"] is False
        assert n["meta"].get("deal_id")
        assert n["meta"].get("claim_id") == TestClaimRedeemEmit._claim_id

    def test_merchant_receives_claim_received(self, merchant):
        r = requests.get(f"{API}/notifications", headers=_headers(merchant["access_token"]), timeout=10)
        assert r.status_code == 200
        types = [n["type"] for n in r.json()]
        assert "claim_received" in types, f"missing claim_received for merchant owner, got={types}"

    def test_notifications_sorted_desc(self, customer):
        r = requests.get(f"{API}/notifications", headers=_headers(customer["access_token"]), timeout=10)
        arr = r.json()
        created = [n["created_at"] for n in arr]
        assert created == sorted(created, reverse=True), f"not sorted DESC: {created}"

    def test_unread_count_increments(self, customer):
        r = requests.get(
            f"{API}/notifications/unread-count",
            headers=_headers(customer["access_token"]),
            timeout=10,
        )
        assert r.json()["count"] >= 1

    def test_merchant_redeem(self, merchant):
        assert TestClaimRedeemEmit._claim_id, "claim was not created in prior test"
        r = requests.post(
            f"{API}/merchant/redeem",
            json={"claim_id": TestClaimRedeemEmit._claim_id},
            headers=_headers(merchant["access_token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["claim"]["status"] == "redeemed"

    def test_customer_receives_redemption_confirmed(self, customer):
        r = requests.get(f"{API}/notifications", headers=_headers(customer["access_token"]), timeout=10)
        types = [n["type"] for n in r.json()]
        assert "redemption_confirmed" in types, f"missing redemption_confirmed, got={types}"

    def test_merchant_receives_redemption_completed(self, merchant):
        r = requests.get(f"{API}/notifications", headers=_headers(merchant["access_token"]), timeout=10)
        types = [n["type"] for n in r.json()]
        assert "redemption_completed" in types, f"missing redemption_completed, got={types}"


# ---------------------------------------------------------------------------
# Mark read / read-all / delete
# ---------------------------------------------------------------------------
class TestNotificationsMutations:
    def test_mark_one_read(self, customer):
        r = requests.get(f"{API}/notifications", headers=_headers(customer["access_token"]), timeout=10)
        arr = r.json()
        unread = [n for n in arr if not n["read"]]
        assert unread, "expected at least one unread"
        nid = unread[0]["id"]
        r = requests.post(
            f"{API}/notifications/{nid}/read",
            headers=_headers(customer["access_token"]),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"read": True}

        # Verify persisted
        arr2 = requests.get(f"{API}/notifications", headers=_headers(customer["access_token"]), timeout=10).json()
        target = next(n for n in arr2 if n["id"] == nid)
        assert target["read"] is True

    def test_mark_read_missing_returns_404(self, customer):
        r = requests.post(
            f"{API}/notifications/nonexistent-id-xyz/read",
            headers=_headers(customer["access_token"]),
            timeout=10,
        )
        assert r.status_code == 404, r.text

    def test_mark_read_not_owned_returns_404(self, customer, merchant):
        # Grab a merchant notification id, try to flip it as the customer.
        arr = requests.get(f"{API}/notifications", headers=_headers(merchant["access_token"]), timeout=10).json()
        assert arr, "expected merchant to have at least one notification"
        foreign_id = arr[0]["id"]
        r = requests.post(
            f"{API}/notifications/{foreign_id}/read",
            headers=_headers(customer["access_token"]),
            timeout=10,
        )
        assert r.status_code == 404

    def test_read_all_and_count_zero(self, customer):
        r = requests.post(
            f"{API}/notifications/read-all",
            headers=_headers(customer["access_token"]),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "updated" in body and isinstance(body["updated"], int)

        cnt = requests.get(
            f"{API}/notifications/unread-count",
            headers=_headers(customer["access_token"]),
            timeout=10,
        ).json()
        assert cnt == {"count": 0}

    def test_delete_notification(self, customer):
        arr = requests.get(f"{API}/notifications", headers=_headers(customer["access_token"]), timeout=10).json()
        assert arr, "expected at least one notification to delete"
        nid = arr[0]["id"]
        r = requests.delete(
            f"{API}/notifications/{nid}",
            headers=_headers(customer["access_token"]),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"deleted": True}

        arr2 = requests.get(f"{API}/notifications", headers=_headers(customer["access_token"]), timeout=10).json()
        assert all(n["id"] != nid for n in arr2)

    def test_delete_missing_returns_404(self, customer):
        r = requests.delete(
            f"{API}/notifications/nonexistent-id-xyz",
            headers=_headers(customer["access_token"]),
            timeout=10,
        )
        assert r.status_code == 404
