"""Admin Panel — auth + read/mutate endpoints for Merchants, Deals, Customers.

Design principles:
- Reuse existing MongoDB collections & business logic; no separate admin DB.
- Every route protected by `require_admin` (verifies JWT AND role in DB).
- Server-side pagination + filtering; no full-collection dumps.
- Efficient MongoDB aggregations for dashboard KPIs.
- Sensitive fields (password_hash, otp codes) never leak in responses.
"""
from __future__ import annotations

import asyncio
import math
import os
import re
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field


def _slugify(s: str) -> str:
    """Turn 'Cafés & Bakery!' into 'cafes-bakery' — deterministic."""
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or f"item-{uuid.uuid4().hex[:6]}"


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))

# ---- runtime-injected deps (populated by wire_admin_router) -------------
_D: Dict[str, Any] = {}


def _db():
    return _D["db"]


async def require_admin(user=None):
    # Runtime shim — actual implementation supplied via wiring below.
    return await _D["_impl_require_admin"]()


# -------------------------------------------------------------------------
admin = APIRouter(prefix="/api/admin", tags=["admin"])

# -------------------------------------------------------------------------
# Brute-force protection (in-memory)
# -------------------------------------------------------------------------
FAILED_LIMIT = 5
LOCK_SECONDS = 15 * 60
_failed: dict[str, list[float]] = defaultdict(list)
_rate_lock = asyncio.Lock()


async def _check_locked(email: str) -> bool:
    now = time.monotonic()
    async with _rate_lock:
        attempts = [t for t in _failed[email] if now - t < LOCK_SECONDS]
        _failed[email] = attempts
        return len(attempts) >= FAILED_LIMIT


async def _record_failed(email: str) -> None:
    now = time.monotonic()
    async with _rate_lock:
        _failed[email] = [t for t in _failed[email] if now - t < LOCK_SECONDS] + [now]


async def _clear_failures(email: str) -> None:
    async with _rate_lock:
        _failed.pop(email, None)


def _norm_email(e: str) -> str:
    return (e or "").strip().casefold()


# -------------------------------------------------------------------------
# Auth
# -------------------------------------------------------------------------
class AdminLoginIn(BaseModel):
    email: str
    password: str


