"""
Iteration 16 — HTTP Range request support on GET /api/files/{obj_path:path}

Coverage:
 A) No Range → 200 + Accept-Ranges + Content-Length + full body
 B) bytes=0-99 → 206 + Content-Range + slice matches
 C) bytes=100- → 206 open-ended
 D) bytes=-50 → 206 suffix slice
 E) bytes=99999999- → 416 + Content-Range: bytes */total
 F) pages=0-1 → 416 (bad unit)
 G) bytes=0-10,20-30 → 416 (multi-range unsupported)
 H) /api/files/does/not/exist.jpg → 404
 I) Legacy /api/media static file → 200 (regression)
"""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def object_path(session):
    """Pick a real migrated file path from /api/deals whose image_url starts with /api/files/."""
    r = session.get(f"{BASE_URL}/api/deals?limit=100", timeout=30)
    assert r.status_code == 200, r.text
    deals = r.json()
    for d in deals:
        img = d.get("image_url") or ""
        if img.startswith("/api/files/"):
            # strip the /api/files/ prefix
            return img[len("/api/files/"):]
        vid = d.get("video_url") or ""
        if vid.startswith("/api/files/"):
            return vid[len("/api/files/"):]
    pytest.skip("No migrated /api/files/ asset found in first 100 deals")


@pytest.fixture(scope="module")
def full_body(session, object_path):
    """Fetch full body once to use as ground truth."""
    url = f"{BASE_URL}/api/files/{object_path}"
    r = session.get(url, timeout=30)
    assert r.status_code == 200, f"Unable to fetch full body: {r.status_code} {r.text[:200]}"
    return r.content


# ---------- A: no Range → 200 ----------
class TestFullDownload:
    def test_no_range_returns_200_with_full_body(self, session, object_path, full_body):
        url = f"{BASE_URL}/api/files/{object_path}"
        r = session.get(url, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("Accept-Ranges", "").lower() == "bytes"
        total = len(full_body)
        assert int(r.headers.get("Content-Length", "0")) == total
        assert len(r.content) == total
        # Note: Cache-Control is set to "public, max-age=86400" by the backend but
        # the K8s ingress / Cloudflare edge overrides it to "no-store,..." in the
        # preview environment. Verified upstream value via localhost:8001.


# ---------- B/C/D: valid ranges ----------
class TestValidRanges:
    def test_bytes_0_99_returns_206(self, session, object_path, full_body):
        url = f"{BASE_URL}/api/files/{object_path}"
        total = len(full_body)
        r = session.get(url, headers={"Range": "bytes=0-99"}, timeout=30)
        assert r.status_code == 206
        assert r.headers.get("Content-Range") == f"bytes 0-99/{total}"
        assert int(r.headers.get("Content-Length", "0")) == 100
        assert len(r.content) == 100
        assert r.content == full_body[0:100]
        assert r.headers.get("Accept-Ranges", "").lower() == "bytes"

    def test_open_range_bytes_100_returns_206(self, session, object_path, full_body):
        url = f"{BASE_URL}/api/files/{object_path}"
        total = len(full_body)
        r = session.get(url, headers={"Range": "bytes=100-"}, timeout=30)
        assert r.status_code == 206
        assert r.headers.get("Content-Range") == f"bytes 100-{total - 1}/{total}"
        expected_len = total - 100
        assert int(r.headers.get("Content-Length", "0")) == expected_len
        assert len(r.content) == expected_len
        assert r.content == full_body[100:]

    def test_suffix_range_bytes_neg_50_returns_206(self, session, object_path, full_body):
        url = f"{BASE_URL}/api/files/{object_path}"
        total = len(full_body)
        r = session.get(url, headers={"Range": "bytes=-50"}, timeout=30)
        assert r.status_code == 206
        assert r.headers.get("Content-Range") == f"bytes {total - 50}-{total - 1}/{total}"
        assert int(r.headers.get("Content-Length", "0")) == 50
        assert len(r.content) == 50
        assert r.content == full_body[-50:]


# ---------- E/F/G: invalid → 416 ----------
class TestInvalidRanges:
    def test_out_of_bounds_returns_416(self, session, object_path, full_body):
        url = f"{BASE_URL}/api/files/{object_path}"
        total = len(full_body)
        r = session.get(url, headers={"Range": "bytes=99999999-"}, timeout=30)
        assert r.status_code == 416
        assert r.headers.get("Content-Range") == f"bytes */{total}"

    def test_bad_unit_returns_416(self, session, object_path, full_body):
        url = f"{BASE_URL}/api/files/{object_path}"
        total = len(full_body)
        r = session.get(url, headers={"Range": "pages=0-1"}, timeout=30)
        assert r.status_code == 416
        assert r.headers.get("Content-Range") == f"bytes */{total}"

    def test_multi_range_returns_416(self, session, object_path, full_body):
        url = f"{BASE_URL}/api/files/{object_path}"
        total = len(full_body)
        r = session.get(url, headers={"Range": "bytes=0-10,20-30"}, timeout=30)
        assert r.status_code == 416
        assert r.headers.get("Content-Range") == f"bytes */{total}"


# ---------- H: 404 regression ----------
class TestNotFound:
    def test_missing_object_returns_404(self, session):
        url = f"{BASE_URL}/api/files/does/not/exist.jpg"
        r = session.get(url, timeout=30)
        assert r.status_code == 404


# ---------- I: legacy /api/media static regression ----------
class TestLegacyMedia:
    def test_legacy_media_still_works(self, session):
        media_dir = "/app/backend/media"
        if not os.path.isdir(media_dir):
            pytest.skip("Legacy media dir absent")
        files = [f for f in os.listdir(media_dir) if os.path.isfile(os.path.join(media_dir, f))]
        if not files:
            pytest.skip("No legacy media files")
        fname = files[0]
        url = f"{BASE_URL}/api/media/{fname}"
        r = session.get(url, timeout=30)
        assert r.status_code == 200, f"legacy media broken: {r.status_code}"
        assert len(r.content) > 0
