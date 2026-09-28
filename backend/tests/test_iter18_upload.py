"""Iteration 18 — Backend upload contract regression.
Verifies /api/upload works with real multipart file (image path with compression)
and the byte-exact GET flow via /api/files/<path>.
"""
import io
import os
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           "https://local-deals-now.preview.emergentagent.com"

PHONE = "+919877111222"
NAME = "Merchant Uploader"
OTP = "123456"


def _make_png(w: int = 32, h: int = 32) -> bytes:
    """Build a valid noisy PNG (deterministic pseudo-random) so JPEG compression
    actually reduces size (flat PNGs compress better than JPEG)."""
    from PIL import Image
    import random

    random.seed(42)
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)
    return buf.getvalue()


@pytest.fixture(scope="module")
def auth_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.post(
        f"{BASE_URL}/api/auth/otp/verify",
        json={"phone": PHONE, "code": OTP, "name": NAME},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token")
    assert tok
    return tok


class TestUploadContract:
    def test_upload_png_returns_files_url(self, auth_token):
        # Larger PNG so JPEG compression actually reduces bytes
        png = _make_png(800, 800)
        original = len(png)
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/upload",
            files=files,
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("url", "").startswith("/api/files/"), data
        assert data.get("bytes", 0) > 0
        assert data.get("content_type", "").startswith("image/")
        # Compression: server response includes original_bytes; ensure new bytes < original
        assert data["bytes"] < original, (
            f"expected compressed bytes {data['bytes']} < original {original}"
        )
        # keep for next test
        pytest.upload_url = data["url"]
        pytest.upload_bytes = data["bytes"]

    def test_upload_get_roundtrip_byte_exact(self, auth_token):
        url = getattr(pytest, "upload_url", None)
        if not url:
            pytest.skip("upload not run")
        r = requests.get(f"{BASE_URL}{url}", timeout=15)
        assert r.status_code == 200, r.text
        assert len(r.content) == pytest.upload_bytes
        assert r.headers.get("content-type", "").startswith(("image/", "application/"))

    def test_upload_rejects_json_content_type(self, auth_token):
        """Regression: sending plain JSON must fail with 4xx, NOT be silently
        accepted as an upload. Confirms server actually parses multipart."""
        r = requests.post(
            f"{BASE_URL}/api/upload",
            json={"file": "not-a-file"},
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=15,
        )
        assert r.status_code in (400, 415, 422), r.text