class AdminOut(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    role: str


class AdminLoginOut(BaseModel):
    access_token: str
    admin: AdminOut


@admin.post("/auth/login", response_model=AdminLoginOut)
async def admin_login(payload: AdminLoginIn):
    db = _db()
    verify_password = _D["verify_password"]
    create_token = _D["create_token"]
    email = _norm_email(str(payload.email))

    if await _check_locked(email):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")

    user = await db.users.find_one({"email": email})
    ok = False
    if user and user.get("password_hash"):
        ok = verify_password(payload.password, user["password_hash"])
    if not user or not ok or user.get("role") not in ("admin", "super_admin"):
        if not user:
            verify_password(payload.password, "$2b$12$" + "a" * 53)
        await _record_failed(email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await _clear_failures(email)
    token = create_token(user["id"])
    return AdminLoginOut(
        access_token=token,
        admin=AdminOut(id=user["id"], email=user["email"], name=user.get("name"), role=user["role"]),
    )


@admin.get("/me")
async def admin_me(admin_user=Depends(require_admin)):
    return {"admin": {"id": admin_user["id"], "email": admin_user["email"],
                        "name": admin_user.get("name"), "role": admin_user["role"]}}


# -------------------------------------------------------------------------
# Dashboard
# -------------------------------------------------------------------------
def _range_start(range_key: str) -> datetime:
    now = datetime.now(timezone.utc)
    if range_key == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if range_key == "7d": return now - timedelta(days=7)
    if range_key == "30d": return now - timedelta(days=30)
    if range_key == "90d": return now - timedelta(days=90)
    return datetime(1970, 1, 1, tzinfo=timezone.utc)


@admin.get("/dashboard")
async def dashboard(range: str = Query("30d", pattern="^(today|7d|30d|90d|all)$"),
                    _admin=Depends(require_admin)):
    db = _db()
    start = _range_start(range).isoformat()
    now_iso = datetime.now(timezone.utc).isoformat()
    today_start = _range_start("today").isoformat()

    (
        total_customers, active_customers, new_customers,
        total_merchants, active_merchants, pending_merchants, new_merchants,
        total_deals, active_deals, pending_deals, expired_deals, new_deals,
    ) = await asyncio.gather(
        db.users.count_documents({"role": "customer"}),
        db.users.count_documents({"role": "customer", "status": {"$ne": "blocked"}}),
        db.users.count_documents({"role": "customer", "created_at": {"$gte": start}}),
        db.merchants.count_documents({}),
        db.merchants.count_documents({"$or": [{"status": "active"}, {"verification_status": "approved"}]}),
        db.merchants.count_documents({"$or": [{"status": "pending"}, {"verification_status": "pending"}]}),
        db.merchants.count_documents({"created_at": {"$gte": start}}),
        db.deals.count_documents({}),
        db.deals.count_documents({"expires_at": {"$gt": now_iso}, "status": {"$ne": "archived"}}),
        db.deals.count_documents({"status": "pending"}),
        db.deals.count_documents({"expires_at": {"$lte": now_iso}}),
        db.deals.count_documents({"created_at": {"$gte": start}}),
    )
    today_new = await asyncio.gather(
        db.users.count_documents({"role": "customer", "created_at": {"$gte": today_start}}),
        db.merchants.count_documents({"created_at": {"$gte": today_start}}),
        db.deals.count_documents({"created_at": {"$gte": today_start}}),
    )

    deals_by_cat = await db.deals.aggregate([
        {"$match": {"created_at": {"$gte": start}}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(20)
    merchants_by_city = await db.merchants.aggregate([
        {"$group": {"_id": {"$ifNull": ["$city", "Unknown"]}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}, {"$limit": 10},
    ]).to_list(20)
    growth = await db.users.aggregate([
        {"$match": {"role": {"$in": ["customer", "merchant"]}, "created_at": {"$gte": start}}},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]},
                    "customers": {"$sum": {"$cond": [{"$eq": ["$role", "customer"]}, 1, 0]}},
                    "merchants": {"$sum": {"$cond": [{"$eq": ["$role", "merchant"]}, 1, 0]}}}},
        {"$sort": {"_id": 1}},
    ]).to_list(200)

    return {
        "range": range,
        "kpis": {
            "total_customers": total_customers, "active_customers": active_customers, "new_customers": new_customers,
            "total_merchants": total_merchants, "active_merchants": active_merchants, "pending_merchants": pending_merchants,
            "new_merchants": new_merchants, "total_deals": total_deals, "active_deals": active_deals,
            "pending_deals": pending_deals, "expired_deals": expired_deals, "new_deals": new_deals,
            "today": {"new_customers": today_new[0], "new_merchants": today_new[1], "new_deals": today_new[2]},
        },
        "charts": {
            "deals_by_category": [{"category": r["_id"], "count": r["count"]} for r in deals_by_cat],
            "merchants_by_city": [{"city": r["_id"], "count": r["count"]} for r in merchants_by_city],
            "growth": [{"date": r["_id"], "customers": r["customers"], "merchants": r["merchants"]} for r in growth],
        },
    }


def _paged(skip: int, limit: int, total: int, items: list) -> dict:
    return {"items": items, "total": total, "skip": skip, "limit": limit,
            "has_more": skip + len(items) < total}


# ---------- MERCHANTS -----------------------------------------------------
@admin.get("/merchants")
async def list_merchants(
    status_: Optional[str] = Query(None, alias="status"),
    category: Optional[str] = None, city: Optional[str] = None,
    q: Optional[str] = None, since: Optional[str] = None,
    sort: str = "-created_at", skip: int = 0, limit: int = 20,
    _admin=Depends(require_admin),
):
    db = _db()
    limit = min(max(1, limit), 50)
    query: Dict[str, Any] = {}
    if status_:
        query["$or"] = [{"status": status_}, {"verification_status": status_}]
    if category: query["category"] = category
    if city: query["city"] = {"$regex": city, "$options": "i"}
    if q:
        or_add = [{"name": {"$regex": q, "$options": "i"}},
                  {"phone": {"$regex": q, "$options": "i"}}]
        query["$or"] = query.get("$or", []) + or_add
    if since: query["created_at"] = {"$gte": since}
    total = await db.merchants.count_documents(query)
    sort_dir = -1 if sort.startswith("-") else 1
    items = await db.merchants.find(query, {"_id": 0}).sort(sort.lstrip("-"), sort_dir).skip(skip).limit(limit).to_list(limit)

    m_ids = [m["id"] for m in items]
    if m_ids:
        now_iso = datetime.now(timezone.utc).isoformat()
        agg = await db.deals.aggregate([
            {"$match": {"merchant_id": {"$in": m_ids}}},
            {"$group": {"_id": "$merchant_id",
                        "active": {"$sum": {"$cond": [{"$gt": ["$expires_at", now_iso]}, 1, 0]}},
                        "total": {"$sum": 1}}},
        ]).to_list(len(m_ids))
        cnt = {r["_id"]: r for r in agg}
        for m in items:
            c = cnt.get(m["id"], {"active": 0, "total": 0})
            m["active_deals"] = c["active"]; m["total_deals"] = c["total"]
    return _paged(skip, limit, total, items)


@admin.get("/merchants/{merchant_id}")
async def merchant_details(merchant_id: str, _admin=Depends(require_admin)):
    db = _db()
    m = await db.merchants.find_one({"id": merchant_id}, {"_id": 0})
    if not m: raise HTTPException(404, "Merchant not found")
    owner = await db.users.find_one({"id": m.get("owner_id")}, {"_id": 0, "password_hash": 0, "otp_code": 0})
    now_iso = datetime.now(timezone.utc).isoformat()
    deals_agg = await db.deals.aggregate([
        {"$match": {"merchant_id": merchant_id}},
        {"$group": {"_id": None, "total": {"$sum": 1},
                    "active": {"$sum": {"$cond": [{"$gt": ["$expires_at", now_iso]}, 1, 0]}},
                    "pending": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}},
                    "expired": {"$sum": {"$cond": [{"$lte": ["$expires_at", now_iso]}, 1, 0]}}}},
    ]).to_list(1)
    return {"merchant": m, "owner": owner,
            "deal_counts": deals_agg[0] if deals_agg else {"total": 0, "active": 0, "pending": 0, "expired": 0}}


