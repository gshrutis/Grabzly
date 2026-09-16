"""Iteration 15 — Image compression on upload.

Backend regressions & new-behavior tests for `POST /api/upload`:
- B) Large JPEG (4000x3000) is resized to 1200-max edge & re-encoded JPEG @82.
- C) RGBA PNG (2000x1500) stays PNG, preserves alpha.
- D) Small JPEG (400x300) passes through without upscaling.
- E) Video (`video/mp4`) bytes are untouched.
- F) db.uploads row has original_bytes, bytes, compression_ratio (< 1).
- G) Rejections regression: text/plain → 400, no auth → 401.
"""
import io
import os
import asyncio
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    os.environ.get("EXPO_BACKEND_URL", ""),
).rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL is not set"
API = f"{BASE_URL}/api"


# --------------------------------------------------------------- helpers
def _make_jpeg(w: int, h: int, quality: int = 92) -> bytes:
    """Generate a non-trivial JPEG (gradient + shapes) that survives re-compression realistically."""
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            # cheap gradient — but too slow for 4000x3000. Use draw ops instead below.
            px[x, y] = ((x * 255) // w, (y * 255) // h, ((x + y) * 255) // (w + h))
    # add some shapes to avoid trivial run-length compression
    d = ImageDraw.Draw(img)
    for i in range(0, min(w, h), 100):
        d.rectangle([i, i, i + 50, i + 50], outline=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def _make_jpeg_fast(w: int, h: int, quality: int = 92) -> bytes:
    """Fast path for very large images — avoids per-pixel python loop."""
    # gradient using numpy-less approach: paste tiles
    img = Image.new("RGB", (w, h), (128, 60, 200))
    d = ImageDraw.Draw(img)
    # radial-ish blocks
    step = 200
    for y in range(0, h, step):
        for x in range(0, w, step):
            color = ((x * 255) // w, (y * 255) // h, ((x + y) * 255) // (w + h))
            d.rectangle([x, y, x + step, y + step], fill=color)
    # thin lines to add high-freq detail
    for i in range(0, w, 137):
        d.line([(i, 0), (i, h)], fill=(255, 255, 255), width=1)
    for j in range(0, h, 149):
        d.line([(0, j), (w, j)], fill=(0, 0, 0), width=1)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def _make_png_rgba(w: int, h: int) -> bytes:
    img = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    # semi-transparent red rect on left half
    d.rectangle([0, 0, w // 2, h], fill=(255, 0, 0, 128))
    # opaque green rect on right
    d.rectangle([w // 2, 0, w, h], fill=(0, 200, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# --------------------------------------------------------------- fixtures
@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def auth(api_client):
    """A) Register a user via OTP 123456, return {token, user_id}."""
    phone = "+911234567915"  # unique to iter15 — reused OK because OTP register is idempotent
    r = api_client.post(f"{API}/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = api_client.post(
        f"{API}/auth/otp/verify",
        json={"phone": phone, "code": "123456", "name": "IT15 Frank"},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["access_token"], "user_id": d["user"]["id"]}


# --------------------------------------------------------------- B) large JPEG
class TestLargeJpegCompression:
    def test_4000x3000_jpeg_resized_and_compressed(self, api_client, auth):
        body = _make_jpeg_fast(4000, 3000, quality=92)
        assert len(body) > 500_000, f"seed image too small to be a meaningful test: {len(body)}"

        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {auth['token']}"},
            files={"file": ("large.jpg", body, "image/jpeg")},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        print(f"\n[iter15-B] resp={j}")

        # Response contract
        assert j["content_type"] == "image/jpeg", j
        assert j["url"].startswith("/api/files/"), j
        assert j["original_bytes"] == len(body), j
        assert j["bytes"] < j["original_bytes"], (
            f"expected compressed < original; got bytes={j['bytes']} orig={j['original_bytes']}"
        )
        # ≥ 70% reduction (final <= 30% of original)
        reduction = 1.0 - (j["bytes"] / j["original_bytes"])
        assert reduction >= 0.70, f"expected ≥70% reduction, got {reduction*100:.1f}%"

        # Download & inspect
        r2 = api_client.get(f"{BASE_URL}{j['url']}")
        assert r2.status_code == 200, r2.text[:200]
        assert r2.headers.get("content-type", "").startswith("image/jpeg"), r2.headers
        dl = Image.open(io.BytesIO(r2.content))
        dl.load()
        w, h = dl.size
        print(f"[iter15-B] downloaded size={dl.size} mode={dl.mode} bytes={len(r2.content)}")
        assert max(w, h) == 1200, f"expected max edge 1200, got {dl.size}"
        # aspect ratio 4:3 preserved (within 1 px). 4000/3000 = 1.333 -> 1200/900
        expected_h = round(1200 * 3000 / 4000)
        assert abs(h - expected_h) <= 1 and w == 1200, f"aspect mismatch: {dl.size}"


# --------------------------------------------------------------- C) PNG with alpha
class TestPngAlphaPreserved:
    def test_rgba_png_kept_as_png(self, api_client, auth):
        body = _make_png_rgba(2000, 1500)
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {auth['token']}"},
            files={"file": ("alpha.png", body, "image/png")},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        print(f"\n[iter15-C] resp={j}")
        assert j["content_type"] == "image/png", j
        assert j["url"].startswith("/api/files/"), j
        assert j["original_bytes"] == len(body), j

        r2 = api_client.get(f"{BASE_URL}{j['url']}")
        assert r2.status_code == 200, r2.text[:200]
        assert r2.headers.get("content-type", "").startswith("image/png"), r2.headers
        dl = Image.open(io.BytesIO(r2.content))
        dl.load()
        print(f"[iter15-C] downloaded mode={dl.mode} size={dl.size}")
        assert dl.mode == "RGBA", f"expected RGBA, got {dl.mode}"
        # Resized: longest edge should be 1200
        assert max(dl.size) == 1200, f"expected max edge 1200, got {dl.size}"


# --------------------------------------------------------------- D) small image passthrough
class TestSmallImagePassThrough:
    def test_400x300_jpeg_not_upscaled(self, api_client, auth):
        body = _make_jpeg_fast(400, 300, quality=90)
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {auth['token']}"},
            files={"file": ("small.jpg", body, "image/jpeg")},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        print(f"\n[iter15-D] resp={j}")
        assert j["content_type"] == "image/jpeg", j
        assert j["original_bytes"] == len(body), j
        # May re-encode but shouldn't inflate significantly
        assert j["bytes"] <= int(1.5 * j["original_bytes"]), (
            f"unexpected inflation: {j['bytes']} vs {j['original_bytes']}"
        )

        r2 = api_client.get(f"{BASE_URL}{j['url']}")
        assert r2.status_code == 200
        dl = Image.open(io.BytesIO(r2.content))
        dl.load()
        print(f"[iter15-D] downloaded size={dl.size}")
        assert dl.size == (400, 300), f"expected (400,300), got {dl.size}"


# --------------------------------------------------------------- E) video passthrough
class TestVideoPassThrough:
    def test_mp4_bytes_untouched(self, api_client, auth):
        # ~500 KB of random-ish bytes with mp4 mime — server treats as video, no compression
        body = os.urandom(500 * 1024)
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {auth['token']}"},
            files={"file": ("clip.mp4", body, "video/mp4")},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        print(f"\n[iter15-E] resp={j}")
        assert j["content_type"] == "video/mp4", j
        assert j["original_bytes"] == len(body), j
        assert j["bytes"] == j["original_bytes"], (
            f"video should not be compressed: bytes={j['bytes']} orig={j['original_bytes']}"
        )
        assert j["url"].startswith("/api/files/"), j

        # Confirm bytes served back match
        r2 = api_client.get(f"{BASE_URL}{j['url']}")
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("video/mp4"), r2.headers
        assert len(r2.content) == len(body), (
            f"served bytes differ: {len(r2.content)} vs {len(body)}"
        )


# --------------------------------------------------------------- F) DB row has compression fields
class TestDbUploadsHasCompressionFields:
    def test_last_upload_row_has_compression_fields(self, api_client, auth):
        # Do a compression upload and directly check its DB row.
        body = _make_jpeg_fast(4000, 3000, quality=92)
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {auth['token']}"},
            files={"file": ("dbcheck.jpg", body, "image/jpeg")},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()

        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ["MONGO_URL"]
        dbname = os.environ["DB_NAME"]

        async def _check():
            cli = AsyncIOMotorClient(mongo_url)
            row = await cli[dbname].uploads.find_one({"path": j["path"]})
            cli.close()
            return row

        row = asyncio.new_event_loop().run_until_complete(_check())
        assert row is not None, "no db.uploads row found for compressed upload"
        print(f"\n[iter15-F] db row keys={sorted(row.keys())}")
        assert "original_bytes" in row and row["original_bytes"] == len(body), row
        assert "bytes" in row and row["bytes"] == j["bytes"], row
        assert "compression_ratio" in row, row
        assert 0 < row["compression_ratio"] < 1.0, row
        # Sanity: ratio matches bytes/original_bytes
        expected = round(row["bytes"] / row["original_bytes"], 3)
        assert abs(row["compression_ratio"] - expected) < 1e-3, (row["compression_ratio"], expected)


# --------------------------------------------------------------- G) Regression: rejections
class TestUploadRejectionsStillWork:
    def test_text_plain_400(self, api_client, auth):
        r = api_client.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {auth['token']}"},
            files={"file": ("hello.txt", b"hi", "text/plain")},
        )
        assert r.status_code == 400, r.text

    def test_no_auth_401(self, api_client):
        r = api_client.post(
            f"{API}/upload",
            files={"file": ("t.jpg", _make_jpeg_fast(100, 100), "image/jpeg")},
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
