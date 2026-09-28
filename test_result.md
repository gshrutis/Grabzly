#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build "Happy Hour", a hyper-local marketplace app connecting nearby merchants with customers
  seeking real-time, location-relevant deals. Latest iteration adds:
  1) Sign-up screens (customer + merchant) with Mobile/Email tabs
  2) Customer feed radius/proximity selector (0.5/1/3/5/10km+)
  3) Merchant onboarding map picker with "Use my GPS" button
  4) Backend /api/deals radius filtering via max_km

backend:
  - task: "Radius filtering on GET /api/deals (max_km param)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Verified server.py already filters deals by max_km when lat/lng provided (line 727-731). Need testing agent to confirm behaviour with lat/lng/max_km combos."
  - task: "Mock OTP auth flow (request+verify)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Existing endpoint POST /api/auth/otp/request returns {sent:true, demo_code:'123456'}. POST /api/auth/otp/verify with 123456 must return JWT. Re-test to ensure no regressions after frontend changes."

frontend:
  - task: "Customer sign-up Phone/Email tab switch"
    implemented: true
    working: true
    file: "frontend/app/sign-up.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Screenshot verified tabs render correctly with default 'Phone' selected; email tab reveals email/password fields."
  - task: "Merchant sign-up Phone/Email tab switch"
    implemented: true
    working: true
    file: "frontend/app/merchant/sign-up.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Screenshot verified merchant sign-up renders Phone/Email tabs with role='merchant' passed to PhoneAuthTab."
  - task: "Customer feed radius/proximity selector"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Screenshot verified filter panel shows 0.5km/1km/3km/5km/10km+ options and passes max_km to /api/deals. Needs UI test to confirm deals count changes when selecting smaller radius."
  - task: "Merchant onboarding map picker 'Use my GPS' button"
    implemented: true
    working: "NA"
    file: "frontend/app/merchant/onboarding.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added GPS button inside map picker modal. Uses expo-location on native and navigator.geolocation on web. Needs UI verification after sign-in as merchant."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 8
  run_ui: true

test_plan:
  current_focus:
    - "Radius filtering on GET /api/deals (max_km param)"
    - "Customer feed radius/proximity selector"
    - "Merchant onboarding map picker 'Use my GPS' button"
    - "Mock OTP auth flow (request+verify)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Verified UI for sign-up tabs + radius selector via screenshot. Added GPS button to merchant map picker.
      Please test:
      1) Backend: GET /api/deals?lat=37.7749&lng=-122.4194&max_km=1 returns fewer/no deals vs max_km=999.
      2) Backend: OTP flow request+verify still returns valid JWT (regression check).
      3) Frontend: Customer feed radius filter reduces visible deals when set to 0.5km, expands with 10km+.
      4) Frontend: Sign-up tabs (both customer and merchant) can switch between Phone and Email and OTP=123456 successfully authenticates a phone-only user.
  - agent: "testing"
    message: |
      Iteration 8: Backend 9/9 pass. Frontend HIGH bug: PhoneAuthTab wrote JWT to storage without updating AuthContext, so /merchant/onboarding kicked user to /sign-in. Fix required.
  - agent: "main"
    message: |
      Fixed: added AuthContext.setSession(token, user) and made refresh() fall back to reading token from secure storage. PhoneAuthTab now calls setSession before onSuccess.
  - agent: "testing"
    message: |
      Iteration 9: 4/4 frontend pass. Merchant OTP → /merchant/onboarding, customer OTP populates user, email flows still working. No new issues.
  - agent: "main"
    message: |
      NEW BATCH (iter 10) — 4 features added:
      1) Backend: In-app notifications collection + endpoints
         - `GET /api/notifications` (auth) — list latest 50
         - `GET /api/notifications/unread-count` (auth)
         - `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`
         - `DELETE /api/notifications/{id}`
         - Auto-emits on `POST /api/deals/{id}/claim` → notifies customer + merchant owner
         - Auto-emits on `POST /api/merchant/redeem` → notifies customer + merchant owner
      2) Frontend: Notification bell (with unread badge) added to customer feed header + merchant deals header; new `/notifications` screen with pull-to-refresh + mark-all-read
      3) Frontend: New reusable `LocationPickerModal` — OSM Nominatim search, GPS, tap-to-pin, live pin preview. Used in:
         - Merchant onboarding (replaces old map picker modal)
         - Customer profile → "Pick precise location"
      4) Frontend: Customer map now uses category-colored pins via updated CATEGORY_META (food=red, cafe=orange, bakery=yellow, grocery=green, clothing=blue, kitchenware=purple). LeafletMap fixed to render <iframe> on web (react-native-webview unsupported on web) so pins actually appear.
      5) Frontend: Profile Notifications section is fully disabled for guests with a "Sign in to enable" tooltip; Switches read-only, opacity dimmed.

      Please test the new endpoints + flows. Do not re-test iter-9 items (already green).

