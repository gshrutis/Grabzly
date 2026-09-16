"""Iteration 13 — Backend regression: base64 → hosted media migration + reliable sample videos.

Covers:
A) /api/deals   — no data:, file://, or pexels.com; scheme distribution reported
B) /api/deals/live-now — same hygiene; ≥3 live deals with a valid image_url
C) /api/sample-videos — 6 HTTPS items, none from pexels.com, none commondatastorage.googleapis.com
D) /api/media/<file> — pick a real file from a deal.image_url, GET 200 with correct content-type
E) Auth + /api/upload regression: OTP register, upload small jpeg, GET back byte-exact
F) /api/merchants?lat=&lng= — no data: in logo/cover_image
"""
import io
import os
import struct
from collections import Counter

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    os.environ.get("EXPO_BACKEND_URL", ""),
).rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL is not set"

API = f"{BASE_URL}/api"


# ---------- helpers ---------------------------------------------------------
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


def _scheme(v: str | None) -> str:
    v = v or ""
    if not v:
        return "NONE"
    if v.startswith("data:"):
        return "DATA"
    if v.startswith("file://"):
        return "FILE"
    if v.startswith("/api/media"):
        return "MEDIA_RELATIVE"
    if v.startswith("https://"):
        return "HTTPS"
    if v.startswith("http://"):
        return "HTTP"
    return "OTHER"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def customer_auth(api_client):
    phone = "+911234567892"
    r = api_client.post(f"{API}/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = api_client.post(
        f"{API}/auth/otp/verify",
        json={"phone": phone, "code": "123456", "name": "IT13 Charlie"},
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---- A) /api/deals hygiene -------------------------------------------------
class TestDealsMediaHygiene:
    def test_deals_have_no_bad_urls_and_report_scheme_counts(self, api_client):
        r = api_client.get(f"{API}/deals")
        assert r.status_code == 200
        deals = r.json()
        assert isinstance(deals, list) and len(deals) > 0

        img_c = Counter(_scheme(d.get("image_url")) for d in deals)
        vid_c = Counter(_scheme(d.get("video_url")) for d in deals)
        print(f"\n[iter13] /api/deals ({len(deals)} docs) image_url schemes: {dict(img_c)}")
        print(f"[iter13] /api/deals ({len(deals)} docs) video_url schemes: {dict(vid_c)}")

        bad_data_img = [d["title"] for d in deals if (d.get("image_url") or "").startswith("data:")]
        bad_data_vid = [d["title"] for d in deals if (d.get("video_url") or "").startswith("data:")]
        bad_file_img = [d["title"] for d in deals if (d.get("image_url") or "").startswith("file://")]
        bad_file_vid = [d["title"] for d in deals if (d.get("video_url") or "").startswith("file://")]
        bad_pex_vid = [d["title"] for d in deals if "videos.pexels.com" in (d.get("video_url") or "")]

        assert not bad_data_img, f"deals with data: image_url: {bad_data_img}"
        assert not bad_data_vid, f"deals with data: video_url: {bad_data_vid}"
        assert not bad_file_img, f"deals with file:// image_url: {bad_file_img}"
        assert not bad_file_vid, f"deals with file:// video_url: {bad_file_vid}"
        assert not bad_pex_vid, f"deals still using videos.pexels.com: {bad_pex_vid}"


# ---- B) /api/deals/live-now hygiene ---------------------------------------
class TestLiveNowHygiene:
    def test_live_now_has_min_deals_and_clean_media(self, api_client):
        r = api_client.get(f"{API}/deals/live-now")
        assert r.status_code == 200
        deals = r.json()
        print(f"\n[iter13] /api/deals/live-now count: {len(deals)}")
        assert len(deals) >= 3, f"expected ≥3 live deals, got {len(deals)}"

        img_c = Counter(_scheme(d.get("image_url")) for d in deals)
        vid_c = Counter(_scheme(d.get("video_url")) for d in deals)
        print(f"[iter13] live-now image_url schemes: {dict(img_c)}")
        print(f"[iter13] live-now video_url schemes: {dict(vid_c)}")

        with_img = [d for d in deals if d.get("image_url")]
        assert len(with_img) >= 3, f"only {len(with_img)} live deals have image_url"

        for d in deals:
            iu = d.get("image_url") or ""
            vu = d.get("video_url") or ""
            assert not iu.startswith("data:"), f"live deal '{d['title']}' still base64 image"
            assert not iu.startswith("file://"), f"live deal '{d['title']}' still file:// image"
            assert not vu.startswith("data:"), f"live deal '{d['title']}' still base64 video"
            assert not vu.startswith("file://"), f"live deal '{d['title']}' still file:// video"
            assert "videos.pexels.com" not in vu, f"live deal '{d['title']}' still pexels video"


