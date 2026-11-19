"""Cloudflare R2 storage adapter for Grabzly.

Credentials are read from environment variables. This module does not
enable public access or change the existing Emergent storage integration.
"""
from __future__ import annotations

import os
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError


class R2StorageError(RuntimeError):
    """Raised when an R2 operation fails."""


def _required_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise R2StorageError(f"Required R2 setting is missing: {name}")
    return value


@lru_cache(maxsize=1)
def _client():
    account_id = _required_env("R2_ACCOUNT_ID")
    access_key = _required_env("R2_ACCESS_KEY_ID")
    secret_key = _required_env("R2_SECRET_ACCESS_KEY")

    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=os.getenv("R2_REGION", "auto"),
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def _bucket() -> str:
    return _required_env("R2_BUCKET")


def get_object_info(path: str) -> tuple[int, str]:
    """Return object size and content type without downloading its body."""
    try:
        result = _client().head_object(Bucket=_bucket(), Key=path)
        return (
            int(result["ContentLength"]),
            result.get("ContentType", "application/octet-stream"),
        )
    except (ClientError, BotoCoreError, R2StorageError) as exc:
        raise R2StorageError(
            f"R2 metadata lookup failed: {type(exc).__name__}"
        ) from exc


def get_object_range(
    path: str,
    start: int,
    end: int,
) -> tuple[bytes, str, int]:
    """Read only the requested inclusive byte range from R2."""
    if start < 0 or end < start:
        raise ValueError("Invalid byte range")

    try:
        result = _client().get_object(
            Bucket=_bucket(),
            Key=path,
            Range=f"bytes={start}-{end}",
        )
        body = result["Body"]
        try:
            data = body.read()
        finally:
            body.close()

        content_range = result.get("ContentRange", "")
        # Expected format: bytes 0-1023/50000
        total_size = int(content_range.rsplit("/", 1)[1])

        return (
            data,
            result.get("ContentType", "application/octet-stream"),
            total_size,
        )
    except (ClientError, BotoCoreError, R2StorageError, KeyError, ValueError, IndexError) as exc:
        raise R2StorageError(
            f"R2 range download failed: {type(exc).__name__}"
        ) from exc


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload an object to the private R2 bucket."""
    try:
        result = _client().put_object(
            Bucket=_bucket(),
            Key=path,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )
        return {
            "path": path,
            "etag": result.get("ETag", "").strip('"'),
            "bytes": len(data),
            "storage": "r2",
        }
    except (ClientError, BotoCoreError, R2StorageError) as exc:
        raise R2StorageError(f"R2 upload failed: {type(exc).__name__}") from exc


def get_object(path: str) -> tuple[bytes, str]:
    """Read an entire object from R2; legacy storage is not accessed here."""
    try:
        result = _client().get_object(Bucket=_bucket(), Key=path)
        body = result["Body"]
        try:
            data = body.read()
        finally:
            body.close()
        return data, result.get("ContentType", "application/octet-stream")
    except (ClientError, BotoCoreError, R2StorageError) as exc:
        raise R2StorageError(f"R2 download failed: {type(exc).__name__}") from exc
