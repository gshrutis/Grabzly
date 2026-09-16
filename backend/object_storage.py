"""Emergent Managed Object Storage wrapper.

Wraps the `/objstore/api/v1/storage` HTTP contract as a small module the
FastAPI app can call. Uploads/downloads are synchronous `requests` calls;
callers must use `starlette.concurrency.run_in_threadpool` to keep the
FastAPI event loop responsive.

Path convention: `{APP_NAME}/uploads/{owner_id}/{uuid}.{ext}`.
"""
from __future__ import annotations

import os
import uuid
from typing import Optional, Tuple

import requests

APP_NAME = "happyhour"


def _proxy_base() -> str:
    v = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip()
    return (v or "https://integrations.emergentagent.com").rstrip("/")


def _storage_url() -> str:
    return _proxy_base() + "/objstore/api/v1/storage"


class StorageUnavailable(RuntimeError):
    pass


class StorageOutOfCredits(RuntimeError):
    pass


class StorageError(RuntimeError):
    pass


_storage_key: Optional[str] = None


def _get_emergent_key() -> str:
    k = os.environ.get("EMERGENT_LLM_KEY")
    if not k:
        raise StorageUnavailable("EMERGENT_LLM_KEY is not set in backend environment")
    return k


def init_storage(force: bool = False) -> str:
    """Idempotent; caches the storage_key module-side. Set `force=True` to reset."""
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    try:
        r = requests.post(f"{_storage_url()}/init",
                          json={"emergent_key": _get_emergent_key()},
                          timeout=30)
    except requests.RequestException as e:
        raise StorageUnavailable(f"Unable to reach storage proxy: {e}") from e

    if r.status_code == 401:
        raise StorageUnavailable(
            "Object storage proxy rejected the emergent key. Likely wrong INTEGRATION_PROXY_URL for this environment."
        )
    if r.status_code >= 400:
        raise StorageError(f"init failed: {r.status_code} {r.text}")
    _storage_key = r.json()["storage_key"]
    return _storage_key


def _headers() -> dict:
    return {"X-Storage-Key": init_storage()}


def _handle_object_response(r: requests.Response) -> None:
    """Normalise object-endpoint errors → typed exceptions."""
    if r.status_code == 402:
        raise StorageOutOfCredits("Object storage is out of credits. Uploads are disabled; reads still work.")
    if r.status_code == 403:
        raise StorageUnavailable("Emergent key inactive or storage integration disabled.")
    if r.status_code == 503:
        # stale storage_key — reset once and let the caller decide to retry
        global _storage_key
        _storage_key = None
        raise StorageError("Storage temporarily unavailable (503). Storage key was reset.")
    if r.status_code >= 400:
        raise StorageError(f"storage {r.request.method} failed: {r.status_code} {r.text[:200]}")


def build_object_path(owner_id: str, filename_ext: str) -> Tuple[str, str]:
    """Return `(path, uuid_filename)` — path is what to store in DB."""
    fid = f"{uuid.uuid4().hex}.{filename_ext.lstrip('.').lower() or 'bin'}"
    path = f"{APP_NAME}/uploads/{owner_id}/{fid}"
    return path, fid


def put_object(path: str, data: bytes, content_type: str) -> dict:
    r = requests.put(
        f"{_storage_url()}/objects/{path}",
        headers={**_headers(), "Content-Type": content_type},
        data=data,
        timeout=180,
    )
    if r.status_code == 503:
        # retry once with a fresh storage_key
        _handle_object_response(r)
        r = requests.put(
            f"{_storage_url()}/objects/{path}",
            headers={**_headers(), "Content-Type": content_type},
            data=data,
            timeout=180,
        )
    _handle_object_response(r)
    return r.json()


def get_object(path: str) -> Tuple[bytes, str]:
    r = requests.get(
        f"{_storage_url()}/objects/{path}",
        headers=_headers(),
        timeout=90,
    )
    if r.status_code == 503:
        _handle_object_response(r)
        r = requests.get(
            f"{_storage_url()}/objects/{path}",
            headers=_headers(),
            timeout=90,
        )
    _handle_object_response(r)
    return r.content, r.headers.get("Content-Type", "application/octet-stream")
