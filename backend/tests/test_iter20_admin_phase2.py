"""Iteration 20 — Admin Panel Phase 2 (Categories + Cities).

Tests the newly added hierarchical Categories module and Cities module,
plus regression on Phase 1 admin endpoints.

Cleans up any TEST_ prefixed data at the end.
"""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL")
            or "https://local-deals-now.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "admin@happyhour.local"
ADMIN_PASSWORD = "HappyAdmin@2026"


# ---------- shared session fixture ---------------------------------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and data["access_token"]
    assert data["admin"]["role"] in ("admin", "super_admin")
    return data["access_token"]


@pytest.fixture(scope="session")
def s(admin_token):
    sess = requests.Session()
    sess.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}",
    })
    return sess


# ---------- module-scoped tracking for cleanup ---------------------------
_created_category_ids: list[str] = []
_created_city_ids: list[str] = []


# =========================================================================
# AUTH
# =========================================================================
class TestAdminAuth:
    def test_login_returns_jwt(self):
        r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        # JWT is 3 base64 segments
        assert j["access_token"].count(".") == 2
        assert j["admin"]["email"] == ADMIN_EMAIL

    def test_login_bad_password(self):
        r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_categories_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/categories", timeout=15)
        assert r.status_code in (401, 403)


# =========================================================================
# CATEGORIES
# =========================================================================
class TestAdminCategories:
    def test_list_shape(self, s):
        r = s.get(f"{BASE_URL}/api/admin/categories", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and "tree" in j
        assert isinstance(j["items"], list) and isinstance(j["tree"], list)
        if j["items"]:
            c = j["items"][0]
            assert "merchant_count" in c and "deal_count" in c
            assert "slug" in c and "id" in c

    def test_create_auto_slug_and_persist(self, s):
        name = f"TEST_Cat_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{BASE_URL}/api/admin/categories",
                   json={"name": name, "applies_to": "both"}, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["name"] == name
        # slug should be a lowercased slug of name
        assert doc["slug"].startswith("test-cat-")
        assert doc["applies_to"] == "both"
        _created_category_ids.append(doc["id"])

        # verify persisted via GET
        r2 = s.get(f"{BASE_URL}/api/admin/categories", timeout=15)
        ids = [c["id"] for c in r2.json()["items"]]
        assert doc["id"] in ids

    def test_slug_uniqueness(self, s):
        name = f"TEST_Dup_{uuid.uuid4().hex[:6]}"
        r1 = s.post(f"{BASE_URL}/api/admin/categories", json={"name": name}, timeout=15)
        assert r1.status_code == 200
        _created_category_ids.append(r1.json()["id"])
        # Same slug should conflict
        r2 = s.post(f"{BASE_URL}/api/admin/categories",
                    json={"name": "different", "slug": r1.json()["slug"]}, timeout=15)
        assert r2.status_code == 409

    def test_applies_to_validation(self, s):
        r = s.post(f"{BASE_URL}/api/admin/categories",
                   json={"name": f"TEST_Bad_{uuid.uuid4().hex[:6]}", "applies_to": "bogus"}, timeout=15)
        assert r.status_code == 400

    def test_cycle_detection_on_patch(self, s):
        # Create parent
        p = s.post(f"{BASE_URL}/api/admin/categories",
                   json={"name": f"TEST_Parent_{uuid.uuid4().hex[:6]}"}, timeout=15).json()
        _created_category_ids.append(p["id"])
        # Create child under parent
        c = s.post(f"{BASE_URL}/api/admin/categories",
                   json={"name": f"TEST_Child_{uuid.uuid4().hex[:6]}", "parent_id": p["id"]}, timeout=15).json()
        _created_category_ids.append(c["id"])
        # Now try to make parent's parent = child (would create a cycle)
        r = s.patch(f"{BASE_URL}/api/admin/categories/{p['id']}",
                    json={"parent_id": c["id"]}, timeout=15)
        assert r.status_code == 400, f"expected cycle rejection, got {r.status_code} {r.text}"
        # Also self-parent
        r2 = s.patch(f"{BASE_URL}/api/admin/categories/{p['id']}",
                     json={"parent_id": p["id"]}, timeout=15)
        assert r2.status_code == 400

    def test_delete_refuses_with_children(self, s):
        p = s.post(f"{BASE_URL}/api/admin/categories",
                   json={"name": f"TEST_DelParent_{uuid.uuid4().hex[:6]}"}, timeout=15).json()
        _created_category_ids.append(p["id"])
        c = s.post(f"{BASE_URL}/api/admin/categories",
                   json={"name": f"TEST_DelChild_{uuid.uuid4().hex[:6]}", "parent_id": p["id"]}, timeout=15).json()
        _created_category_ids.append(c["id"])
        r = s.delete(f"{BASE_URL}/api/admin/categories/{p['id']}", timeout=15)
        assert r.status_code == 400
        # Delete child first, then parent should succeed
        r2 = s.delete(f"{BASE_URL}/api/admin/categories/{c['id']}", timeout=15)
        assert r2.status_code == 200
        _created_category_ids.remove(c["id"])
        r3 = s.delete(f"{BASE_URL}/api/admin/categories/{p['id']}", timeout=15)
        assert r3.status_code == 200
        _created_category_ids.remove(p["id"])

    def test_delete_refuses_when_used_by_merchant(self, s):
        # Existing seeded merchants use slug "food" — deleting should be refused.
        r_list = s.get(f"{BASE_URL}/api/admin/categories", timeout=15).json()
        food = next((c for c in r_list["items"] if c["slug"] == "food"), None)
        if not food:
            pytest.skip("no seeded 'food' category")
        # Only try delete if it has children==0 AND merchant_count>0
        if food["merchant_count"] + food["deal_count"] == 0:
            pytest.skip("food category has no usage — cannot exercise 'in use' branch")
        r = s.delete(f"{BASE_URL}/api/admin/categories/{food['id']}", timeout=15)
        assert r.status_code == 400
        assert "in use" in r.text.lower() or "reassign" in r.text.lower() or "children" in r.text.lower()

    def test_public_categories_from_db(self):
        r = requests.get(f"{BASE_URL}/api/categories", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) > 0
        first = arr[0]
        # DB-backed shape includes these keys
        for key in ("id", "name", "icon", "color", "applies_to"):
            assert key in first, f"missing {key} in public category: {first}"
        # parent_id present (may be None)
        assert "parent_id" in first


# =========================================================================
# CITIES
# =========================================================================
class TestAdminCities:
    def test_list_shape(self, s):
        r = s.get(f"{BASE_URL}/api/admin/cities", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j
        assert isinstance(j["items"], list)
        for c in j["items"]:
            assert "merchant_count" in c and "active_deal_count" in c

    def test_create_and_get(self, s):
        name = f"TEST_City_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{BASE_URL}/api/admin/cities", json={
            "name": name, "lat": 37.7749, "lng": -122.4194, "radius_km": 25,
        }, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["name"] == name and doc["slug"].startswith("test-city-")
        _created_city_ids.append(doc["id"])

        # Verify via GET
        listing = s.get(f"{BASE_URL}/api/admin/cities", timeout=15).json()["items"]
        assert doc["id"] in [c["id"] for c in listing]

    def test_lat_lng_radius_validation(self, s):
        # Bad lat
        r1 = s.post(f"{BASE_URL}/api/admin/cities",
                    json={"name": f"TEST_BL_{uuid.uuid4().hex[:4]}",
                          "lat": 95.0, "lng": 0, "radius_km": 10}, timeout=15)
        assert r1.status_code in (400, 422)
        # Bad lng
        r2 = s.post(f"{BASE_URL}/api/admin/cities",
                    json={"name": f"TEST_BL_{uuid.uuid4().hex[:4]}",
                          "lat": 0, "lng": 200.0, "radius_km": 10}, timeout=15)
        assert r2.status_code in (400, 422)
        # Bad radius (0)
        r3 = s.post(f"{BASE_URL}/api/admin/cities",
                    json={"name": f"TEST_BR_{uuid.uuid4().hex[:4]}",
                          "lat": 0, "lng": 0, "radius_km": 0}, timeout=15)
        assert r3.status_code in (400, 422)
        # Bad radius (>500)
        r4 = s.post(f"{BASE_URL}/api/admin/cities",
                    json={"name": f"TEST_BR_{uuid.uuid4().hex[:4]}",
                          "lat": 0, "lng": 0, "radius_km": 501}, timeout=15)
        assert r4.status_code in (400, 422)

    def test_slug_uniqueness(self, s):
        name = f"TEST_CityDup_{uuid.uuid4().hex[:6]}"
        r1 = s.post(f"{BASE_URL}/api/admin/cities",
                    json={"name": name, "lat": 40, "lng": -70, "radius_km": 25}, timeout=15)
        assert r1.status_code == 200
        _created_city_ids.append(r1.json()["id"])
        r2 = s.post(f"{BASE_URL}/api/admin/cities",
                    json={"name": "other", "slug": r1.json()["slug"],
                          "lat": 40, "lng": -70, "radius_km": 25}, timeout=15)
        assert r2.status_code == 409

    def test_patch_and_delete(self, s):
        r = s.post(f"{BASE_URL}/api/admin/cities", json={
            "name": f"TEST_Patch_{uuid.uuid4().hex[:6]}",
            "lat": 34.05, "lng": -118.24, "radius_km": 10,
        }, timeout=15)
        cid = r.json()["id"]
        _created_city_ids.append(cid)
        # PATCH
        p = s.patch(f"{BASE_URL}/api/admin/cities/{cid}",
                    json={"radius_km": 20, "state": "CA"}, timeout=15)
        assert p.status_code == 200
        assert p.json()["radius_km"] == 20 and p.json()["state"] == "CA"
        # PATCH bad lat rejected
        pb = s.patch(f"{BASE_URL}/api/admin/cities/{cid}", json={"lat": 999}, timeout=15)
        assert pb.status_code in (400, 422)
        # DELETE and verify 404 on subsequent PATCH
        d = s.delete(f"{BASE_URL}/api/admin/cities/{cid}", timeout=15)
        assert d.status_code == 200
        _created_city_ids.remove(cid)
        p404 = s.patch(f"{BASE_URL}/api/admin/cities/{cid}", json={"radius_km": 30}, timeout=15)
        assert p404.status_code == 404

    def test_public_cities_active_and_distance_sort(self, s):
        # Create an inactive city — shouldn't appear in public listing
        r = s.post(f"{BASE_URL}/api/admin/cities", json={
            "name": f"TEST_Inactive_{uuid.uuid4().hex[:6]}",
            "lat": 51.5, "lng": -0.12, "radius_km": 30, "is_active": False,
        }, timeout=15)
        assert r.status_code == 200
        inactive_id = r.json()["id"]
        _created_city_ids.append(inactive_id)
        inactive_slug = r.json()["slug"]

        pub = requests.get(f"{BASE_URL}/api/cities", timeout=15).json()
        slugs = [c["slug"] for c in pub]
        assert inactive_slug not in slugs

        # Distance sort
        pub2 = requests.get(f"{BASE_URL}/api/cities",
                            params={"lat": 37.7749, "lng": -122.4194}, timeout=15).json()
        if pub2:
            assert "distance_km" in pub2[0]
            distances = [c.get("distance_km", 0) for c in pub2]
            assert distances == sorted(distances)


# =========================================================================
# PUBLIC FEED CITY FILTERING
# =========================================================================
class TestPublicCityFilter:
    @pytest.fixture(scope="class")
    def sf_slug(self, s):
        # Ensure a San Francisco city exists (created for filtering); use slug 'san-francisco'
        pub = requests.get(f"{BASE_URL}/api/cities", timeout=15).json()
        for c in pub:
            if c["slug"] == "san-francisco":
                return "san-francisco"
        # Create it (seeded merchants are around 37.7749,-122.4194)
        r = s.post(f"{BASE_URL}/api/admin/cities", json={
            "name": "San Francisco", "slug": "san-francisco",
            "lat": 37.7749, "lng": -122.4194, "radius_km": 25,
        }, timeout=15)
        assert r.status_code in (200, 409), r.text
        if r.status_code == 200:
            _created_city_ids.append(r.json()["id"])
        return "san-francisco"

    def test_deals_filter_by_city(self, sf_slug):
        base = requests.get(f"{BASE_URL}/api/deals", timeout=15).json()
        filtered = requests.get(f"{BASE_URL}/api/deals",
                                params={"city": sf_slug}, timeout=15).json()
        assert isinstance(filtered, list)
        # All filtered items should be within radius of SF (25km) — sanity: at least
        # returns a list, and typically <= base size
        assert len(filtered) <= len(base)

    def test_merchants_filter_by_city(self, sf_slug):
        filtered = requests.get(f"{BASE_URL}/api/merchants",
                                params={"city": sf_slug}, timeout=15).json()
        assert isinstance(filtered, list)
        # Seeded merchants are near SF anchor, expect at least 1 within 25km
        assert len(filtered) >= 1

    def test_unknown_city_silently_ignored_on_deals(self):
        unfiltered = requests.get(f"{BASE_URL}/api/deals", timeout=15).json()
        r = requests.get(f"{BASE_URL}/api/deals",
                         params={"city": "not-a-real-city-xyz"}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        # Should equal (or roughly equal) the unfiltered list
        assert len(j) == len(unfiltered)


# =========================================================================
# REGRESSION — Phase 1 admin endpoints
# =========================================================================
class TestPhase1Regression:
    def test_dashboard(self, s):
        r = s.get(f"{BASE_URL}/api/admin/dashboard", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "kpis" in j and "charts" in j
        for k in ("total_customers", "total_merchants", "total_deals"):
            assert k in j["kpis"]

    def test_merchants(self, s):
        r = s.get(f"{BASE_URL}/api/admin/merchants", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and "total" in j

    def test_deals(self, s):
        r = s.get(f"{BASE_URL}/api/admin/deals", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and "total" in j

    def test_customers(self, s):
        r = s.get(f"{BASE_URL}/api/admin/customers", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and "total" in j


# =========================================================================
# Cleanup — delete any leftover TEST_ resources
# =========================================================================
def test_zzz_cleanup(s):
    # Try to remove all created TEST_ cities and categories, ignoring failures
    for cid in list(_created_city_ids):
        try:
            s.delete(f"{BASE_URL}/api/admin/cities/{cid}", timeout=10)
        except Exception:
            pass
    for cat_id in list(_created_category_ids):
        try:
            s.delete(f"{BASE_URL}/api/admin/categories/{cat_id}", timeout=10)
        except Exception:
            pass
    # Sweep by name-prefix in case tests missed any
    cats = s.get(f"{BASE_URL}/api/admin/categories", timeout=15).json().get("items", [])
    for c in cats:
        if c.get("name", "").startswith("TEST_"):
            s.delete(f"{BASE_URL}/api/admin/categories/{c['id']}", timeout=10)
    cities = s.get(f"{BASE_URL}/api/admin/cities", timeout=15).json().get("items", [])
    for c in cities:
        # Preserve san-francisco even if we created it (used by feed filtering)
        if c.get("name", "").startswith("TEST_") and c.get("slug") != "san-francisco":
            s.delete(f"{BASE_URL}/api/admin/cities/{c['id']}", timeout=10)
