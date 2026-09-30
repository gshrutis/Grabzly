# Happy Hour — Product Requirements (as-built)

## Vision
Hyper-local marketplace connecting nearby merchants (restaurants, cafes, retail) with customers seeking real-time, location-relevant deals. Differentiators: time-sensitive geo-triggered discovery, TikTok-style reel promotion, and one-tap QR redemption for instant foot traffic.

## Customer App
- Guest & authenticated browsing (Email/Password + Mock OTP `123456`)
- Map, Feed, and Reels-based deal discovery
- Category chips + Deal-type filter (Flash / Regular / Video)
- Radius/proximity selector (0.5 / 1 / 3 / 5 / 10km+) driving `/api/deals?max_km=…`
- Sort by Nearest / Biggest discount / Expiring soon / Top rated / Price
- Real-time countdowns; live deal card carousel
- QR-based deal claiming (`POST /api/claims/{deal_id}`)
- Loyalty points: +25 pts per redemption, +100/+200 pts referral system
- Profile: user info, points, referrals

## Merchant Panel
- Sign-in / Sign-up (Email or Phone OTP)
- KYC + business onboarding (3-step wizard: info → docs → media)
- Editable pre-filled profile once created
- Map picker with tap-to-drop-pin AND "Use my GPS" button
- Deal catalog CRUD with image / video promo attachment
- QR redemption scanner via `expo-camera`
- Real-time analytics summary
- Data preserved on sign-out

## Admin Panel (Web-focused)
- Auth: Email + password (JWT, in-memory brute-force protection 5 tries / 15 min)
- Dashboard: KPIs (customers, merchants, deals) + charts (by category, by city, growth over time)
- Merchants module: list/filter/search, per-merchant details, status change (approve/reject/suspend)
- Deals module: list/filter/search, details with engagement (claims / redemptions), status change (approve/reject/pause/archive/feature)
- Customers module: list/filter/search, details with claim + redemption + points stats, block/deactivate
- **Categories module** (Phase 2): hierarchical categories with CRUD; drives both merchants and deals; cycle protection; deletion guards for children + in-use references
- **Cities module** (Phase 2): geo-anchored regions (center lat/lng + radius); admin CRUD with auto-geocode (Nominatim); per-city merchant + active-deal counts
- **Settings module** (Phase 3): single-doc system config wired LIVE into the app (brand, support email, default deal radius, loyalty points, referral bonuses, guest-browsing + reels-tab feature flags)
- **Global Search** (Phase 3): unified search bar in the top navbar (merchants, deals, customers) — debounced, case-insensitive, regex-safe; clickable results deep-link to entity details
- Audit trail: every mutating action logged to `audit_log` collection

## Customer City Filter (Phase 2)
- Admin-managed cities exposed via public `GET /api/cities`
- Customer feed + map header has a City picker pill; selecting a city:
  - Filters `/api/deals?city=<slug>` and `/api/merchants?city=<slug>` (haversine within the city radius)
  - Recenters the map on the city center
  - Persists via `hh_selected_city` in AsyncStorage/localStorage
- "Near me" option falls back to GPS-based feed

## Latest Iteration (this session)
- ✅ Customer + Merchant Sign-up now has Phone/Email tabs
- ✅ Customer feed radius selector added and wired to backend max_km
- ✅ Merchant map picker "Use my GPS" button added
- ✅ AuthContext.setSession fix — OTP flow now populates user immediately
- ✅ Admin Panel Phase 2 — Categories + Cities modules (25/25 backend tests pass)
- ✅ Admin Panel Phase 3 — Settings module (live wired) + Global Search (19/19 backend tests pass)
- ✅ **Audit Fix Pass** — 19/19 backend tests pass:
  - **One mobile = one user**: normalized phone stored in `phone_normalized`, unique partial index, OTP verify looks up by normalized form, startup migration merges any pre-existing duplicates (union roles, repoint owned data).
  - **Multi-role user**: `roles[]` + `active_role` on User; `/auth/switch-role` endpoint; onboard flips `active_role` to merchant; Profile screen shows a role switcher card when a user has both roles.
  - **Dashboard counts**: rewritten queries — customers count via roles[] (excludes admins), active/pending/rejected merchant KPIs use verification_status + status, active_deals correctly excludes drafts/paused/expired/rejected.
  - **Deal status column**: backend now returns `computed_status` on every admin deal listing (never empty); new statuses supported: active, expired, draft, paused, approved, pending, rejected, archived.
  - **Admin filters**: reusable `FilterPanel` component with collapsible drawer; Category & City chips auto-populate from admin cities/categories; Merchants/Deals/Customers have server-side date range (since/until), category, city, deal_type, and multi-field search.
  - **Cities in customer/merchant app**: `CityPicker` refetches on open; merchant onboarding shows admin-managed cities as chips (auto-fills lat/lng); customer feed & map filter by selected city.
  - **Deal image**: detail view now uses blurred cover + `contain` fit so the entire image is visible with no cropping; compact list cards stay cover-fit.
  - **Follow-merchant notification**: fan-out on deal publish (create-non-draft or draft→publish PATCH); marker on deal prevents duplicate notifications; owner + non-followers excluded.

## Tech Stack
- Frontend: Expo Router, React Native, `react-native-webview` (Leaflet map), `expo-camera`, `expo-clipboard`, `expo-location`, `expo-haptics`
- Backend: FastAPI, Motor (Async MongoDB), PyJWT, Passlib
- DB: MongoDB (auto-seeded with 6 merchants + 15 deals near SF anchor)

## Currency
- ₹ (Indian Rupee) across all price displays

## Auth
- JWT (HS256, 30-day expiry)
- OTP mocked with static code `123456` and per-request `demo_code` hint
- Any registered user can become a merchant via `/api/merchant/onboard`

## Known Follow-ups
- Push notifications (geofence, expiring, merchant→followers) — requires native build
- Deep links (`happyhour://`) for shared deals
- Real video upload (currently mocked mp4 links)
- Offline redemption sync (P2)
- Follow/Favorite merchant push triggers (P2)
- Admin brute-force protection: migrate in-memory → MongoDB TTL for multi-pod scale (P3)
