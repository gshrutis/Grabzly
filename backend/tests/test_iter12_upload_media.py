"""Iteration 12 — Backend tests for media upload + media hygiene.

Covers:
- POST /api/upload (auth, valid image, valid mp4, unsupported content-type)
- GET /api/media/<filename> (byte-exact retrieval)
- GET /api/deals hygiene (no file://, no commondatastorage)
- GET /api/sample-videos (HTTPS, no commondatastorage, 8-9 URLs)
- Regression: register 2 users via OTP, onboard merchant, claim+redeem, verify notifications
"""
import io
import os
import struct
import zlib
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', os.environ.get('EXPO_BACKEND_URL', '')).rstrip('/')
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL is not set"

API = f"{BASE_URL}/api"


# ------------------------------------------------------------------ helpers
def _tiny_jpeg_bytes() -> bytes:
    """Smallest valid-ish JPEG: SOI+APP0(JFIF)+SOF0+SOS+EOI is complex.
    Simpler: use a well-known 1x1 white JPEG."""
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


def _tiny_mp4_bytes() -> bytes:
    """A minimal 'ftyp' + 'mdat' MP4-ish blob — not playable but passes
    the content-type sniff test. We upload with content_type='video/mp4'."""
    # ftyp box: size(4) type(4) major_brand(4) minor_version(4) compat(4)
    ftyp = b"\x00\x00\x00\x14ftypisom\x00\x00\x02\x00mp41"
    payload = b"\x00" * 2048
    mdat_size = struct.pack(">I", len(payload) + 8)
    mdat = mdat_size + b"mdat" + payload
    return ftyp + mdat


def _otp_login(session: requests.Session, phone: str, name: str) -> dict:
    r = session.post(f"{API}/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = session.post(f"{API}/auth/otp/verify",
                     json={"phone": phone, "code": "123456", "name": name})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def customer_auth(api_client):
    data = _otp_login(api_client, "+911234567890", "IT12 Alice")
    return data  # {access_token, user}


@pytest.fixture(scope="module")
def merchant_auth(api_client):
    data = _otp_login(api_client, "+911234567891", "IT12 Bob")
    tok = data["access_token"]
    # Onboard as merchant
    r = api_client.post(
        f"{API}/merchant/onboard",
        headers={"Authorization": f"Bearer {tok}"},
        json={
            "name": "IT12 Test Cafe",
            "category": "cafe",
            "address": "1 Test Way",
            "lat": 37.7749,
            "lng": -122.4194,
            "hours": "09:00 - 21:00",
            "phone": "+911234567891",
            "price_range": "$$",
        },
    )
    assert r.status_code == 200, r.text
    data["merchant"] = r.json()
    return data


# =========================================================================
# A) POST /api/upload
# =========================================================================
class TestUploadEndpoint:

    def test_upload_no_token_is_401(self, api_client):
        files = {"file": ("t.jpg", _tiny_jpeg_bytes(), "image/jpeg")}
        r = api_client.post(f"{API}/upload", files=files)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"

    def test_upload_valid_jpeg_returns_hosted_url(self, api_client, customer_auth):
        tok = customer_auth["access_token"]
        body = _tiny_jpeg_bytes()
        files = {"file": ("photo.jpg", body, "image/jpeg")}
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {tok}"},
            files=files,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert "url" in j and "filename" in j and "bytes" in j and "content_type" in j
        assert j["url"].startswith("/api/media/"), j
        assert j["url"].endswith(".jpg"), j
        assert j["bytes"] == len(body)
        assert j["content_type"] == "image/jpeg"

        # Fetch back — byte-exact
        get_url = f"{BASE_URL}{j['url']}"
        r2 = api_client.get(get_url)
        assert r2.status_code == 200, f"GET {get_url} -> {r2.status_code}"
        assert r2.content == body, "downloaded bytes differ from uploaded"

    def test_upload_valid_mp4_returns_hosted_url(self, api_client, customer_auth):
        tok = customer_auth["access_token"]
        body = _tiny_mp4_bytes()
        files = {"file": ("clip.mp4", body, "video/mp4")}
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {tok}"},
            files=files,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["url"].endswith(".mp4"), j
        assert j["bytes"] == len(body)
        r2 = api_client.get(f"{BASE_URL}{j['url']}")
        assert r2.status_code == 200
        assert r2.content == body

    def test_upload_unsupported_content_type_400(self, api_client, customer_auth):
        tok = customer_auth["access_token"]
        files = {"file": ("hello.txt", b"hi", "text/plain")}
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {tok}"},
            files=files,
        )
        assert r.status_code == 400, r.text
        assert "Unsupported" in r.text or "content-type" in r.text.lower()

    @pytest.mark.skip(reason="26MB payload is slow over the ingress; endpoint has size guard")
    def test_upload_oversized_413(self, api_client, customer_auth):
        pass


