"""One-off DB cleanup:
- Replace dead commondatastorage.googleapis.com/gtv-videos-bucket/* URLs with a
  working Pexels sample.
- Null out `file://` video/image URIs (they are local device paths and
  cannot be played on other clients).
- Delete obvious testing deals whose titles start with 'TEST' / 'Iter'.
- Report before/after counts.
"""
import asyncio, os, random
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

WORKING_VIDEOS = [
    "https://storage.googleapis.com/exoplayer-test-media-0/BigBuckBunny_320x180.mp4",
    "https://videos.pexels.com/video-files/4109369/4109369-uhd_2560_1440_25fps.mp4",
    "https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4",
    "https://videos.pexels.com/video-files/3141207/3141207-uhd_2560_1440_25fps.mp4",
    "https://videos.pexels.com/video-files/4114797/4114797-uhd_2560_1440_25fps.mp4",
]

WORKING_IMG_FALLBACK = "https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&w=1000"


async def main():
    url = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
    dbname = os.environ.get("DB_NAME") or "test_database"
    cli = AsyncIOMotorClient(url)
    db = cli[dbname]

    deals = db.deals
    total = await deals.count_documents({})
    print("Total deals:", total)

    # 1. Delete obvious test deals
    test_res = await deals.delete_many({"title": {"$regex": r"^(TEST|Iter\d|iter\d)", "$options": "i"}})
    print("Deleted TEST/iter deals:", test_res.deleted_count)

    # 2. Null out file:// video URIs
    r1 = await deals.update_many(
        {"video_url": {"$regex": r"^file:"}},
        {"$set": {"video_url": None}},
    )
    print("Cleared file:// video URIs:", r1.modified_count)

    # 3. Null out file:// image URIs (fallback to generic image)
    r2 = await deals.update_many(
        {"image_url": {"$regex": r"^file:"}},
        {"$set": {"image_url": WORKING_IMG_FALLBACK}},
    )
    print("Replaced file:// image URIs:", r2.modified_count)

    # 4. Replace dead commondatastorage URLs
    dead = await deals.find(
        {"video_url": {"$regex": r"commondatastorage\.googleapis\.com"}},
        {"_id": 1, "id": 1},
    ).to_list(1000)
    print("Dead commondatastorage videos:", len(dead))
    for d in dead:
        await deals.update_one(
            {"_id": d["_id"]},
            {"$set": {"video_url": random.choice(WORKING_VIDEOS)}},
        )

    # 5. If image_url is missing or empty, put a fallback
    r3 = await deals.update_many(
        {"$or": [{"image_url": None}, {"image_url": ""}, {"image_url": {"$exists": False}}]},
        {"$set": {"image_url": WORKING_IMG_FALLBACK}},
    )
    print("Filled empty images:", r3.modified_count)

    after = await deals.count_documents({})
    print("Deals after cleanup:", after)

    # Merchant side: replace any broken logo/cover images
    r4 = await db.merchants.update_many(
        {"logo": {"$regex": r"^file:"}},
        {"$set": {"logo": WORKING_IMG_FALLBACK}},
    )
    r5 = await db.merchants.update_many(
        {"cover_image": {"$regex": r"^file:"}},
        {"$set": {"cover_image": WORKING_IMG_FALLBACK}},
    )
    print("Cleaned merchant logos:", r4.modified_count, "covers:", r5.modified_count)

    cli.close()


if __name__ == "__main__":
    asyncio.run(main())
