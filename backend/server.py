from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import random
import secrets
import string
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal, Any, Dict
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

# Loyalty
POINTS_PER_REDEMPTION = 25
REFERRAL_REFERRER_REWARD = 200
REFERRAL_REFEREE_REWARD = 100

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


async def get_current_merchant(user=Depends(get_current_user)):
    if user.get("role") != "merchant":
        raise HTTPException(status_code=403, detail="Merchant role required")
    return user


def sanitize(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


def new_referral_code() -> str:
    return "HH" + ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


# =========================================================================
# MODELS
# =========================================================================
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=80)
    referral_code: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    preferred_categories: Optional[List[str]] = None


class MerchantOnboardIn(BaseModel):
    name: str
    category: str
    sub_category: Optional[str] = None
    description: Optional[str] = ""
    address: str
    lat: float
    lng: float
    hours: str
    phone: Optional[str] = None
    price_range: Optional[str] = "$$"
    logo: Optional[str] = None  # base64 data URI
    cover_image: Optional[str] = None  # base64 data URI
    gallery: Optional[List[str]] = None
    business_license_doc: Optional[str] = None  # base64
    tax_id_doc: Optional[str] = None  # base64
    owner_id_doc: Optional[str] = None  # base64
    tax_id_number: Optional[str] = None