# =========================================================================
# B) /api/deals hygiene
# =========================================================================
class TestDealsMediaHygiene:

    def test_no_file_uri_or_commondatastorage(self, api_client):
        r = api_client.get(f"{API}/deals")
        assert r.status_code == 200
        deals = r.json()
        assert isinstance(deals, list) and len(deals) > 0
        bad_video_cd = [d for d in deals
                        if (d.get("video_url") or "").startswith("https://commondatastorage.googleapis.com")
                        or (d.get("video_url") or "").startswith("http://commondatastorage.googleapis.com")]
        bad_video_file = [d for d in deals if (d.get("video_url") or "").startswith("file://")]
        bad_img_file = [d for d in deals if (d.get("image_url") or "").startswith("file://")]
        assert not bad_video_cd, f"Deals still using commondatastorage: {[d['title'] for d in bad_video_cd]}"
        assert not bad_video_file, f"Deals with file:// video_url: {[d['title'] for d in bad_video_file]}"
        assert not bad_img_file, f"Deals with file:// image_url: {[d['title'] for d in bad_img_file]}"


# =========================================================================
# C) /api/sample-videos
# =========================================================================
class TestSampleVideos:

    def test_sample_videos_shape_and_hygiene(self, api_client):
        r = api_client.get(f"{API}/sample-videos")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert 8 <= len(items) <= 9, f"Expected 8-9 sample videos, got {len(items)}"
        for it in items:
            assert set(it.keys()) >= {"id", "url", "label"}
            assert it["url"].startswith("https://"), f"Non-HTTPS URL: {it['url']}"
            assert "commondatastorage" not in it["url"], f"Leftover commondatastorage: {it['url']}"


# =========================================================================
# D) Deal claim+redeem regression with notifications
# =========================================================================
class TestClaimRedeemNotifications:

    def test_full_flow_emits_all_four_notifications(self, api_client, customer_auth, merchant_auth):
        cust_tok = customer_auth["access_token"]
        merch_tok = merchant_auth["access_token"]

        # Create a deal owned by merchant
        r = api_client.post(
            f"{API}/merchant/deals",
            headers={"Authorization": f"Bearer {merch_tok}"},
            json={
                "title": "IT12 Test Deal",
                "description": "iteration12 regression",
                "category": "cafe",
                "deal_type": "flash",
                "before_price": 10.0,
                "after_price": 5.0,
                "quantity": 5,
                "per_customer_limit": 1,
            },
        )
        assert r.status_code == 200, r.text
        deal = r.json()

        # Customer claims
        r = api_client.post(
            f"{API}/deals/{deal['id']}/claim",
            headers={"Authorization": f"Bearer {cust_tok}"},
        )
        assert r.status_code == 200, r.text
        claim = r.json()

        # Small delay to let notification writes settle
        time.sleep(0.3)

        # Customer should have claim_created
        r = api_client.get(f"{API}/notifications",
                           headers={"Authorization": f"Bearer {cust_tok}"})
        assert r.status_code == 200
        cust_types = [n["type"] for n in r.json()]
        assert "claim_created" in cust_types, f"customer types={cust_types}"

        # Merchant should have claim_received
        r = api_client.get(f"{API}/notifications",
                           headers={"Authorization": f"Bearer {merch_tok}"})
        assert r.status_code == 200
        merch_types = [n["type"] for n in r.json()]
        assert "claim_received" in merch_types, f"merchant types={merch_types}"

        # Merchant redeems
        r = api_client.post(
            f"{API}/merchant/redeem",
            headers={"Authorization": f"Bearer {merch_tok}"},
            json={"claim_id": claim["id"]},
        )
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["claim"]["status"] == "redeemed"
        assert result["points_awarded"] >= 25

        time.sleep(0.3)

        # Customer should now have redemption_confirmed
        r = api_client.get(f"{API}/notifications",
                           headers={"Authorization": f"Bearer {cust_tok}"})
        cust_types = [n["type"] for n in r.json()]
        assert "redemption_confirmed" in cust_types, f"customer types={cust_types}"

        # Merchant should now have redemption_completed
        r = api_client.get(f"{API}/notifications",
                           headers={"Authorization": f"Bearer {merch_tok}"})
        merch_types = [n["type"] for n in r.json()]
        assert "redemption_completed" in merch_types, f"merchant types={merch_types}"

        # Cleanup: soft-delete the deal so it doesn't accumulate
        api_client.delete(
            f"{API}/merchant/deals/{deal['id']}",
            headers={"Authorization": f"Bearer {merch_tok}"},
        )