class MerchantStatusIn(BaseModel):
    status: str
    reason: Optional[str] = None


@admin.patch("/merchants/{merchant_id}/status")
async def set_merchant_status(merchant_id: str, body: MerchantStatusIn,
                              admin_user=Depends(require_admin)):
    db = _db()
    valid = {"active", "pending", "rejected", "suspended", "inactive", "approved"}
    if body.status not in valid:
        raise HTTPException(400, f"status must be one of {sorted(valid)}")
    verification = "approved" if body.status in ("active", "approved") else body.status
    updates = {"status": body.status, "verification_status": verification,
               "updated_at": datetime.now(timezone.utc).isoformat()}
    if body.reason: updates["status_reason"] = body.reason
    res = await db.merchants.update_one({"id": merchant_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Merchant not found")
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "merchant",
        "entity_id": merchant_id, "action": f"status:{body.status}", "reason": body.reason,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "status": body.status}


# ---------- DEALS ---------------------------------------------------------
@admin.get("/deals")
async def list_deals(
    status_: Optional[str] = Query(None, alias="status"),
    category: Optional[str] = None, merchant_id: Optional[str] = None,
    city: Optional[str] = None, q: Optional[str] = None, since: Optional[str] = None,
    sort: str = "-created_at", skip: int = 0, limit: int = 20,
    _admin=Depends(require_admin),
):
    db = _db()
    limit = min(max(1, limit), 50)
    now_iso = datetime.now(timezone.utc).isoformat()
    query: Dict[str, Any] = {}
    if status_ == "active":
        query = {"expires_at": {"$gt": now_iso}, "status": {"$ne": "archived"}}
    elif status_ == "expired":
        query = {"expires_at": {"$lte": now_iso}}
    elif status_:
        query["status"] = status_
    if category: query["category"] = category
    if merchant_id: query["merchant_id"] = merchant_id
    if city: query["city"] = {"$regex": city, "$options": "i"}
    if q: query["title"] = {"$regex": q, "$options": "i"}
    if since: query.setdefault("created_at", {})["$gte"] = since
    sort_dir = -1 if sort.startswith("-") else 1
    total = await db.deals.count_documents(query)
    items = await db.deals.find(query, {"_id": 0}).sort(sort.lstrip("-"), sort_dir).skip(skip).limit(limit).to_list(limit)
    return _paged(skip, limit, total, items)


@admin.get("/deals/{deal_id}")
async def deal_details(deal_id: str, _admin=Depends(require_admin)):
    db = _db()
    d = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not d: raise HTTPException(404, "Deal not found")
    m = await db.merchants.find_one({"id": d.get("merchant_id")}, {"_id": 0})
    claims_total = await db.claims.count_documents({"deal_id": deal_id})
    redemptions = await db.claims.count_documents({"deal_id": deal_id, "status": "redeemed"})
    return {"deal": d, "merchant": m,
            "engagement": {"claims": claims_total, "redemptions": redemptions}}


class DealStatusIn(BaseModel):
    status: str
    reason: Optional[str] = None


@admin.patch("/deals/{deal_id}/status")
async def set_deal_status(deal_id: str, body: DealStatusIn,
                          admin_user=Depends(require_admin)):
    db = _db()
    action = body.status
    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if action == "approved": updates["status"] = "approved"
    elif action == "rejected": updates["status"] = "rejected"
    elif action == "paused": updates["status"] = "paused"
    elif action == "resumed": updates["status"] = "approved"
    elif action == "archived": updates["status"] = "archived"
    elif action == "featured": updates["featured"] = True
    elif action == "unfeatured": updates["featured"] = False
    else: raise HTTPException(400, "Unsupported status")
    if body.reason: updates["status_reason"] = body.reason
    res = await db.deals.update_one({"id": deal_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Deal not found")
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "deal",
        "entity_id": deal_id, "action": action, "reason": body.reason,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "status": action}


# ---------- CUSTOMERS -----------------------------------------------------
@admin.get("/customers")
async def list_customers(
    status_: Optional[str] = Query(None, alias="status"),
    city: Optional[str] = None, q: Optional[str] = None,
    since: Optional[str] = None, sort: str = "-created_at",
    skip: int = 0, limit: int = 20, _admin=Depends(require_admin),
):
    db = _db()
    limit = min(max(1, limit), 50)
    query: Dict[str, Any] = {"role": "customer"}
    if status_: query["status"] = status_
    if city: query["city"] = {"$regex": city, "$options": "i"}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    if since: query["created_at"] = {"$gte": since}
    total = await db.users.count_documents(query)
    sort_dir = -1 if sort.startswith("-") else 1
    items = await db.users.find(query, {"_id": 0, "password_hash": 0, "otp_code": 0}
                                 ).sort(sort.lstrip("-"), sort_dir).skip(skip).limit(limit).to_list(limit)
    return _paged(skip, limit, total, items)


@admin.get("/customers/{user_id}")
async def customer_details(user_id: str, _admin=Depends(require_admin)):
    db = _db()
    u = await db.users.find_one({"id": user_id, "role": "customer"},
                                 {"_id": 0, "password_hash": 0, "otp_code": 0})
    if not u: raise HTTPException(404, "Customer not found")
    claims = await db.claims.count_documents({"user_id": user_id})
    redeems = await db.claims.count_documents({"user_id": user_id, "status": "redeemed"})
    return {"customer": u, "stats": {"claims": claims, "redemptions": redeems, "points": u.get("points", 0)}}


class CustomerStatusIn(BaseModel):
    status: str
    reason: Optional[str] = None


@admin.patch("/customers/{user_id}/status")
async def set_customer_status(user_id: str, body: CustomerStatusIn,
                              admin_user=Depends(require_admin)):
    db = _db()
    if body.status not in {"active", "blocked", "deactivated"}:
        raise HTTPException(400, "Invalid status")
    res = await db.users.update_one({"id": user_id, "role": "customer"},
                                     {"$set": {"status": body.status,
                                                "updated_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Customer not found")
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "customer",
        "entity_id": user_id, "action": f"status:{body.status}", "reason": body.reason,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "status": body.status}


# -------------------------------------------------------------------------
# CATEGORIES (hierarchical)
# -------------------------------------------------------------------------
DEFAULT_CATEGORIES = [
    {"slug": "food",        "name": "Food",        "icon": "utensils",        "color": "#FF5A36"},
    {"slug": "grocery",     "name": "Grocery",     "icon": "shopping-basket", "color": "#05A660"},
    {"slug": "clothing",    "name": "Clothing",    "icon": "tshirt",          "color": "#2BB8D6"},
    {"slug": "kitchenware", "name": "Kitchenware", "icon": "coffee",          "color": "#E59200"},
    {"slug": "cafe",        "name": "Cafe",        "icon": "coffee",          "color": "#8B4513"},
    {"slug": "bakery",      "name": "Bakery",      "icon": "bread",           "color": "#D2691E"},
]


async def seed_default_categories(db) -> None:
    """One-shot: on first run, materialize the legacy CATEGORIES list."""
    if await db.categories.count_documents({}) > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for i, c in enumerate(DEFAULT_CATEGORIES):
        docs.append({
            "id": str(uuid.uuid4()),
            "slug": c["slug"],
            "name": c["name"],
            "icon": c["icon"],
            "color": c["color"],
            "parent_id": None,
            "order": i,
            "applies_to": "both",   # 'merchants' | 'deals' | 'both'
            "is_active": True,
            "created_at": now, "updated_at": now,
        })
    if docs:
        await db.categories.insert_many(docs)


class CategoryIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    slug: Optional[str] = None
    parent_id: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = 0
    applies_to: Optional[str] = "both"  # 'merchants' | 'deals' | 'both'
    is_active: Optional[bool] = True


class CategoryPatch(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    parent_id: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None
    applies_to: Optional[str] = None
    is_active: Optional[bool] = None


async def _category_counts(db) -> Dict[str, Dict[str, int]]:
    """Efficient one-shot count of merchants/deals per category slug."""
    merchant_agg = await db.merchants.aggregate([
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
    ]).to_list(500)
    deal_agg = await db.deals.aggregate([
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
    ]).to_list(500)
    out: Dict[str, Dict[str, int]] = defaultdict(lambda: {"merchants": 0, "deals": 0})
    for r in merchant_agg:
        if r["_id"]: out[r["_id"]]["merchants"] = r["count"]
    for r in deal_agg:
        if r["_id"]: out[r["_id"]]["deals"] = r["count"]
    return out


def _cat_tree(flat: List[dict]) -> List[dict]:
    """Build parent → children tree, preserving order."""
    by_id: Dict[str, dict] = {c["id"]: {**c, "children": []} for c in flat}
    roots: List[dict] = []
    for c in flat:
        node = by_id[c["id"]]
        pid = c.get("parent_id")
        if pid and pid in by_id:
            by_id[pid]["children"].append(node)
        else:
            roots.append(node)
    return roots


@admin.get("/categories")
async def list_categories(_admin=Depends(require_admin)):
    db = _db()
    items = await db.categories.find({}, {"_id": 0}).sort([("order", 1), ("name", 1)]).to_list(500)
    counts = await _category_counts(db)
    for c in items:
        cnt = counts.get(c["slug"], {"merchants": 0, "deals": 0})
        c["merchant_count"] = cnt["merchants"]
        c["deal_count"] = cnt["deals"]
    return {"items": items, "tree": _cat_tree(items)}


async def _would_create_cycle(db, category_id: str, new_parent_id: Optional[str]) -> bool:
    """Walk up from new_parent_id — if we hit category_id, it's a cycle."""
    if not new_parent_id:
        return False
    if new_parent_id == category_id:
        return True
    cur = new_parent_id
    for _ in range(20):
        parent = await db.categories.find_one({"id": cur}, {"_id": 0, "parent_id": 1})
        if not parent:
            return False
        if parent.get("parent_id") == category_id:
            return True
        cur = parent.get("parent_id")
        if not cur:
            return False
    return False


@admin.post("/categories")
async def create_category(body: CategoryIn, admin_user=Depends(require_admin)):
    db = _db()
    slug = _slugify(body.slug or body.name)
    if await db.categories.find_one({"slug": slug}):
        raise HTTPException(409, "Slug already exists")
    if body.applies_to and body.applies_to not in ("merchants", "deals", "both"):
        raise HTTPException(400, "applies_to must be merchants|deals|both")
    if body.parent_id:
        if not await db.categories.find_one({"id": body.parent_id}):
            raise HTTPException(400, "parent_id not found")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "slug": slug, "name": body.name.strip(),
        "icon": body.icon, "color": body.color, "parent_id": body.parent_id,
        "order": body.order or 0, "applies_to": body.applies_to or "both",
        "is_active": body.is_active if body.is_active is not None else True,
        "created_at": now, "updated_at": now,
    }
    await db.categories.insert_one(doc)
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "category",
        "entity_id": doc["id"], "action": "create", "at": now,
    })
    doc.pop("_id", None)
    return doc


@admin.patch("/categories/{category_id}")
async def update_category(category_id: str, body: CategoryPatch, admin_user=Depends(require_admin)):
    db = _db()
    existing = await db.categories.find_one({"id": category_id})
    if not existing: raise HTTPException(404, "Category not found")
    updates: Dict[str, Any] = {}
    if body.name is not None: updates["name"] = body.name.strip()
    if body.slug is not None:
        new_slug = _slugify(body.slug)
        if new_slug != existing["slug"]:
            if await db.categories.find_one({"slug": new_slug}):
                raise HTTPException(409, "Slug already exists")
            updates["slug"] = new_slug
    if body.icon is not None:  updates["icon"] = body.icon
    if body.color is not None: updates["color"] = body.color
    if body.order is not None: updates["order"] = body.order
    if body.applies_to is not None:
        if body.applies_to not in ("merchants", "deals", "both"):
            raise HTTPException(400, "applies_to must be merchants|deals|both")
        updates["applies_to"] = body.applies_to
    if body.is_active is not None: updates["is_active"] = body.is_active
    if body.parent_id is not None:
        if body.parent_id == "":
            updates["parent_id"] = None
        else:
            if not await db.categories.find_one({"id": body.parent_id}):
                raise HTTPException(400, "parent_id not found")
            if await _would_create_cycle(db, category_id, body.parent_id):
                raise HTTPException(400, "Cannot set parent — would create a cycle")
            updates["parent_id"] = body.parent_id
    if not updates:
        return existing | {"_id": None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.categories.update_one({"id": category_id}, {"$set": updates})
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "category",
        "entity_id": category_id, "action": "update", "at": updates["updated_at"],
    })
    after = await db.categories.find_one({"id": category_id}, {"_id": 0})
    return after


