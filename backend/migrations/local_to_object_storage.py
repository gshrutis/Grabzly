"""Move all legacy `/api/media/<uuid>.<ext>` files (in /app/backend/media/)
to Emergent Managed Object Storage and rewrite deal/merchant records to
point at `/api/files/<path>`.

Idempotent: re-running skips already-migrated URLs.
"""
import asyncio
import mimetypes
import os
import sys
from pathlib import Path
from urllib.parse import quote

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

load_dotenv(dotenv_path=str(BACKEND / ".env"))

from object_storage import put_object, build_object_path  # noqa: E402

MEDIA_DIR = BACKEND / "media"

SYSTEM_OWNER = "system-migration"


def guess_ct(fname: str) -> str:
    ct, _ = mimetypes.guess_type(fname)
    return ct or "application/octet-stream"


async def migrate_field(coll, doc, fields):
    """For each field on the doc holding a `/api/media/<id>` URL, upload to
    object storage and rewrite the field."""
    updates = {}
    for f in fields:
        v = doc.get(f)
        if not (isinstance(v, str) and v.startswith("/api/media/")):
            continue
        fname = v.split("/api/media/", 1)[1]
        src = MEDIA_DIR / fname
        if not src.exists():
            print(f"  MISSING file for {doc.get('id')}.{f}: {src}")
            continue
        data = src.read_bytes()
        ext = fname.rsplit(".", 1)[-1] if "." in fname else "bin"
        path, uploaded_name = build_object_path(SYSTEM_OWNER, ext)
        try:
            put_object(path, data, guess_ct(fname))
        except Exception as e:
            print(f"  UPLOAD FAILED {doc.get('id')}.{f}: {e}")
            continue
        new_url = f"/api/files/{quote(path, safe='/')}"
        updates[f] = new_url
        print(f"  {doc.get('id')}.{f}: {fname} → {path}")
    if updates:
        await coll.update_one({"_id": doc["_id"]}, {"$set": updates})
    return len(updates)


async def main():
    url = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
    dbname = os.environ.get("DB_NAME") or "test_database"
    cli = AsyncIOMotorClient(url)
    db = cli[dbname]

    deals = db.deals
    merchants = db.merchants
    total = 0

    async for d in deals.find({"$or": [
        {"image_url": {"$regex": r"^/api/media/"}},
        {"video_url": {"$regex": r"^/api/media/"}},
    ]}):
        total += await migrate_field(deals, d, ["image_url", "video_url"])

    async for m in merchants.find({"$or": [
        {"logo": {"$regex": r"^/api/media/"}},
        {"cover_image": {"$regex": r"^/api/media/"}},
    ]}):
        total += await migrate_field(merchants, m, ["logo", "cover_image"])

    print(f"\nTotal fields migrated: {total}")
    cli.close()


if __name__ == "__main__":
    asyncio.run(main())
