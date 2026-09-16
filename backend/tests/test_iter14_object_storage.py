"""Iteration 14 — Emergent Managed Object Storage integration.

Covers:
A) Startup / init handshake — assert Object storage init is idempotent (module-level).
B) Upload happy path — OTP register → POST /api/upload jpeg → validate response,
   GET returns byte-exact, db.uploads row exists.
C) Upload rejection paths — missing token 401, unsupported content-type 400.
D) Legacy migration verification — /api/deals & /api/merchants: no /api/media/
   remain; /api/files/ counts match expectation (>=1).
E) Full claim → redeem regression (single happy-path).
F) GET /api/files/<real-migrated-path> — 200 with correct content-type.
"""
import os
import sys
from pathlib import Path
from collections import Counter

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    os.environ.get("EXPO_BACKEND_URL", ""),
).rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL is not set"

API = f"{BASE_URL}/api"

# Make backend importable for the idempotency test.
BACKEND_DIR = Path("/app/backend")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _tiny_jpeg_bytes() -> bytes:
    return bytes.fromhex(
        "ffd8ffe000104a46494600010100000100010000ffdb004300080606"
        "070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d"
        "1a1c1c20242e2720222c231c1c2837292c30313434341f27393d3832"
        "3c2e333432ffc0000b080001000101011100ffc4001f000001050101"
        "0101010100000000000000000102030405060708090a0bffc400b510"
        "0002010303020403050504040000017d01020300041105122131410613"
        "516107227114328191a1082342b1c11552d1f02433627282090a161718"
        "191a25262728292a3435363738393a434445464748494a5354555657"
        "58595a636465666768696a737475767778797a838485868788898a92"
        "939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3"
        "c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2"
        "f3f4f5f6f7f8f9faffda0008010100003f00fbd0ffd9"
    )


def _scheme(v):
    v = v or ""
    if not v:
        return "NONE"
    if v.startswith("/api/media/"):
        return "MEDIA_LEGACY"
    if v.startswith("/api/files/"):
        return "FILES_OBJSTORE"
    if v.startswith("https://"):
        return "HTTPS"
    if v.startswith("http://"):
        return "HTTP"
    if v.startswith("data:"):
        return "DATA"
    return "OTHER"


@pytest.fixture(scope="module")
def api_client():
    return requests.Session()