@admin.delete("/categories/{category_id}")
async def delete_category(category_id: str, admin_user=Depends(require_admin)):
    db = _db()
    existing = await db.categories.find_one({"id": category_id})
    if not existing: raise HTTPException(404, "Category not found")
    child_count = await db.categories.count_documents({"parent_id": category_id})
    if child_count > 0:
        raise HTTPException(400, "Category has children — reassign or delete them first")
    slug = existing["slug"]
    m_use = await db.merchants.count_documents({"category": slug})
    d_use = await db.deals.count_documents({"category": slug})
    if m_use + d_use > 0:
        raise HTTPException(400, f"Category is in use by {m_use} merchants and {d_use} deals")
    await db.categories.delete_one({"id": category_id})
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "category",
        "entity_id": category_id, "action": "delete",
        "at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


# -------------------------------------------------------------------------
# CITIES / LOCATIONS
# -------------------------------------------------------------------------
class CityIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    slug: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    lat: float
    lng: float
    radius_km: float = Field(default=25, gt=0, le=500)
    is_active: Optional[bool] = True
    order: Optional[int] = 0


class CityPatch(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_km: Optional[float] = Field(default=None, gt=0, le=500)
    is_active: Optional[bool] = None
    order: Optional[int] = None


async def _city_stats(db, cities: List[dict]) -> None:
    """Attach merchant + deal counts (within city radius) to each city, in-place."""
    if not cities: return
    merchants = await db.merchants.find({}, {"_id": 0, "lat": 1, "lng": 1}).to_list(5000)
    now_iso = datetime.now(timezone.utc).isoformat()
    deals = await db.deals.find(
        {"expires_at": {"$gt": now_iso}, "is_draft": {"$ne": True}, "deleted": {"$ne": True}},
        {"_id": 0, "lat": 1, "lng": 1},
    ).to_list(10000)
    for c in cities:
        r = c.get("radius_km", 25)
        m_cnt = sum(1 for m in merchants
                    if isinstance(m.get("lat"), (int, float)) and isinstance(m.get("lng"), (int, float))
                    and _haversine_km(c["lat"], c["lng"], m["lat"], m["lng"]) <= r)
        d_cnt = sum(1 for d in deals
                    if isinstance(d.get("lat"), (int, float)) and isinstance(d.get("lng"), (int, float))
                    and _haversine_km(c["lat"], c["lng"], d["lat"], d["lng"]) <= r)
        c["merchant_count"] = m_cnt
        c["active_deal_count"] = d_cnt


@admin.get("/cities")
async def list_cities(_admin=Depends(require_admin)):
    db = _db()
    items = await db.cities.find({}, {"_id": 0}).sort([("order", 1), ("name", 1)]).to_list(500)
    await _city_stats(db, items)
    return {"items": items}


@admin.post("/cities")
async def create_city(body: CityIn, admin_user=Depends(require_admin)):
    db = _db()
    slug = _slugify(body.slug or body.name)
    if await db.cities.find_one({"slug": slug}):
        raise HTTPException(409, "Slug already exists")
    if not (-90 <= body.lat <= 90 and -180 <= body.lng <= 180):
        raise HTTPException(400, "Invalid lat/lng")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "name": body.name.strip(), "slug": slug,
        "country": (body.country or "").strip() or None,
        "state": (body.state or "").strip() or None,
        "lat": body.lat, "lng": body.lng, "radius_km": body.radius_km,
        "is_active": body.is_active if body.is_active is not None else True,
        "order": body.order or 0, "created_at": now, "updated_at": now,
    }
    await db.cities.insert_one(doc)
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "city",
        "entity_id": doc["id"], "action": "create", "at": now,
    })
    doc.pop("_id", None); return doc