backend_new:
  - task: "In-app notifications CRUD"
    file: "backend/server.py"
    status: "NA"
    needs_retesting: true
  - task: "Claim/Redeem emit notifications to both parties"
    file: "backend/server.py"
    status: "NA"
    needs_retesting: true

frontend_new:
  - task: "NotificationBell on customer feed + merchant deals header"
    file: "frontend/src/components/NotificationBell.tsx"
    status: "NA"
    needs_retesting: true
  - task: "/notifications screen (list, mark-all, mark-read tap, deep link)"
    file: "frontend/app/notifications.tsx"
    status: "NA"
    needs_retesting: true
  - task: "LocationPickerModal (search+GPS+tap) in merchant onboarding + profile"
    file: "frontend/src/components/LocationPickerModal.tsx"
    status: "NA"
    needs_retesting: true
  - task: "Category-colored map pins in customer map view"
    file: "frontend/src/components/LeafletMap.tsx + frontend/app/(tabs)/map.tsx + frontend/src/theme.ts"
    status: "NA"
    needs_retesting: true
  - task: "Guest user Notifications section disabled with tooltip"
    file: "frontend/app/(tabs)/profile.tsx"
    status: "NA"
    needs_retesting: true

  - agent: "testing"
    message: |
      Iteration 10 — 23/23 pass (18 backend + 5 frontend). Notifications end-to-end verified for both claim and redeem, bell renders on feed + merchant deals, guest UX correct, category-colored map pins confirmed (7 unique colors). Only lingering issue: pre-existing shadow*/pointerEvents deprecation warnings from RN-Web, not blocking.
  - agent: "main"
    message: |
      Iteration 11: Upgraded Expo SDK 54.0.36 → 57.0.22 (RN 0.86.3, React 19.2.3). Migrated all `@expo/vector-icons` (Ionicons) → `@react-native-vector-icons/ionicons`. Removed deprecated `newArchEnabled` + `edgeToEdgeEnabled` from app.json. expo-doctor 20/20 pass.
  - agent: "testing"
    message: |
      Iteration 11 — 9/9 smoke pass (4 backend + 5 frontend). App boots on SDK 57, all icons render via new CDN loader, map iframe fallback works, no fatal errors. Only pre-existing shadow*/pointerEvents warnings remain.
  - agent: "main"
    message: |
      Iteration 12: Fixed "images/videos not showing" issue.
      - Backend: added `POST /api/upload` (multipart, 25 MB cap, image/* + video/* only) and mounted `/api/media` as StaticFiles.
      - Replaced dead `commondatastorage.googleapis.com/gtv-videos-bucket/*` sample videos with working Pexels + Google Exoplayer + samplelib URLs.
      - Replaced 2 dead Unsplash photo IDs with Pexels equivalents.
      - Migration script `backend/migrations/clean_media.py` deleted TEST/Iter dev deals, cleared file:// video/image URIs, swapped commondatastorage.
      - Frontend merchant `deal-form.tsx` now uploads picked images/videos via `api.uploadMedia()` and stores the hosted URL instead of `file://`.
      - `api.uploadMedia()` prefixes `EXPO_PUBLIC_BACKEND_URL` on the returned URL so any client can consume the media.
      - Reels player now shows the deal image as poster fallback behind the video.
  - agent: "testing"
    message: |
      Iteration 12 — 7/7 backend pass. Upload works (auth-gated, MIME-validated, byte-exact GET); DB has zero `commondatastorage`/`file://` URLs after migration; sample-videos returns 9 hosted URLs; claim+redeem regression still emits all 4 notifications.
  - agent: "main"
    message: |
      Iteration 20: Admin Panel Phase 2 — Categories + Cities modules.

      Backend (admin_panel.py):
      - CATEGORIES: hierarchical (parent_id), CRUD at `/api/admin/categories`.
        - `GET /api/admin/categories` returns `{items, tree}` with per-slug merchant_count + deal_count.
        - `POST /api/admin/categories` — auto slug from name, validates uniqueness, parent existence, applies_to ∈ {merchants,deals,both}.
        - `PATCH /api/admin/categories/{id}` — cycle detection when changing parent_id, slug rename allowed if unused.
        - `DELETE /api/admin/categories/{id}` — refuses if it has children or is in use by merchants/deals (409-style safety).
        - `seed_default_categories(db)` — one-shot migrates the legacy CATEGORIES constant into MongoDB on first boot.
      - CITIES: geo-anchored regions with a radius.
        - `GET /api/admin/cities` — returns items with merchant_count + active_deal_count (haversine, in-memory, radius-based).
        - `POST /api/admin/cities` — validates lat/lng ranges, radius (0–500 km), slug uniqueness.
        - `PATCH/DELETE /api/admin/cities/{id}`.
        - Startup seed: San Francisco (37.7749,-122.4194, 25 km).

      Public endpoints:
      - `GET /api/categories` — now reads from DB (falls back to legacy constant if empty).
      - `GET /api/cities` (new) — active cities, optional `?lat=&lng=` for distance sort.
      - `GET /api/deals?city=<slug>` (new) — filters deals within the city's radius (haversine on deal lat/lng).
      - `GET /api/merchants?city=<slug>` (new) — same filter for merchants.

      Frontend:
      - Admin sidebar now has "Categories" and "Cities" nav items.
      - `/app/frontend/app/admin/(panel)/categories/index.tsx` — tree view with inline create/edit/delete + Add-child affordance per node. Modal editor supports name/slug/parent/icon/color/order/applies_to/is_active.
      - `/app/frontend/app/admin/(panel)/cities/index.tsx` — table with per-city stats, edit/create/delete. City editor has an "Auto-locate" button that hits Nominatim to autofill lat/lng from the city + state + country.
      - Customer LocationContext extended with `cities`, `selectedCity`, `setSelectedCity` (persisted). Selected city drives the feed & map API calls via the new `city` query param and also recenters the map.
      - New `CityPicker` component (`/app/frontend/src/components/CityPicker.tsx`) — pill button + modal sheet with "Near me" + admin cities. Wired into Home Feed header and Map header.

      Verified manually via curl + screenshots:
      - Admin login → Categories page renders 6 seeded items with slug + counts (24 merchants/3 deals for Food, etc).
      - Admin Cities page shows San Francisco with 35 merchants / 9 active deals.
      - Customer feed shows the "Near me" pill; tapping opens modal with "Near me" + "San Francisco".
      - `POST /api/admin/categories` creates a child slug ("pizza") and `DELETE` cleans it up.

      Please test:
      1) Admin `/api/admin/categories` CRUD — create root + child + edit + delete, cycle protection.
      2) Admin `/api/admin/cities` CRUD — validation of lat/lng/radius, per-city stats accuracy.
      3) Public `/api/categories` now returns DB data with icon/color/parent_id.
      4) Public `/api/cities` returns list; distance sort works with lat/lng.
      5) Public `/api/deals?city=san-francisco` and `/api/merchants?city=san-francisco` filter properly.
      6) Bad city slug is silently ignored (no filter applied) — this is intentional.
      7) Frontend: CityPicker persists selection across reloads (localStorage on web).

backend_phase2:
  - task: "Admin Categories CRUD (hierarchical)"
    file: "backend/admin_panel.py"
    status: "NA"
    needs_retesting: true
  - task: "Admin Cities CRUD (geo + radius)"
    file: "backend/admin_panel.py"
    status: "NA"
    needs_retesting: true
  - task: "Public /api/categories from DB with fallback"
    file: "backend/server.py"
    status: "NA"
    needs_retesting: true
  - task: "Public /api/cities + city geo-filter on /api/deals & /api/merchants"
    file: "backend/server.py"
    status: "NA"
    needs_retesting: true

frontend_phase2:
  - task: "Admin Categories page (tree + modal editor)"
    file: "frontend/app/admin/(panel)/categories/index.tsx"
    status: "NA"
    needs_retesting: true
  - task: "Admin Cities page (table + modal + geocode)"
    file: "frontend/app/admin/(panel)/cities/index.tsx"
    status: "NA"
    needs_retesting: true
  - task: "Customer CityPicker on feed + map; persists selection; filters API"
    file: "frontend/src/components/CityPicker.tsx + frontend/src/context/location.tsx"
    status: "NA"
    needs_retesting: true