class MerchantUpdateIn(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    hours: Optional[str] = None
    phone: Optional[str] = None
    logo: Optional[str] = None
    cover_image: Optional[str] = None
    gallery: Optional[List[str]] = None
    price_range: Optional[str] = None
    sub_category: Optional[str] = None


class DealIn(BaseModel):
    title: str
    description: str
    category: str
    deal_type: Literal["flash", "regular", "video"]
    before_price: Optional[float] = None
    after_price: float
    discount_pct: Optional[float] = None
    quantity: Optional[int] = None
    start_time: Optional[str] = None  # ISO
    expires_at: Optional[str] = None  # ISO
    per_customer_limit: int = 1
    terms: Optional[str] = "One per customer. Show code in-store."
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    dietary_tags: Optional[List[str]] = None
    sizes: Optional[List[str]] = None
    weight_unit: Optional[str] = None
    dimensions: Optional[str] = None
    is_draft: bool = False


class DealPatchIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    before_price: Optional[float] = None
    after_price: Optional[float] = None
    discount_pct: Optional[float] = None
    quantity: Optional[int] = None
    quantity_remaining: Optional[int] = None
    expires_at: Optional[str] = None
    is_paused: Optional[bool] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    terms: Optional[str] = None
    dietary_tags: Optional[List[str]] = None
    is_draft: Optional[bool] = None


class ValidateCodeIn(BaseModel):
    code: str


class RedeemIn(BaseModel):
    claim_id: str


class VoidClaimIn(BaseModel):
    reason: str = "no_show"


class PromoIn(BaseModel):
    code: str
    discount_pct: int
    max_uses: int = 100
    first_time_only: bool = True


class MessageIn(BaseModel):
    merchant_id: str
    text: str


# =========================================================================
# AUTH ROUTES
# =========================================================================
@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    referral_code = new_referral_code()
    referred_by = None
    starting_points = 0

    if body.referral_code:
        ref = await db.users.find_one({"referral_code": body.referral_code.upper()})
        if ref:
            referred_by = ref["id"]
            starting_points = REFERRAL_REFEREE_REWARD  # awarded on first claim

    user_doc = {
        "id": user_id,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": "customer",
        "preferred_categories": [],
        "favorited_merchants": [],
        "points": 0,
        "pending_signup_bonus": starting_points,
        "referral_code": referral_code,
        "referred_by": referred_by,
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id)
    return {
        "access_token": token,
        "user": _public_user(user_doc),
    }


def _public_user(u: dict) -> dict:
    return {
        "id": u["id"], "email": u["email"], "name": u["name"], "role": u.get("role", "customer"),
        "preferred_categories": u.get("preferred_categories", []),
        "favorited_merchants": u.get("favorited_merchants", []),
        "points": u.get("points", 0),
        "referral_code": u.get("referral_code"),
        "referred_by": u.get("referred_by"),
    }


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_token(user["id"])
    return {"access_token": token, "user": _public_user(user)}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return _public_user(user)


@api.patch("/auth/me")
async def update_me(body: UpdateProfileIn, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return _public_user(updated)


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
    query: Dict[str, Any] = {}
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
    deals = await db.deals.find(
        {"merchant_id": merchant_id, "is_draft": {"$ne": True}, "deleted": {"$ne": True}},
        {"_id": 0},
    ).to_list(200)
    m["deals"] = _enrich_deals(deals)
    # Log impression
    await db.events.insert_one({
        "id": str(uuid.uuid4()),
        "type": "merchant_view",
        "merchant_id": merchant_id,
        "created_at": iso(now_utc()),
    })
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
# MERCHANT-SIDE APIs (owned by current user)
# =========================================================================
@api.post("/merchant/onboard")
async def merchant_onboard(body: MerchantOnboardIn, user=Depends(get_current_user)):
    """Create or update the merchant profile for the current user. Auto-verifies for demo."""
    existing = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    doc: Dict[str, Any] = body.dict()
    doc["owner_id"] = user["id"]
    doc["verification_status"] = "verified"
    doc["verified"] = True
    doc["rating"] = existing.get("rating", 5.0) if existing else 5.0
    doc["review_count"] = existing.get("review_count", 0) if existing else 0
    doc["updated_at"] = iso(now_utc())

    if existing:
        await db.merchants.update_one({"id": existing["id"]}, {"$set": doc})
        merchant_id = existing["id"]
    else:
        merchant_id = str(uuid.uuid4())
        doc["id"] = merchant_id
        doc["created_at"] = iso(now_utc())
        await db.merchants.insert_one(doc)

    # Elevate role
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": "merchant"}})
    merchant = await db.merchants.find_one({"id": merchant_id}, {"_id": 0})
    return merchant


@api.get("/merchant/me")
async def get_my_merchant(user=Depends(get_current_merchant)):
    m = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Merchant profile not found")
    return m


@api.patch("/merchant/me")
async def update_my_merchant(body: MerchantUpdateIn, user=Depends(get_current_merchant)):
    existing = await db.merchants.find_one({"owner_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Merchant profile not found")
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if updates:
        updates["updated_at"] = iso(now_utc())
        await db.merchants.update_one({"id": existing["id"]}, {"$set": updates})
    m = await db.merchants.find_one({"id": existing["id"]}, {"_id": 0})
    return m


@api.get("/merchant/deals")
async def merchant_list_deals(user=Depends(get_current_merchant), include_drafts: bool = True):
    merchant = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")
    query: Dict[str, Any] = {"merchant_id": merchant["id"], "deleted": {"$ne": True}}
    if not include_drafts:
        query["is_draft"] = {"$ne": True}
    deals = await db.deals.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return _enrich_deals(deals)


@api.post("/merchant/deals")
async def merchant_create_deal(body: DealIn, user=Depends(get_current_merchant)):
    merchant = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")

    now = now_utc()
    deal_id = str(uuid.uuid4())
    discount_pct = body.discount_pct
    if discount_pct is None and body.before_price and body.after_price:
        discount_pct = round((body.before_price - body.after_price) / body.before_price * 100)

    expires_at = body.expires_at
    if not expires_at:
        if body.deal_type == "regular":
            expires_at = iso(now + timedelta(days=30))
        else:
            expires_at = iso(now + timedelta(hours=1))

    doc = {
        "id": deal_id,
        "owner_id": user["id"],
        "merchant_id": merchant["id"],
        "merchant_name": merchant["name"],
        "merchant_logo": merchant.get("logo"),
        "verified": merchant.get("verified", False),
        "category": body.category,
        "title": body.title,
        "description": body.description,
        "before_price": body.before_price,
        "after_price": body.after_price,
        "discount_pct": discount_pct,
        "quantity": body.quantity,
        "quantity_remaining": body.quantity if body.quantity is not None else None,
        "quantity_claimed": 0,
        "deal_type": body.deal_type,
        "start_time": body.start_time or iso(now),
        "expires_at": expires_at,
        "per_customer_limit": body.per_customer_limit,
        "terms": body.terms,
        "image_url": body.image_url,
        "video_url": body.video_url,
        "dietary_tags": body.dietary_tags or [],
        "sizes": body.sizes or [],
        "weight_unit": body.weight_unit,
        "dimensions": body.dimensions,
        "is_draft": body.is_draft,
        "is_paused": False,
        "deleted": False,
        "total_views": 0,
        "rating": merchant.get("rating", 5.0),
        "lat": merchant["lat"],
        "lng": merchant["lng"],
        "address": merchant.get("address"),
        "created_at": iso(now),
    }
    await db.deals.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/merchant/deals/{deal_id}")
async def merchant_patch_deal(deal_id: str, body: DealPatchIn, user=Depends(get_current_merchant)):
    deal = await db.deals.find_one({"id": deal_id})
    if not deal or deal.get("owner_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Deal not found")
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if "quantity" in updates and "quantity_remaining" not in updates:
        # If quantity increased, add delta to remaining
        delta = updates["quantity"] - (deal.get("quantity") or 0)
        updates["quantity_remaining"] = max(0, (deal.get("quantity_remaining") or 0) + delta)
    if updates:
        await db.deals.update_one({"id": deal_id}, {"$set": updates})
    d = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    return _enrich_deals([d])[0]


@api.post("/merchant/deals/{deal_id}/end")
async def merchant_end_deal(deal_id: str, user=Depends(get_current_merchant)):
    deal = await db.deals.find_one({"id": deal_id})
    if not deal or deal.get("owner_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Deal not found")
    await db.deals.update_one({"id": deal_id}, {"$set": {"expires_at": iso(now_utc())}})
    return {"ended": True}


@api.post("/merchant/deals/{deal_id}/duplicate")
async def merchant_duplicate_deal(deal_id: str, user=Depends(get_current_merchant)):
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not deal or deal.get("owner_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Deal not found")
    now = now_utc()
    new = {**deal}
    new["id"] = str(uuid.uuid4())
    new["title"] = f"{deal['title']} (copy)"
    new["is_draft"] = True
    new["is_paused"] = False
    new["quantity_claimed"] = 0
    new["quantity_remaining"] = deal.get("quantity")
    new["created_at"] = iso(now)
    new["expires_at"] = iso(now + timedelta(hours=1))
    await db.deals.insert_one(new)
    new.pop("_id", None)
    return new


@api.delete("/merchant/deals/{deal_id}")
async def merchant_delete_deal(deal_id: str, user=Depends(get_current_merchant)):
    deal = await db.deals.find_one({"id": deal_id})
    if not deal or deal.get("owner_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Deal not found")
    await db.deals.update_one({"id": deal_id}, {"$set": {"deleted": True}})
    return {"deleted": True}


# =========================================================================
# DEALS (PUBLIC)
# =========================================================================
def _enrich_deals(deals: List[dict]) -> List[dict]:
    now = now_utc()
    result = []
    for d in deals:
        d.pop("_id", None)
        if d.get("deleted") or d.get("is_paused") or d.get("is_draft"):
            # Mark hidden but include for merchants; public listings filter these out.
            pass
        expires_at = d.get("expires_at")
        if expires_at:
            try:
                exp_dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                d["expired"] = exp_dt < now
                d["minutes_left"] = max(0, int((exp_dt - now).total_seconds() // 60))
                d["is_live_now"] = (not d["expired"]) and d["minutes_left"] <= 60 and d.get("deal_type") != "regular"
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


def _public_filter(query: Dict[str, Any]) -> Dict[str, Any]:
    query["is_draft"] = {"$ne": True}
    query["is_paused"] = {"$ne": True}
    query["deleted"] = {"$ne": True}
    return query


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
    query: Dict[str, Any] = {}
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
    query = _public_filter(query)
    deals = await db.deals.find(query, {"_id": 0}).to_list(500)
    deals = _enrich_deals(deals)

    if lat is not None and lng is not None:
        for d in deals:
            d["distance_km"] = round(haversine_km(lat, lng, d.get("lat", lat), d.get("lng", lng)), 2)
        if max_km is not None:
            deals = [d for d in deals if d.get("distance_km", 999) <= max_km]

    if live_now:
        deals = [d for d in deals if d.get("is_live_now")]

    if sort == "distance" and lat is not None:
        deals.sort(key=lambda d: d.get("distance_km", 999))
    elif sort == "discount":
        deals.sort(key=lambda d: -(d.get("discount_pct") or 0))
    elif sort == "expiring":
        deals.sort(key=lambda d: d.get("minutes_left", 99999))
    elif sort == "rating":
        deals.sort(key=lambda d: -(d.get("rating") or 0))
    elif sort == "price_low":
        deals.sort(key=lambda d: d.get("after_price") or 0)
    else:
        if lat is not None:
            deals.sort(key=lambda d: (not d.get("is_live_now"), d.get("distance_km", 999), -(d.get("discount_pct") or 0)))
        else:
            deals.sort(key=lambda d: (not d.get("is_live_now"), -(d.get("discount_pct") or 0)))
    return deals


@api.get("/deals/live-now")
async def deals_live_now(lat: Optional[float] = None, lng: Optional[float] = None):
    q = _public_filter({"deal_type": {"$in": ["flash", "video"]}})
    deals = await db.deals.find(q, {"_id": 0}).to_list(500)
    deals = _enrich_deals(deals)
    deals = [d for d in deals if d.get("is_live_now")]
    if lat is not None and lng is not None:
        for d in deals:
            d["distance_km"] = round(haversine_km(lat, lng, d.get("lat", lat), d.get("lng", lng)), 2)
        deals.sort(key=lambda d: d.get("distance_km", 999))
    return deals


@api.get("/deals/reels")
async def deals_reels():
    q = _public_filter({"video_url": {"$ne": None, "$exists": True}})
    deals = await db.deals.find(q, {"_id": 0}).to_list(200)
    deals = _enrich_deals(deals)
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
    # Log view + increment counter
    await db.deals.update_one({"id": deal_id}, {"$inc": {"total_views": 1}})
    await db.events.insert_one({
        "id": str(uuid.uuid4()),
        "type": "deal_view",
        "deal_id": deal_id,
        "merchant_id": d["merchant_id"],
        "created_at": iso(now_utc()),
    })
    return d


# =========================================================================
# CLAIMS
# =========================================================================
@api.post("/deals/{deal_id}/claim")
async def claim_deal(deal_id: str, user=Depends(get_current_user)):
    deal = await db.deals.find_one({"id": deal_id})
    if not deal or deal.get("deleted") or deal.get("is_draft") or deal.get("is_paused"):
        raise HTTPException(status_code=404, detail="Deal not available")

    now = now_utc()
    expires_at_str = deal.get("expires_at")
    if expires_at_str:
        exp_dt = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
        if exp_dt < now:
            raise HTTPException(status_code=400, detail="This deal has expired")

    # Enforce per-customer limit
    limit = deal.get("per_customer_limit", 1)
    prev = await db.claims.count_documents({"user_id": user["id"], "deal_id": deal_id, "status": {"$in": ["active", "redeemed"]}})
    if prev >= limit:
        raise HTTPException(status_code=400, detail=f"Per-customer limit ({limit}) reached")

    # Atomic quantity decrement for flash deals
    if deal.get("deal_type") == "flash" and deal.get("quantity") is not None:
        result = await db.deals.update_one(
            {"id": deal_id, "quantity_remaining": {"$gt": 0}},
            {"$inc": {"quantity_remaining": -1, "quantity_claimed": 1}},
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="Sold out")

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
        "user_name": user["name"],
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
    await db.events.insert_one({
        "id": str(uuid.uuid4()),
        "type": "claim",
        "deal_id": deal_id,
        "merchant_id": deal["merchant_id"],
        "user_id": user["id"],
        "created_at": iso(now),
    })
    claim_doc.pop("_id", None)
    return claim_doc


@api.get("/claims/me")
async def my_claims(
    user=Depends(get_current_user),
    status_filter: Optional[Literal["active", "redeemed", "expired", "cancelled"]] = Query(default=None, alias="status"),
):
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

    query: Dict[str, Any] = {"user_id": user["id"]}
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
    deal = await db.deals.find_one({"id": c["deal_id"]})
    if deal and deal.get("deal_type") == "flash" and deal.get("quantity") is not None:
        await db.deals.update_one(
            {"id": c["deal_id"]},
            {"$inc": {"quantity_remaining": 1, "quantity_claimed": -1}},
        )
    return {"cancelled": True}


# =========================================================================
# MERCHANT REDEMPTION APIs
# =========================================================================
@api.get("/merchant/claims")
async def merchant_list_claims(
    user=Depends(get_current_merchant),
    status_filter: Optional[Literal["active", "redeemed", "expired", "cancelled"]] = Query(default=None, alias="status"),
    limit: int = 200,
):
    merchant = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")
    query: Dict[str, Any] = {"merchant_id": merchant["id"]}
    if status_filter:
        query["status"] = status_filter
    claims = await db.claims.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return claims


@api.post("/merchant/redeem/validate")
async def merchant_validate(body: ValidateCodeIn, user=Depends(get_current_merchant)):
    merchant = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")

    code = body.code.strip()
    # Accept either raw code or full QR payload "HH:<id>:<code>"
    if code.upper().startswith("HH:"):
        parts = code.split(":")
        if len(parts) < 3:
            raise HTTPException(status_code=400, detail="Malformed QR payload")
        claim_id = parts[1]
        raw_code = parts[2].upper()
        claim = await db.claims.find_one({"id": claim_id, "redemption_code": raw_code}, {"_id": 0})
    else:
        claim = await db.claims.find_one({"redemption_code": code.upper(), "merchant_id": merchant["id"]}, {"_id": 0})

    if not claim:
        raise HTTPException(status_code=404, detail="Code not found")
    if claim["merchant_id"] != merchant["id"]:
        raise HTTPException(status_code=403, detail="This code is not for your store")

    # Check expiry
    now = now_utc()
    deadline = datetime.fromisoformat(claim["redemption_deadline"].replace('Z', '+00:00'))
    if claim["status"] == "expired" or deadline < now:
        if claim["status"] == "active":
            await db.claims.update_one({"id": claim["id"]}, {"$set": {"status": "expired"}})
            claim["status"] = "expired"
    return claim


@api.post("/merchant/redeem")
async def merchant_redeem(body: RedeemIn, user=Depends(get_current_merchant)):
    merchant = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")

    claim = await db.claims.find_one({"id": body.claim_id})
    if not claim or claim["merchant_id"] != merchant["id"]:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim["status"] != "active":
        raise HTTPException(status_code=400, detail=f"Cannot redeem a {claim['status']} claim")

    now = now_utc()
    deadline = datetime.fromisoformat(claim["redemption_deadline"].replace('Z', '+00:00'))
    if deadline < now:
        await db.claims.update_one({"id": claim["id"]}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=400, detail="Claim expired")

    await db.claims.update_one(
        {"id": claim["id"]},
        {"$set": {"status": "redeemed", "redeemed_at": iso(now), "redeemed_by": user["id"]}},
    )

    # Award loyalty points to customer
    customer_id = claim["user_id"]
    customer = await db.users.find_one({"id": customer_id})
    points_awarded = POINTS_PER_REDEMPTION
    referral_bonus_awarded = 0

    # Referral: first redeemed claim triggers referral bonuses
    if customer and customer.get("referred_by"):
        prior = await db.claims.count_documents({"user_id": customer_id, "status": "redeemed"})
        # This function is being called BEFORE the count update; so if prior == 1 (this one)
        if prior == 1:
            # award referee (customer) bonus + referrer bonus
            referral_bonus_awarded = REFERRAL_REFEREE_REWARD
            await db.users.update_one(
                {"id": customer["referred_by"]},
                {"$inc": {"points": REFERRAL_REFERRER_REWARD}},
            )
            await db.points_ledger.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": customer["referred_by"],
                "delta": REFERRAL_REFERRER_REWARD,
                "reason": "referral_referrer",
                "meta": {"referred_user_id": customer_id},
                "created_at": iso(now),
            })

    total_delta = points_awarded + referral_bonus_awarded
    await db.users.update_one({"id": customer_id}, {"$inc": {"points": total_delta}})
    await db.points_ledger.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": customer_id,
        "delta": total_delta,
        "reason": "redemption" + ("_and_referral" if referral_bonus_awarded else ""),
        "meta": {"claim_id": claim["id"]},
        "created_at": iso(now),
    })

    await db.events.insert_one({
        "id": str(uuid.uuid4()),
        "type": "redemption",
        "deal_id": claim["deal_id"],
        "merchant_id": claim["merchant_id"],
        "user_id": customer_id,
        "created_at": iso(now),
    })

    updated = await db.claims.find_one({"id": claim["id"]}, {"_id": 0})
    return {"claim": updated, "points_awarded": total_delta}


@api.post("/merchant/claims/{claim_id}/void")
async def merchant_void_claim(claim_id: str, body: VoidClaimIn, user=Depends(get_current_merchant)):
    merchant = await db.merchants.find_one({"owner_id": user["id"]})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")
    claim = await db.claims.find_one({"id": claim_id})
    if not claim or claim["merchant_id"] != merchant["id"]:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim["status"] not in ("active",):
        raise HTTPException(status_code=400, detail=f"Cannot void a {claim['status']} claim")
    await db.claims.update_one(
        {"id": claim_id},
        {"$set": {"status": "cancelled", "voided_reason": body.reason, "voided_by": user["id"]}},
    )
    deal = await db.deals.find_one({"id": claim["deal_id"]})
    if deal and deal.get("deal_type") == "flash" and deal.get("quantity") is not None:
        await db.deals.update_one(
            {"id": claim["deal_id"]},
            {"$inc": {"quantity_remaining": 1, "quantity_claimed": -1}},
        )
    return {"voided": True}


# =========================================================================
# MERCHANT ANALYTICS
# =========================================================================
def _seed_heatmap() -> List[List[int]]:
    """Return a 7x24 matrix of pseudo-realistic engagement counts."""
    rows = []
    peak_hours = [12, 13, 18, 19, 20]
    for day in range(7):
        row = []
        weekend_boost = 1.4 if day in (5, 6) else 1.0
        for hr in range(24):
            base = 2 if hr < 8 or hr > 22 else 8
            if hr in peak_hours:
                base = 22
            elif hr in (11, 14, 17, 21):
                base = 14
            v = int(base * weekend_boost * (0.7 + random.random() * 0.6))
            row.append(v)
        rows.append(row)
    return rows


@api.get("/merchant/analytics/summary")
async def merchant_analytics(user=Depends(get_current_merchant)):
    merchant = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")

    mid = merchant["id"]
    seven_days_ago = iso(now_utc() - timedelta(days=7))

    total_views = await db.events.count_documents({"merchant_id": mid, "type": {"$in": ["deal_view", "merchant_view"]}})
    total_claims = await db.claims.count_documents({"merchant_id": mid})
    total_redeemed = await db.claims.count_documents({"merchant_id": mid, "status": "redeemed"})
    total_expired = await db.claims.count_documents({"merchant_id": mid, "status": "expired"})
    active_deals = await db.deals.count_documents({"merchant_id": mid, "deleted": {"$ne": True}, "is_draft": {"$ne": True}})

    # Recent claims for chart (last 7 days by day)
    recent = await db.claims.find(
        {"merchant_id": mid, "created_at": {"$gte": seven_days_ago}},
        {"_id": 0, "created_at": 1, "status": 1},
    ).to_list(1000)

    day_buckets: Dict[str, Dict[str, int]] = {}
    for i in range(6, -1, -1):
        d = (now_utc() - timedelta(days=i)).strftime("%Y-%m-%d")
        day_buckets[d] = {"claims": 0, "redemptions": 0}
    for c in recent:
        try:
            day = c["created_at"][:10]
            if day in day_buckets:
                day_buckets[day]["claims"] += 1
                if c["status"] == "redeemed":
                    day_buckets[day]["redemptions"] += 1
        except Exception:
            pass

    daily_series = [{"date": d, **v} for d, v in day_buckets.items()]

    redemption_rate = round((total_redeemed / total_claims * 100), 1) if total_claims else 0.0
    no_show_rate = round((total_expired / total_claims * 100), 1) if total_claims else 0.0

    # Revenue estimate (pay-in-store): sum(after_price) across redeemed claims
    redeemed_claims = await db.claims.find(
        {"merchant_id": mid, "status": "redeemed"},
        {"_id": 0, "after_price": 1},
    ).to_list(2000)
    gmv = round(sum((c.get("after_price") or 0) for c in redeemed_claims), 2)

    # Video performance (seeded + real)
    video_deals = await db.deals.find(
        {"merchant_id": mid, "video_url": {"$ne": None, "$exists": True}, "deleted": {"$ne": True}},
        {"_id": 0, "id": 1, "title": 1, "total_views": 1, "quantity_claimed": 1},
    ).to_list(200)
    for v in video_deals:
        v["watch_through_rate"] = round(55 + random.random() * 30, 1)
        v["shares"] = int(random.random() * 30)

    heatmap = _seed_heatmap()

    # Category benchmark (seeded — anonymized "similar merchants nearby")
    benchmark = {
        "your_redemption_rate": redemption_rate,
        "category_avg_redemption_rate": 62.4,
        "your_avg_claim_per_deal": round(total_claims / max(1, active_deals), 1),
        "category_avg_claim_per_deal": 8.7,
    }

    return {
        "totals": {
            "views": total_views,
            "claims": total_claims,
            "redemptions": total_redeemed,
            "no_shows": total_expired,
            "active_deals": active_deals,
            "gmv": gmv,
            "redemption_rate": redemption_rate,
            "no_show_rate": no_show_rate,
        },
        "daily": daily_series,
        "video_performance": video_deals,
        "heatmap": heatmap,
        "benchmark": benchmark,
    }


# =========================================================================
# LOYALTY & REFERRALS (CUSTOMER)
# =========================================================================
@api.get("/loyalty/me")
async def my_loyalty(user=Depends(get_current_user)):
    ledger = await db.points_ledger.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {
        "points": user.get("points", 0),
        "referral_code": user.get("referral_code"),
        "ledger": ledger,
    }


# =========================================================================
# CHAT (very simple)
# =========================================================================
@api.post("/chat/send")
async def chat_send(body: MessageIn, user=Depends(get_current_user)):
    merchant = await db.merchants.find_one({"id": body.merchant_id}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    doc = {
        "id": str(uuid.uuid4()),
        "thread_id": f"{body.merchant_id}:{user['id']}",
        "merchant_id": body.merchant_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "sender_role": user.get("role", "customer"),
        "text": body.text,
        "created_at": iso(now_utc()),
    }
    await db.messages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/chat/thread/{merchant_id}")
async def chat_thread(merchant_id: str, user=Depends(get_current_user)):
    thread_id = f"{merchant_id}:{user['id']}"
    msgs = await db.messages.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return msgs


@api.get("/merchant/chat/threads")
async def merchant_threads(user=Depends(get_current_merchant)):
    merchant = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")
    pipeline = [
        {"$match": {"merchant_id": merchant["id"]}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$user_id",
            "user_name": {"$first": "$user_name"},
            "last_text": {"$first": "$text"},
            "last_at": {"$first": "$created_at"},
        }},
        {"$project": {"_id": 0, "user_id": "$_id", "user_name": 1, "last_text": 1, "last_at": 1}},
    ]
    threads = await db.messages.aggregate(pipeline).to_list(200)
    return threads


# =========================================================================
# PROMO CODES
# =========================================================================
@api.get("/merchant/promo-codes")
async def merchant_promos(user=Depends(get_current_merchant)):
    merchant = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")
    promos = await db.promo_codes.find({"merchant_id": merchant["id"]}, {"_id": 0}).to_list(200)
    return promos


@api.post("/merchant/promo-codes")
async def merchant_create_promo(body: PromoIn, user=Depends(get_current_merchant)):
    merchant = await db.merchants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found")
    doc = {
        "id": str(uuid.uuid4()),
        "merchant_id": merchant["id"],
        "code": body.code.upper(),
        "discount_pct": body.discount_pct,
        "max_uses": body.max_uses,
        "uses": 0,
        "first_time_only": body.first_time_only,
        "created_at": iso(now_utc()),
    }
    await db.promo_codes.insert_one(doc)
    doc.pop("_id", None)
    return doc


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
        "price_range": "$$",
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
        "price_range": "$",
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
        "price_range": "$$$",
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
        "price_range": "$$$",
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
        "price_range": "$$",
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
        "price_range": "$$",
        "cover_image": "https://images.unsplash.com/photo-1568254183919-78a4f43a2877?w=1000",
        "logo": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200",
        "lat_offset": -0.012, "lng_offset": 0.002,
    },
]