@admin.patch("/cities/{city_id}")
async def update_city(city_id: str, body: CityPatch, admin_user=Depends(require_admin)):
    db = _db()
    existing = await db.cities.find_one({"id": city_id})
    if not existing: raise HTTPException(404, "City not found")
    updates: Dict[str, Any] = {}
    if body.name is not None: updates["name"] = body.name.strip()
    if body.slug is not None:
        new_slug = _slugify(body.slug)
        if new_slug != existing["slug"]:
            if await db.cities.find_one({"slug": new_slug}):
                raise HTTPException(409, "Slug already exists")
            updates["slug"] = new_slug
    if body.country is not None: updates["country"] = body.country.strip() or None
    if body.state is not None:   updates["state"]   = body.state.strip() or None
    if body.lat is not None:
        if not (-90 <= body.lat <= 90): raise HTTPException(400, "Invalid lat")
        updates["lat"] = body.lat
    if body.lng is not None:
        if not (-180 <= body.lng <= 180): raise HTTPException(400, "Invalid lng")
        updates["lng"] = body.lng
    if body.radius_km is not None: updates["radius_km"] = body.radius_km
    if body.is_active is not None: updates["is_active"] = body.is_active
    if body.order is not None:     updates["order"] = body.order
    if not updates:
        existing.pop("_id", None); return existing
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.cities.update_one({"id": city_id}, {"$set": updates})
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "city",
        "entity_id": city_id, "action": "update", "at": updates["updated_at"],
    })
    after = await db.cities.find_one({"id": city_id}, {"_id": 0})
    return after


