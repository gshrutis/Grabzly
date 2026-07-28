from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import secrets
import string
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone
import uuid


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'happyhour-dev-secret-change-me')
JWT_ALG = 'HS256'
JWT_EXPIRE_DAYS = 30

app = FastAPI(title="HappyHour API")
api = APIRouter(prefix="/api")

logger = logging.getLogger("happyhour")
logging.basicConfig(level=logging.INFO)


# =========================================================================
# UTILS
# =========================================================================
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def random_code(length: int = 6) -> str:
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(length))


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'exp': datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


bearer = HTTPBearer(auto_error=False)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get('sub')
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# =========================================================================
# MODELS
# =========================================================================
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    preferred_categories: Optional[List[str]] = None


class ClaimIn(BaseModel):
    pass


# =========================================================================
# AUTH ROUTES
# =========================================================================
@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "preferred_categories": [],
        "favorited_merchants": [],
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id)
    return {
        "access_token": token,
        "user": {
            "id": user_id, "email": user_doc["email"], "name": user_doc["name"],
            "preferred_categories": [], "favorited_merchants": [],
        },
    }


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_token(user["id"])
    return {
        "access_token": token,
        "user": {
            "id": user["id"], "email": user["email"], "name": user["name"],
            "preferred_categories": user.get("preferred_categories", []),
            "favorited_merchants": user.get("favorited_merchants", []),
        },
    }


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