# Sample-video library merchants can pick from
SAMPLE_VIDEOS = [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
]


@api.get("/sample-videos")
async def list_sample_videos():
    return [
        {"id": f"sample-{i}", "url": u, "label": f"Promo template {i+1}"}
        for i, u in enumerate(SAMPLE_VIDEOS)
    ]


def _make_deals_for_merchant(merchant: dict) -> List[dict]:
    now = now_utc()
    mid = merchant["id"]
    cat = merchant["category"]
    m_lat = merchant["lat"]
    m_lng = merchant["lng"]
    owner_id = merchant.get("owner_id")

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
            "owner_id": owner_id,
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
            "start_time": iso(now),
            "expires_at": iso(now + timedelta(minutes=expires_min)) if dtype != "regular" else iso(now + timedelta(days=30)),
            "per_customer_limit": 1,
            "image_url": img,
            "video_url": SAMPLE_VIDEOS[i % len(SAMPLE_VIDEOS)] if dtype == "video" else None,
            "terms": "One per customer. Show code in-store. Not combinable with other offers.",
            "rating": merchant.get("rating", 4.5),
            "lat": m_lat,
            "lng": m_lng,
            "address": merchant.get("address"),
            "dietary_tags": [],
            "sizes": [],
            "is_draft": False,
            "is_paused": False,
            "deleted": False,
            "total_views": 0,
            "created_at": iso(now),
        }
        result.append(deal)
    return result


