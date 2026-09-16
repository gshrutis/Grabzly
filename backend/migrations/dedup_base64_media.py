"""Migration: convert every base64 `data:image/...` value on deals/merchants
into a hosted file at /app/backend/media/ and rewrite the URL to
`/api/media/<uuid>.<ext>`. Also swaps Pexels videos (which sometimes 403 due
to Referer requirements on mobile) to the reliable ExoPlayer/samplelib URLs
that work over cellular.
"""
import asyncio
import base64
import os
import re
import uuid
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

ROOT = Path(__file__).resolve().parent.parent  # /app/backend
MEDIA_DIR = ROOT / "media"
MEDIA_DIR.mkdir(exist_ok=True, parents=True)

# Public-facing (relative) path. Frontend prepends EXPO_PUBLIC_BACKEND_URL when
# rendering, so we store the RELATIVE URL to remain host-agnostic.
MEDIA_URL = "/api/media"

# Reliable videos that don't require Referer header
RELIABLE_VIDEOS = [
    "https://storage.googleapis.com/exoplayer-test-media-0/BigBuckBunny_320x180.mp4",
    "https://download.samplelib.com/mp4/sample-5s.mp4",
    "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
    "https://test-videos.co.uk/vids/elephantsdream/mp4/h264/360/Elephants_Dream_360_10s_1MB.mp4",
]

DATA_URL_RE = re.compile(r"^data:(image|video)/([a-zA-Z0-9.+-]+);base64,(.+)$", re.DOTALL)


def decode_and_save(data_url: str) -> str | None:
    m = DATA_URL_RE.match(data_url.strip())
    if not m:
        return None
    kind, subtype, payload = m.group(1), m.group(2), m.group(3)
    # normalise extension
    ext_map = {"jpeg": "jpg", "svg+xml": "svg", "quicktime": "mov"}
    ext = ext_map.get(subtype.lower(), subtype.lower())
    if ext not in {"jpg", "png", "webp", "gif", "svg", "mp4", "webm", "mov"}:
        ext = "jpg"  # default safe
    fname = f"{uuid.uuid4().hex}.{ext}"
    try:
        raw = base64.b64decode(payload)
    except Exception:
        return None
    dest = MEDIA_DIR / fname
    dest.write_bytes(raw)
    return f"{MEDIA_URL}/{fname}"


async def migrate_collection(db, coll_name: str, fields: list[str]):
    coll = db[coll_name]
    or_conds = []
    for f in fields:
        or_conds.append({f: {"$regex": r"^data:"}})
    cursor = coll.find({"$or": or_conds})
    n = 0
    async for doc in cursor:
        updates = {}
        for f in fields:
            v = doc.get(f)
            if isinstance(v, str) and v.startswith("data:"):
                new_url = decode_and_save(v)
                if new_url:
                    updates[f] = new_url
                    print(f"  {coll_name}.{doc.get('id') or doc.get('_id')} {f}: {len(v)/1024:.0f}KB → {new_url}")
        if updates:
            await coll.update_one({"_id": doc["_id"]}, {"$set": updates})
            n += 1
    print(f"{coll_name}: migrated {n} docs\n")


async def swap_pexels_videos(db):
    coll = db.deals
    cur = coll.find({"video_url": {"$regex": r"videos\.pexels\.com"}})
    n = 0
    idx = 0
    async for doc in cur:
        new_url = RELIABLE_VIDEOS[idx % len(RELIABLE_VIDEOS)]
        idx += 1
        await coll.update_one({"_id": doc["_id"]}, {"$set": {"video_url": new_url}})
        print(f"  deals.{doc.get('id')}: {doc.get('video_url')[:60]} → {new_url}")
        n += 1
    print(f"deals: swapped {n} Pexels videos\n")


async def main():
    url = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
    dbname = os.environ.get("DB_NAME") or "test_database"
    cli = AsyncIOMotorClient(url)
    db = cli[dbname]

    print(f"MEDIA_DIR: {MEDIA_DIR}\n")

    await migrate_collection(db, "deals", ["image_url", "video_url"])
    await migrate_collection(db, "merchants", ["logo", "cover_image"])
    await swap_pexels_videos(db)

    # Print resulting distribution
    from collections import Counter
    c = Counter()
    async for d in db.deals.find({}, {"image_url": 1, "video_url": 1}):
        for k in ("image_url", "video_url"):
            v = d.get(k) or ""
            if not v: c[f"{k}:NONE"] += 1
            elif v.startswith("data:"): c[f"{k}:BASE64"] += 1
            elif v.startswith("/api/media"): c[f"{k}:MEDIA"] += 1
            elif v.startswith("http"): c[f"{k}:HTTPS"] += 1
            else: c[f"{k}:OTHER"] += 1
    print("Final distribution:", dict(c))
    cli.close()


if __name__ == "__main__":
    asyncio.run(main())