@api.patch("/auth/me")
async def update_me(body: UpdateProfileIn, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return updated


# =========================================================================
# CATEGORIES
# =========================================================================
CATEGORIES = [
    {"id": "food", "name": "Food", "icon": "utensils", "color": "#FF5A36"},
    {"id": "grocery", "name": "Grocery", "icon": "shopping-basket", "color": "#05A660"},
    {"id": "clothing", "name": "Clothing", "icon": "tshirt", "color": "#2BB8D6"},
    {"id": "kitchenware", "name": "Kitchenware", "icon": "coffee", "color": "#E59200"},
    {"id": "cafe", "name": "Cafe", "icon": "coffee", "color": "#8B4513"},
    {"id": "bakery", "name": "Bakery", "icon": "bread", "color": "#D2691E"},
]


@api.get("/categories")
async def list_categories():
    return CATEGORIES


# =========================================================================
# MERCHANTS
# =========================================================================
@api.get("/merchants")
async def list_merchants(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
):
    query = {}
    if category:
        query["category"] = category
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    docs = await db.merchants.find(query, {"_id": 0}).to_list(500)
    if lat is not None and lng is not None:
        for m in docs:
            m["distance_km"] = round(haversine_km(lat, lng, m["lat"], m["lng"]), 2)
        docs.sort(key=lambda m: m.get("distance_km", 999))
    return docs


@api.get("/merchants/{merchant_id}")
async def get_merchant(merchant_id: str, lat: Optional[float] = None, lng: Optional[float] = None):
    m = await db.merchants.find_one({"id": merchant_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Merchant not found")
    if lat is not None and lng is not None:
        m["distance_km"] = round(haversine_km(lat, lng, m["lat"], m["lng"]), 2)
    deals = await db.deals.find({"merchant_id": merchant_id}, {"_id": 0}).to_list(200)
    m["deals"] = _enrich_deals(deals)
    return m


@api.post("/merchants/{merchant_id}/follow")
async def toggle_follow(merchant_id: str, user=Depends(get_current_user)):
    m = await db.merchants.find_one({"id": merchant_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Merchant not found")
    favs = user.get("favorited_merchants", [])
    if merchant_id in favs:
        favs = [f for f in favs if f != merchant_id]
        following = False
    else:
        favs.append(merchant_id)
        following = True
    await db.users.update_one({"id": user["id"]}, {"$set": {"favorited_merchants": favs}})
    return {"following": following, "favorited_merchants": favs}


# =========================================================================
# DEALS
# =========================================================================
def _enrich_deals(deals: List[dict]) -> List[dict]:
    now = now_utc()
    result = []
    for d in deals:
        expires_at = d.get("expires_at")
        if expires_at:
            try:
                exp_dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                d["expired"] = exp_dt < now
                d["minutes_left"] = max(0, int((exp_dt - now).total_seconds() // 60))
                d["is_live_now"] = (not d["expired"]) and d["minutes_left"] <= 60
            except Exception:
                d["expired"] = False
                d["minutes_left"] = 9999
                d["is_live_now"] = False
        else:
            d["expired"] = False
            d["minutes_left"] = 9999
            d["is_live_now"] = False
        result.append(d)
    return result


@api.get("/deals")
async def list_deals(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    category: Optional[str] = None,
    deal_type: Optional[Literal["flash", "regular", "video"]] = None,
    live_now: bool = False,
    q: Optional[str] = None,
    max_km: Optional[float] = None,
    sort: Optional[Literal["distance", "discount", "expiring", "rating", "price_low"]] = None,
):
    query = {}
    if category:
        query["category"] = category
    if deal_type:
        query["deal_type"] = deal_type
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"merchant_name": {"$regex": q, "$options": "i"}},
        ]
    deals = await db.deals.find(query, {"_id": 0}).to_list(500)
    deals = _enrich_deals(deals)

    # Attach merchant distance
    if lat is not None and lng is not None:
        for d in deals:
            d["distance_km"] = round(haversine_km(lat, lng, d.get("lat", lat), d.get("lng", lng)), 2)
        if max_km is not None:
            deals = [d for d in deals if d.get("distance_km", 999) <= max_km]

    if live_now:
        deals = [d for d in deals if d.get("is_live_now")]

    # Sort
    if sort == "distance" and lat is not None:
        deals.sort(key=lambda d: d.get("distance_km", 999))
    elif sort == "discount":
        deals.sort(key=lambda d: -d.get("discount_pct", 0))
    elif sort == "expiring":
        deals.sort(key=lambda d: d.get("minutes_left", 99999))
    elif sort == "rating":
        deals.sort(key=lambda d: -d.get("rating", 0))
    elif sort == "price_low":
        deals.sort(key=lambda d: d.get("after_price", 0))
    else:
        # default: live-first, then distance if available, then discount
        if lat is not None:
            deals.sort(key=lambda d: (not d.get("is_live_now"), d.get("distance_km", 999), -d.get("discount_pct", 0)))
        else:
            deals.sort(key=lambda d: (not d.get("is_live_now"), -d.get("discount_pct", 0)))
    return deals


@api.get("/deals/live-now")
async def deals_live_now(lat: Optional[float] = None, lng: Optional[float] = None):
    deals = await db.deals.find({"deal_type": {"$in": ["flash", "video"]}}, {"_id": 0}).to_list(500)
    deals = _enrich_deals(deals)
    deals = [d for d in deals if d.get("is_live_now")]
    if lat is not None and lng is not None:
        for d in deals:
            d["distance_km"] = round(haversine_km(lat, lng, d.get("lat", lat), d.get("lng", lng)), 2)
        deals.sort(key=lambda d: d.get("distance_km", 999))
    return deals


@api.get("/deals/reels")
async def deals_reels():
    deals = await db.deals.find({"video_url": {"$ne": None, "$exists": True}}, {"_id": 0}).to_list(200)
    deals = _enrich_deals(deals)
    # Only non-expired
    deals = [d for d in deals if not d.get("expired")]
    return deals


@api.get("/deals/{deal_id}")
async def get_deal(deal_id: str, lat: Optional[float] = None, lng: Optional[float] = None):
    d = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Deal not found")
    d = _enrich_deals([d])[0]
    if lat is not None and lng is not None:
        d["distance_km"] = round(haversine_km(lat, lng, d.get("lat", lat), d.get("lng", lng)), 2)
    merchant = await db.merchants.find_one({"id": d["merchant_id"]}, {"_id": 0})
    d["merchant"] = merchant
    return d


# =========================================================================
# CLAIMS
# =========================================================================
@api.post("/deals/{deal_id}/claim")
async def claim_deal(deal_id: str, user=Depends(get_current_user)):
    deal = await db.deals.find_one({"id": deal_id})
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    now = now_utc()
    expires_at_str = deal.get("expires_at")
    if expires_at_str:
        exp_dt = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
        if exp_dt < now:
            raise HTTPException(status_code=400, detail="This deal has expired")

    # Atomic quantity decrement (race-safe) for flash deals with limited quantity
    if deal.get("deal_type") == "flash" and deal.get("quantity") is not None:
        result = await db.deals.update_one(
            {"id": deal_id, "quantity_remaining": {"$gt": 0}},
            {"$inc": {"quantity_remaining": -1, "quantity_claimed": 1}},
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="Sold out")

    # Redemption window: 60 min or until deal expiry, whichever earlier
    redemption_window = timedelta(minutes=60)
    redemption_deadline = now + redemption_window
    if expires_at_str:
        exp_dt = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
        redemption_deadline = min(redemption_deadline, exp_dt)

    claim_id = str(uuid.uuid4())
    code = random_code(6)
    qr_payload = f"HH:{claim_id}:{code}"

    claim_doc = {
        "id": claim_id,
        "user_id": user["id"],
        "deal_id": deal_id,
        "merchant_id": deal["merchant_id"],
        "deal_title": deal["title"],
        "merchant_name": deal.get("merchant_name"),
        "image_url": deal.get("image_url"),
        "before_price": deal.get("before_price"),
        "after_price": deal.get("after_price"),
        "discount_pct": deal.get("discount_pct"),
        "redemption_code": code,
        "qr_payload": qr_payload,
        "status": "active",
        "created_at": iso(now),
        "redemption_deadline": iso(redemption_deadline),
    }
    await db.claims.insert_one(claim_doc)
    claim_doc.pop("_id", None)
    return claim_doc


@api.get("/claims/me")
async def my_claims(
    user=Depends(get_current_user),
    status_filter: Optional[Literal["active", "redeemed", "expired", "cancelled"]] = Query(default=None, alias="status"),
):
    # Auto-expire past deadlines
    now = now_utc()
    active = await db.claims.find({"user_id": user["id"], "status": "active"}, {"_id": 0}).to_list(500)
    to_expire = []
    for c in active:
        try:
            deadline = datetime.fromisoformat(c["redemption_deadline"].replace('Z', '+00:00'))
            if deadline < now:
                to_expire.append(c["id"])
        except Exception:
            pass
    if to_expire:
        await db.claims.update_many({"id": {"$in": to_expire}}, {"$set": {"status": "expired"}})

    query = {"user_id": user["id"]}
    if status_filter:
        query["status"] = status_filter
    claims = await db.claims.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return claims


@api.get("/claims/{claim_id}")
async def get_claim(claim_id: str, user=Depends(get_current_user)):
    c = await db.claims.find_one({"id": claim_id, "user_id": user["id"]}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Claim not found")
    return c


@api.post("/claims/{claim_id}/cancel")
async def cancel_claim(claim_id: str, user=Depends(get_current_user)):
    c = await db.claims.find_one({"id": claim_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Claim not found")
    if c["status"] != "active":
        raise HTTPException(status_code=400, detail=f"Cannot cancel a {c['status']} claim")
    await db.claims.update_one({"id": claim_id}, {"$set": {"status": "cancelled"}})
    # Release quantity back to pool for flash deals
    deal = await db.deals.find_one({"id": c["deal_id"]})
    if deal and deal.get("deal_type") == "flash" and deal.get("quantity") is not None:
        await db.deals.update_one(
            {"id": c["deal_id"]},
            {"$inc": {"quantity_remaining": 1, "quantity_claimed": -1}},
        )
    return {"cancelled": True}


# =========================================================================
# SEED
# =========================================================================
SAMPLE_MERCHANTS = [
    {
        "name": "Bella Napoli Pizza",
        "category": "food",
        "description": "Authentic wood-fired Neapolitan pizza in the heart of downtown.",
        "address": "24 Market Street",
        "hours": "11:00 - 23:00",
        "phone": "+1 555 010 2020",
        "rating": 4.6,
        "review_count": 312,
        "verified": True,
        "cover_image": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1000",
        "logo": "https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=200",
        "lat_offset": 0.006, "lng_offset": -0.004,
    },
    {
        "name": "Green Basket Grocers",
        "category": "grocery",
        "description": "Farm-fresh produce, artisanal breads & pantry staples.",
        "address": "88 Orchard Ave",
        "hours": "07:00 - 22:00",
        "phone": "+1 555 010 3040",
        "rating": 4.4,
        "review_count": 128,
        "verified": True,
        "cover_image": "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1000",
        "logo": "https://images.unsplash.com/photo-1506617564039-2f3b650b7010?w=200",
        "lat_offset": -0.008, "lng_offset": 0.005,
    },
    {
        "name": "Loom & Thread",
        "category": "clothing",
        "description": "Curated streetwear and everyday essentials.",
        "address": "12 Fashion Blvd",
        "hours": "10:00 - 21:00",
        "phone": "+1 555 010 5060",
        "rating": 4.7,
        "review_count": 89,
        "verified": True,
        "cover_image": "https://images.pexels.com/photos/18699670/pexels-photo-18699670.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "logo": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=200",
        "lat_offset": 0.011, "lng_offset": 0.008,
    },
    {
        "name": "Copper & Clay Kitchen",
        "category": "kitchenware",
        "description": "Heirloom cookware, ceramics & barista tools.",
        "address": "5 Artisan Lane",
        "hours": "10:00 - 20:00",
        "phone": "+1 555 010 7070",
        "rating": 4.8,
        "review_count": 54,
        "verified": True,
        "cover_image": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1000",
        "logo": "https://images.unsplash.com/photo-1584990347449-a5d9f800a783?w=200",
        "lat_offset": -0.004, "lng_offset": -0.007,
    },
    {
        "name": "Brew House Coffee",
        "category": "cafe",
        "description": "Small-batch roasts, matcha & flaky pastries.",
        "address": "310 Ember St",
        "hours": "06:30 - 19:00",
        "phone": "+1 555 010 8080",
        "rating": 4.9,
        "review_count": 442,
        "verified": True,
        "cover_image": "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=1000",
        "logo": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200",
        "lat_offset": 0.003, "lng_offset": 0.010,
    },
    {
        "name": "The Sourdough Table",
        "category": "bakery",
        "description": "Naturally leavened breads baked fresh every morning.",
        "address": "7 Baker Row",
        "hours": "07:00 - 18:00",
        "phone": "+1 555 010 9090",
        "rating": 4.7,
        "review_count": 210,
        "verified": False,
        "cover_image": "https://images.unsplash.com/photo-1568254183919-78a4f43a2877?w=1000",
        "logo": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200",
        "lat_offset": -0.012, "lng_offset": 0.002,
    },
]

# Reliable public sample videos (Google Cloud sample bucket)
SAMPLE_VIDEOS = [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
]


def _make_deals_for_merchant(merchant: dict) -> List[dict]:
    now = now_utc()
    mid = merchant["id"]
    cat = merchant["category"]
    m_lat = merchant["lat"]
    m_lng = merchant["lng"]

    deals_per_category = {
        "food": [
            ("Neapolitan Margherita — 40% Off", "Classic tomato, buffalo mozzarella & basil.", 18.0, 10.8, 40, 12, 30, "flash", "https://images.unsplash.com/photo-1594007654729-407eedc4be65?w=1000"),
            ("Truffle Pasta Tasting", "Fresh tagliatelle with black truffle shavings.", 26.0, 18.2, 30, None, 240, "regular", "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=1000"),
            ("2-for-1 Aperitivo", "Any spritz + antipasti board.", 24.0, 12.0, 50, 20, 45, "video", "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1000"),
        ],
        "grocery": [
            ("Organic Berry Basket", "Strawberries, blueberries & raspberries.", 12.0, 7.2, 40, 30, 90, "flash", "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=1000"),
            ("Sunday Fresh Fish Deal", "Wild-caught salmon fillet 500g.", 22.0, 15.4, 30, None, 300, "regular", "https://images.unsplash.com/photo-1544943910-4c1dc44aab44?w=1000"),
        ],
        "clothing": [
            ("Denim Days — Buy 1 Get 1", "Selected premium denim jackets.", 120.0, 60.0, 50, 8, 55, "flash", "https://images.pexels.com/photos/18699670/pexels-photo-18699670.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"),
            ("Winter Knits Collection", "Merino wool sweaters, all sizes.", 85.0, 68.0, 20, None, 1440, "regular", "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=1000"),
            ("Sneaker Drop 20% Off", "New-season low tops.", 95.0, 76.0, 20, 15, 25, "video", "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1000"),
        ],
        "kitchenware": [
            ("Handmade Ceramic Mug Set", "Set of 4, glazed by local artisans.", 48.0, 33.6, 30, 10, 180, "regular", "https://images.unsplash.com/photo-1614859138332-c451ccdf276f?w=1000"),
            ("Cast Iron Pan Flash Sale", "Pre-seasoned 10-inch skillet.", 65.0, 39.0, 40, 6, 35, "flash", "https://images.unsplash.com/photo-1584990347449-a5d9f800a783?w=1000"),
        ],
        "cafe": [
            ("Happy Hour Latte", "Any latte, half price 3-5pm.", 6.0, 3.0, 50, 40, 20, "flash", "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1000"),
            ("Pastry + Drip Combo", "Any pastry + drip coffee.", 9.5, 6.5, 30, None, 720, "regular", "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1000"),
            ("New Cold Brew Launch", "Try our nitro cold brew.", 6.5, 4.5, 30, 25, 50, "video", "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=1000"),
        ],
        "bakery": [
            ("End-of-Day Loaves 50% Off", "Sourdough, rye & country loaves.", 8.0, 4.0, 50, 18, 40, "flash", "https://images.unsplash.com/photo-1568254183919-78a4f43a2877?w=1000"),
            ("Croissant Trio Box", "Butter, almond & pain au chocolat.", 14.0, 11.2, 20, None, 480, "regular", "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1000"),
        ],
    }

    result = []
    templates = deals_per_category.get(cat, [])
    for i, (title, desc, before, after, disc, qty, expires_min, dtype, img) in enumerate(templates):
        deal_id = str(uuid.uuid4())
        deal = {
            "id": deal_id,
            "merchant_id": mid,
            "merchant_name": merchant["name"],
            "merchant_logo": merchant.get("logo"),
            "verified": merchant.get("verified", False),
            "category": cat,
            "title": title,
            "description": desc,
            "before_price": before,
            "after_price": after,
            "discount_pct": disc,
            "quantity": qty,
            "quantity_remaining": qty if qty is not None else None,
            "quantity_claimed": 0,
            "deal_type": dtype,
            "expires_at": iso(now + timedelta(minutes=expires_min)) if dtype != "regular" else iso(now + timedelta(days=30)),
            "image_url": img,
            "video_url": SAMPLE_VIDEOS[i % len(SAMPLE_VIDEOS)] if dtype == "video" else None,
            "terms": "One per customer. Show code in-store. Not combinable with other offers.",
            "rating": merchant.get("rating", 4.5),
            "lat": m_lat,
            "lng": m_lng,
            "address": merchant.get("address"),
            "created_at": iso(now),
        }
        result.append(deal)
    return result


@api.post("/seed")
async def seed_data(
    lat: float = Query(default=37.7749, description="User anchor latitude"),
    lng: float = Query(default=-122.4194, description="User anchor longitude"),
    force: bool = False,
):
    existing = await db.merchants.count_documents({})
    if existing > 0 and not force:
        return {"seeded": False, "message": "Already seeded", "merchants": existing}

    if force:
        await db.merchants.delete_many({})
        await db.deals.delete_many({})

    merchants = []
    all_deals = []
    for template in SAMPLE_MERCHANTS:
        m_id = str(uuid.uuid4())
        m = {
            "id": m_id,
            "name": template["name"],
            "category": template["category"],
            "description": template["description"],
            "address": template["address"],
            "hours": template["hours"],
            "phone": template["phone"],
            "rating": template["rating"],
            "review_count": template["review_count"],
            "verified": template["verified"],
            "cover_image": template["cover_image"],
            "logo": template["logo"],
            "lat": lat + template["lat_offset"],
            "lng": lng + template["lng_offset"],
            "created_at": iso(now_utc()),
        }
        merchants.append(m)
        all_deals.extend(_make_deals_for_merchant(m))

    await db.merchants.insert_many([{**m} for m in merchants])
    await db.deals.insert_many([{**d} for d in all_deals])
    return {"seeded": True, "merchants": len(merchants), "deals": len(all_deals)}


@api.get("/")
async def root():
    return {"service": "happyhour", "ok": True}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    # Auto-seed on first boot for demo experience
    count = await db.merchants.count_documents({})
    if count == 0:
        # Default anchor: San Francisco (matches expo-location fallback prompt experience)
        merchants = []
        all_deals = []
        anchor_lat, anchor_lng = 37.7749, -122.4194
        for template in SAMPLE_MERCHANTS:
            m_id = str(uuid.uuid4())
            m = {
                "id": m_id,
                "name": template["name"],
                "category": template["category"],
                "description": template["description"],
                "address": template["address"],
                "hours": template["hours"],
                "phone": template["phone"],
                "rating": template["rating"],
                "review_count": template["review_count"],
                "verified": template["verified"],
                "cover_image": template["cover_image"],
                "logo": template["logo"],
                "lat": anchor_lat + template["lat_offset"],
                "lng": anchor_lng + template["lng_offset"],
                "created_at": iso(now_utc()),
            }
            merchants.append(m)
            all_deals.extend(_make_deals_for_merchant(m))
        if merchants:
            await db.merchants.insert_many(merchants)
            await db.deals.insert_many(all_deals)
            logger.info(f"Auto-seeded {len(merchants)} merchants and {len(all_deals)} deals")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