# ---- C) /api/sample-videos ------------------------------------------------
class TestSampleVideos:
    def test_sample_videos_shape_and_hygiene(self, api_client):
        r = api_client.get(f"{API}/sample-videos")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) == 6, f"expected exactly 6 sample videos, got {len(items)}"
        for it in items:
            assert set(it.keys()) >= {"id", "url", "label"}
            assert it["url"].startswith("https://"), f"non-HTTPS URL: {it['url']}"
            assert "pexels.com" not in it["url"], f"sample video still on pexels.com: {it['url']}"
            assert "commondatastorage.googleapis.com" not in it["url"], (
                f"leftover commondatastorage: {it['url']}"
            )


# ---- D) GET /api/media/<real filename> -------------------------------------
class TestMediaStaticServing:
    def test_real_deal_image_is_served_ok(self, api_client):
        r = api_client.get(f"{API}/deals")
        assert r.status_code == 200
        deals = r.json()
        media_urls = [d.get("image_url") for d in deals
                      if (d.get("image_url") or "").startswith("/api/media/")]
        if not media_urls:
            pytest.skip("no /api/media/ image_url present in /api/deals — nothing to verify")

        rel = media_urls[0]
        full = f"{BASE_URL}{rel}"
        r2 = api_client.get(full)
        assert r2.status_code == 200, f"{full} -> {r2.status_code}"
        ct = r2.headers.get("content-type", "")
        assert ct.startswith("image/"), f"expected image/*, got {ct}"
        assert len(r2.content) > 100, f"suspiciously small body: {len(r2.content)} bytes"
        print(f"\n[iter13] served {full} ct={ct} size={len(r2.content)}")


# ---- E) Auth + upload regression -------------------------------------------
class TestUploadRegression:
    def test_otp_auth_and_upload_returns_hosted_url(self, api_client, customer_auth):
        tok = customer_auth["access_token"]
        assert tok, "OTP verify did not return access_token"

        body = _tiny_jpeg_bytes()
        files = {"file": ("iter13.jpg", body, "image/jpeg")}
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {tok}"},
            files=files,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["url"].startswith("/api/media/"), j
        assert j["url"].endswith(".jpg"), j
        assert j["bytes"] == len(body)
        assert j["content_type"] == "image/jpeg"

        # GET back → byte-exact
        r2 = api_client.get(f"{BASE_URL}{j['url']}")
        assert r2.status_code == 200
        assert r2.content == body, "downloaded bytes differ from uploaded"


# ---- F) Merchants media hygiene --------------------------------------------
class TestMerchantsMediaHygiene:
    def test_no_data_url_in_logo_or_cover_image(self, api_client):
        r = api_client.get(f"{API}/merchants", params={"lat": 37.7749, "lng": -122.4194})
        assert r.status_code == 200
        merchants = r.json()
        assert isinstance(merchants, list) and len(merchants) > 0

        logo_c = Counter(_scheme(m.get("logo")) for m in merchants)
        cover_c = Counter(_scheme(m.get("cover_image")) for m in merchants)
        print(f"\n[iter13] /api/merchants ({len(merchants)} docs) logo: {dict(logo_c)}")
        print(f"[iter13] /api/merchants ({len(merchants)} docs) cover_image: {dict(cover_c)}")

        bad_logo = [m.get("name") for m in merchants if (m.get("logo") or "").startswith("data:")]
        bad_cover = [m.get("name") for m in merchants if (m.get("cover_image") or "").startswith("data:")]
        assert not bad_logo, f"merchants with data: logo: {bad_logo}"
        assert not bad_cover, f"merchants with data: cover_image: {bad_cover}"