@pytest.fixture(scope="module")
def customer_auth(api_client):
    phone = "+911234567914"
    r = api_client.post(f"{API}/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = api_client.post(
        f"{API}/auth/otp/verify",
        json={"phone": phone, "code": "123456", "name": "IT14 Dave"},
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def merchant_auth(api_client):
    phone = "+911234567915"
    api_client.post(f"{API}/auth/otp/request", json={"phone": phone})
    r = api_client.post(
        f"{API}/auth/otp/verify",
        json={"phone": phone, "code": "123456", "name": "IT14 Eve"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data["access_token"]
    onboard = api_client.post(
        f"{API}/merchant/onboard",
        headers={"Authorization": f"Bearer {tok}"},
        json={
            "name": "IT14 Bistro",
            "category": "cafe",
            "address": "14 Iter St",
            "lat": 37.7749,
            "lng": -122.4194,
            "hours": "09-21",
            "phone": phone,
            "price_range": "$$",
        },
    )
    assert onboard.status_code == 200, onboard.text
    data["merchant"] = onboard.json()
    return data


# ------------------------------------------------------------------ A) Init
class TestStorageInitIdempotent:
    def test_init_storage_is_idempotent(self):
        """Second call to init_storage() returns same cached key without new HTTP request."""
        from object_storage import init_storage  # noqa
        k1 = init_storage()
        k2 = init_storage()
        assert isinstance(k1, str) and len(k1) > 0
        assert k1 == k2, "init_storage should cache the storage_key"


# ------------------------------------------------------------------ B) Happy path
class TestUploadHappyPath:
    def test_upload_then_download_bytewise(self, api_client, customer_auth):
        tok = customer_auth["access_token"]
        user_id = customer_auth["user"]["id"]
        body = _tiny_jpeg_bytes()
        files = {"file": ("iter14.jpg", body, "image/jpeg")}
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {tok}"},
            files=files,
        )
        assert r.status_code == 200, r.text
        j = r.json()

        # Response contract
        assert j["url"].startswith("/api/files/happyhour/uploads/"), j
        assert j["path"] == j["url"][len("/api/files/"):], j
        assert j["path"].startswith(f"happyhour/uploads/{user_id}/"), j
        assert j["content_type"] == "image/jpeg", j
        assert j["bytes"] == len(body), j
        assert j["filename"].endswith(".jpg"), j

        # Download and byte-compare
        r2 = api_client.get(f"{BASE_URL}{j['url']}")
        assert r2.status_code == 200, f"{r2.status_code}: {r2.text[:200]}"
        assert r2.headers.get("content-type", "").startswith("image/jpeg"), r2.headers
        assert r2.content == body, "downloaded bytes differ from uploaded"

        # DB row exists — verify via mongo directly (fast, no admin endpoint)
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        dbname = os.environ.get("DB_NAME", "test_database")

        async def _check():
            cli = AsyncIOMotorClient(mongo_url)
            row = await cli[dbname].uploads.find_one({"path": j["path"]})
            cli.close()
            return row

        row = asyncio.get_event_loop().run_until_complete(_check())
        assert row is not None, "no db.uploads row for uploaded path"
        assert row["owner_id"] == user_id
        assert row["content_type"] == "image/jpeg"
        assert row["bytes"] == len(body)


# ------------------------------------------------------------------ C) Rejections
class TestUploadRejections:
    def test_upload_no_token_401(self, api_client):
        files = {"file": ("t.jpg", _tiny_jpeg_bytes(), "image/jpeg")}
        r = api_client.post(f"{API}/upload", files=files)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_upload_text_plain_400(self, api_client, customer_auth):
        tok = customer_auth["access_token"]
        files = {"file": ("hello.txt", b"hi", "text/plain")}
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {tok}"},
            files=files,
        )
        assert r.status_code == 400, r.text
        assert "Unsupported" in r.text or "content-type" in r.text.lower()


# ------------------------------------------------------------------ E) Legacy migration
class TestLegacyMigration:
    def test_deals_use_files_not_media(self, api_client):
        r = api_client.get(f"{API}/deals")
        assert r.status_code == 200
        deals = r.json()
        c = Counter(_scheme(d.get("image_url")) for d in deals)
        v = Counter(_scheme(d.get("video_url")) for d in deals)
        print(f"\n[iter14] /api/deals ({len(deals)}) image_url={dict(c)} video_url={dict(v)}")
        assert c.get("MEDIA_LEGACY", 0) == 0, (
            f"legacy /api/media/ still present in image_url counts: {dict(c)}"
        )
        assert v.get("MEDIA_LEGACY", 0) == 0, (
            f"legacy /api/media/ still present in video_url counts: {dict(v)}"
        )
        # At least some should have migrated to /api/files/
        assert c.get("FILES_OBJSTORE", 0) >= 1, (
            f"expected ≥1 deals migrated to /api/files/; got {dict(c)}"
        )

    def test_merchants_use_files_not_media(self, api_client):
        r = api_client.get(f"{API}/merchants", params={"lat": 37.7749, "lng": -122.4194})
        assert r.status_code == 200
        merchants = r.json()
        logo = Counter(_scheme(m.get("logo")) for m in merchants)
        cover = Counter(_scheme(m.get("cover_image")) for m in merchants)
        print(f"\n[iter14] /api/merchants ({len(merchants)}) logo={dict(logo)} cover={dict(cover)}")
        assert logo.get("MEDIA_LEGACY", 0) == 0, f"legacy logos: {dict(logo)}"
        assert cover.get("MEDIA_LEGACY", 0) == 0, f"legacy cover_image: {dict(cover)}"

    def test_migrated_file_download_works(self, api_client):
        """Pick a real /api/files/... url from /api/deals or /api/merchants and GET it."""
        r = api_client.get(f"{API}/deals")
        candidates = [d.get("image_url") for d in r.json()
                      if (d.get("image_url") or "").startswith("/api/files/")]
        if not candidates:
            r = api_client.get(f"{API}/merchants", params={"lat": 37.7749, "lng": -122.4194})
            for m in r.json():
                for f in ("logo", "cover_image"):
                    v = m.get(f)
                    if v and v.startswith("/api/files/"):
                        candidates.append(v)
        assert candidates, "no /api/files/ URLs found in deals or merchants"
        rel = candidates[0]
        r2 = api_client.get(f"{BASE_URL}{rel}")
        assert r2.status_code == 200, f"{rel} -> {r2.status_code}: {r2.text[:200]}"
        ct = r2.headers.get("content-type", "")
        assert ct.startswith("image/"), f"expected image/*, got {ct}"
        assert len(r2.content) > 100, f"too small: {len(r2.content)} bytes"
        print(f"\n[iter14] served {rel} ct={ct} size={len(r2.content)}")


# ------------------------------------------------------------------ F) Regression
class TestClaimRedeemRegression:
    def test_full_claim_redeem_flow(self, api_client, customer_auth, merchant_auth):
        cust_tok = customer_auth["access_token"]
        merch_tok = merchant_auth["access_token"]

        r = api_client.post(
            f"{API}/merchant/deals",
            headers={"Authorization": f"Bearer {merch_tok}"},
            json={
                "title": "IT14 Regression Deal",
                "description": "iter14 regression",
                "category": "cafe",
                "deal_type": "flash",
                "before_price": 12.0,
                "after_price": 6.0,
                "quantity": 3,
                "per_customer_limit": 1,
            },
        )
        assert r.status_code == 200, r.text
        deal = r.json()

        r = api_client.post(
            f"{API}/deals/{deal['id']}/claim",
            headers={"Authorization": f"Bearer {cust_tok}"},
        )
        assert r.status_code == 200, r.text
        claim = r.json()

        r = api_client.post(
            f"{API}/merchant/redeem",
            headers={"Authorization": f"Bearer {merch_tok}"},
            json={"claim_id": claim["id"]},
        )
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["claim"]["status"] == "redeemed"
        assert result["points_awarded"] >= 25

        # cleanup
        api_client.delete(
            f"{API}/merchant/deals/{deal['id']}",
            headers={"Authorization": f"Bearer {merch_tok}"},
        )