@admin.delete("/cities/{city_id}")
async def delete_city(city_id: str, admin_user=Depends(require_admin)):
    db = _db()
    existing = await db.cities.find_one({"id": city_id})
    if not existing: raise HTTPException(404, "City not found")
    await db.cities.delete_one({"id": city_id})
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "city",
        "entity_id": city_id, "action": "delete",
        "at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


# -------------------------------------------------------------------------
# SETTINGS (system-wide, single-doc)
# -------------------------------------------------------------------------
SETTINGS_ID = "global"

DEFAULT_SETTINGS = {
    # Branding
    "brand_name": "Happy Hour",
    "brand_logo_url": None,
    "support_email": "support@happyhour.io",
    # Defaults
    "default_deal_radius_km": 5,
    "loyalty_points_per_redemption": 25,
    "referral_referrer_reward": 200,
    "referral_referee_reward": 100,
    # Feature flags
    "guest_browsing_enabled": True,
    "reels_tab_enabled": True,
}

# Public-facing subset (what customers/merchants can read via /api/settings).
PUBLIC_SETTING_KEYS = {
    "brand_name", "brand_logo_url", "support_email",
    "default_deal_radius_km",
    "loyalty_points_per_redemption",
    "referral_referrer_reward", "referral_referee_reward",
    "guest_browsing_enabled", "reels_tab_enabled",
}