async def _do_seed(lat: float, lng: float, force: bool = False):
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
            "owner_id": None,
            "name": template["name"],
            "category": template["category"],
            "description": template["description"],
            "address": template["address"],
            "hours": template["hours"],
            "phone": template["phone"],
            "rating": template["rating"],
            "review_count": template["review_count"],
            "verified": template["verified"],
            "verification_status": "verified",
            "price_range": template.get("price_range", "$$"),
            "cover_image": template["cover_image"],
            "logo": template["logo"],
            "gallery": [],
            "lat": lat + template["lat_offset"],
            "lng": lng + template["lng_offset"],
            "created_at": iso(now_utc()),
        }
        merchants.append(m)
        all_deals.extend(_make_deals_for_merchant(m))

    await db.merchants.insert_many([{**m} for m in merchants])
    await db.deals.insert_many([{**d} for d in all_deals])
    return {"seeded": True, "merchants": len(merchants), "deals": len(all_deals)}


@api.post("/seed")
async def seed_data(lat: float = 37.7749, lng: float = -122.4194, force: bool = False):
    return await _do_seed(lat, lng, force)


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
    count = await db.merchants.count_documents({})
    if count == 0:
        await _do_seed(37.7749, -122.4194)
        logger.info("Auto-seeded initial merchant + deal data")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
