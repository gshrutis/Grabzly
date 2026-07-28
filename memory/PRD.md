# HappyHour — Product Requirements (MVP scope built)

## Vision
Hyper-local marketplace that surfaces real-time deals from nearby merchants (restaurants, cafes, grocery, clothing, kitchenware, bakery) using time-sensitive geo-triggered discovery + short-form video promotion, driving foot traffic to physical stores.

## MVP Scope (this iteration — Customer App)
- **Onboarding**: Location-priming screen (with skip-to-browse), category preference selection.
- **Home / Feed**: Category chips, deal-type chips (Flash / Regular / Video), distance-radius filter, sort options (distance, discount, expiring, rating, price), horizontally-scrolling "Live Now" section with live countdown.
- **Map view**: Stylized pin canvas positioning merchants by lat/lng offset around user's anchor, pin colors by category, tap-to-select card. (react-native-maps requires native build; we ship a portable canvas that runs on web + native.)
- **Reels**: TikTok-style vertical swipeable full-screen video feed with `expo-video`; each reel has a persistent "View deal" CTA and "Store" side action. Mute toggle. Auto-play/pause on scroll.
- **Deal detail**: Hero (image or video), discount badge, before/after price, countdown timer, quantity remaining, merchant card + directions, terms. Sticky Claim CTA above safe area.
- **Store profile**: Cover image, follow toggle (heart), rating/distance/hours, description, call + directions actions, list of active deals.
- **Search**: Debounced text search across deal title/description/merchant name.
- **Claim + QR**: One-tap Claim with race-safe atomic quantity decrement; unique redemption code + real SVG QR code; 60-min redemption window (bounded by deal expiry). Cancel-claim releases quantity back.
- **My Claims**: Tabbed by status — Active / Redeemed / Expired / Cancelled. Auto-expires past-deadline claims on read. Countdown to redemption deadline. Deep link to per-claim QR screen.
- **Profile / Settings**: Category prefs (synced with backend), notification toggles (nearby deals, expiring reminders, followed merchants, quiet hours), sign in/out, location.
- **Auth**: Guest browsing allowed; email/password JWT signup + login required only at claim/follow. Token stored via `secure*` API.

## Backend endpoints (FastAPI + MongoDB, prefix `/api`)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`
- `GET /categories`
- `GET /merchants`, `GET /merchants/{id}`, `POST /merchants/{id}/follow` (auth)
- `GET /deals`, `GET /deals/live-now`, `GET /deals/reels`, `GET /deals/{id}`
- `POST /deals/{id}/claim` (auth), `GET /claims/me` (auth), `GET /claims/{id}` (auth), `POST /claims/{id}/cancel` (auth)
- `POST /seed` (idempotent; also auto-seeds on startup)

## Seed data
6 merchants × 2–3 deals each = 15 total deals near the user's anchor (37.7749, -122.4194 by default). Deals span all three types (flash / regular / video). Video reels use Google Cloud sample bucket mp4s.

## Deferred (post-MVP, roadmap)
- Merchant panel & self-serve deal posting
- OTP / social login (Google/Apple)
- Merchant-side redemption scanner + offline sync
- Points/loyalty & referral programs
- Push notifications (requires deployment + build)
- Real react-native-maps integration on native builds
- Wishlist / save-for-later
- Reviews & ratings write path

## Design system
Personality: Tactile / Playful LIGHT. Brand accent `#FF5A36`. Chunky cards, oversized tap targets, gradient scrims on hero imagery, live-now pulsating error-red badges. Ionicons throughout, `expo-image` for images, `react-native-safe-area-context` everywhere.