async def seed_default_settings(db) -> None:
    """Idempotent: seed the single settings doc, adding any keys that
    were introduced after initial deploy."""
    doc = await db.settings.find_one({"id": SETTINGS_ID})
    if not doc:
        now = datetime.now(timezone.utc).isoformat()
        await db.settings.insert_one({
            "id": SETTINGS_ID, **DEFAULT_SETTINGS,
            "created_at": now, "updated_at": now,
        })
        return
    missing = {k: v for k, v in DEFAULT_SETTINGS.items() if k not in doc}
    if missing:
        await db.settings.update_one(
            {"id": SETTINGS_ID},
            {"$set": {**missing, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )


async def load_settings(db) -> Dict[str, Any]:
    doc = await db.settings.find_one({"id": SETTINGS_ID}, {"_id": 0})
    if not doc:
        return dict(DEFAULT_SETTINGS)
    # Ensure every default key exists (in case seed hasn't run yet).
    return {**DEFAULT_SETTINGS, **{k: v for k, v in doc.items() if k in DEFAULT_SETTINGS}}


async def get_setting(db, key: str, fallback: Any = None) -> Any:
    """Read a single setting; used by other modules (loyalty, referrals)."""
    doc = await db.settings.find_one({"id": SETTINGS_ID}, {"_id": 0, key: 1})
    if doc and key in doc and doc[key] is not None:
        return doc[key]
    return DEFAULT_SETTINGS.get(key, fallback)


class SettingsPatch(BaseModel):
    brand_name: Optional[str] = None
    brand_logo_url: Optional[str] = None
    support_email: Optional[str] = None
    default_deal_radius_km: Optional[float] = Field(default=None, gt=0, le=500)
    loyalty_points_per_redemption: Optional[int] = Field(default=None, ge=0, le=100000)
    referral_referrer_reward: Optional[int] = Field(default=None, ge=0, le=100000)
    referral_referee_reward: Optional[int] = Field(default=None, ge=0, le=100000)
    guest_browsing_enabled: Optional[bool] = None
    reels_tab_enabled: Optional[bool] = None


@admin.get("/settings")
async def read_settings(_admin=Depends(require_admin)):
    return await load_settings(_db())


@admin.patch("/settings")
async def update_settings(body: SettingsPatch, admin_user=Depends(require_admin)):
    db = _db()
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None or k in {"brand_logo_url"}}
    if not patch:
        return await load_settings(db)
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one({"id": SETTINGS_ID}, {"$set": patch}, upsert=True)
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin_user["id"], "entity_type": "settings",
        "entity_id": SETTINGS_ID, "action": "update", "at": patch["updated_at"],
        "changes": list(patch.keys()),
    })
    return await load_settings(db)


# -------------------------------------------------------------------------
# GLOBAL SEARCH (cross-entity)
# -------------------------------------------------------------------------
@admin.get("/search")
async def global_search(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(5, ge=1, le=20),
    _admin=Depends(require_admin),
):
    """Case-insensitive search across merchants, deals, and customers.
    Returns up to `limit` results per entity type."""
    db = _db()
    # Regex-escape to prevent malformed patterns from user input.
    pattern = {"$regex": re.escape(q), "$options": "i"}

    merchants_task = db.merchants.find(
        {"$or": [{"name": pattern}, {"phone": pattern}, {"category": pattern}]},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "category": 1, "city": 1,
         "logo": 1, "status": 1, "verification_status": 1},
    ).limit(limit).to_list(limit)

    deals_task = db.deals.find(
        {"$or": [{"title": pattern}, {"description": pattern}, {"merchant_name": pattern}]},
        {"_id": 0, "id": 1, "title": 1, "merchant_name": 1, "merchant_id": 1,
         "category": 1, "image_url": 1, "status": 1, "expires_at": 1,
         "discounted_price": 1, "after_price": 1},
    ).limit(limit).to_list(limit)

    customers_task = db.users.find(
        {"role": "customer", "$or": [{"name": pattern}, {"email": pattern}, {"phone": pattern}]},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1,
         "status": 1, "points": 1, "created_at": 1},
    ).limit(limit).to_list(limit)

    merchants, deals, customers = await asyncio.gather(merchants_task, deals_task, customers_task)
    return {
        "q": q,
        "merchants": merchants,
        "deals": deals,
        "customers": customers,
        "total": len(merchants) + len(deals) + len(customers),
    }


# -------------------------------------------------------------------------
# Wiring
# -------------------------------------------------------------------------
def wire_admin_router(app, db, verify_password, create_token, hash_password, get_current_user):
    async def _impl(user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(status_code=403, detail="Admin access required")
        return user
    # Because `require_admin` was declared at module-import time with no dep,
    # we replace it in the FastAPI dependency wiring: every route's dep on
    # `require_admin` picks up the resolved implementation via `app.dependency_overrides`.
    app.dependency_overrides[require_admin] = _impl
    _D.update({"db": db, "verify_password": verify_password, "create_token": create_token,
               "hash_password": hash_password, "get_current_user": get_current_user})
    app.include_router(admin)


async def seed_super_admin(db, hash_password) -> None:
    email = (os.environ.get("ADMIN_SEED_EMAIL") or "").strip().casefold()
    password = os.environ.get("ADMIN_SEED_PASSWORD")
    if not email or not password:
        return
    existing = await db.users.find_one({"email": email, "role": {"$in": ["admin", "super_admin"]}})
    if existing:
        return
    doc = {
        "id": str(uuid.uuid4()), "email": email, "name": "Administrator",
        "role": "super_admin", "password_hash": hash_password(password),
        "created_at": datetime.now(timezone.utc).isoformat(), "status": "active",
    }
    await db.users.insert_one(doc)
