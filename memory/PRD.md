# HappyHour — Product Requirements (MVP + Phase 2)

## Vision
Hyper-local marketplace surfacing real-time deals from nearby merchants (restaurants, cafes, grocery, clothing, kitchenware, bakery) using time-sensitive geo-triggered discovery + short-form video promotion. Full two-sided marketplace with a Customer app + Merchant panel.

## Phase 1 (Customer app) — shipped
- Onboarding priming + category preferences
- Feed with search / category chips / deal-type chips / distance / sort / Live Now with countdowns
- Stylized Map view
- TikTok-style Reels (auto-play, mute, "View deal" CTA)
- Deal detail with video/image, discount, quantity urgency, sticky Claim CTA
- Store profile (follow, directions, call)
- Claim + QR code (race-safe atomic decrement)
- My Claims (Active/Redeemed/Expired/Cancelled)
- Guest browsing + JWT email/password sign-in at claim time
- Loyalty section on profile (points + ledger)
- Referral share (with copy-to-clipboard and native share sheet)
- Deep link scheme `happyhour://`

## Phase 2 (Merchant panel) — shipped
### Onboarding & KYC (MER-01..MER-08)
- 3-step wizard: business info, KYC docs upload (base64), store branding
- Auto-verified on submit for demo; verification-status tracker on settings

### Deal & catalog (MER-09..MER-24)
- Three deal types: Flash / Regular / Video (with sample-video library + gallery upload + camera recording)
- Full form: title, description, category-specific dietary tags, discount, quantity, per-customer limit, duration, terms
- Deal list with filters (All / Active / Scheduled / Paused / Expired / Drafts)
- Pause, resume, end early, duplicate, delete
- Draft save + live preview modal
- Real-time quantity display, low-stock urgency

### Redemption (MER-25..MER-32)
- Camera QR scanner (expo-camera CameraView)
- Manual 6-char code entry fallback
- Offline validation using cached active-claim list
- Real-time redemption log (Active/Redeemed/Expired/Cancelled)
- Merchant void (with reason) — restores quantity for flash deals
- Loyalty points auto-awarded on redemption

### Analytics (MER-33..MER-40)
- Totals: views, claims, redemptions, no-shows, redemption rate, GMV
- Daily bar chart (claims vs redemptions, last 7 days)
- Peak-hours heatmap (day × hour, seeded pattern)
- Video performance (views, watch-through %, shares, click-through)
- Anonymized peer benchmark
- Export CSV/PDF buttons (UI stubs)

### Growth & monetization (MER-41..MER-47)
- Promo codes (create, list, discount %, max uses, first-time-only)
- Push-to-followers (UI, rate-limited badge)
- Message inbox (list + threaded view; reply post-MVP)
- Merchant referral for supply-side growth
- In-store customer redemption completes the loop

## Backend endpoints (`/api` prefix)
### Auth
`POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`

### Discovery
`GET /categories`, `GET /sample-videos`
`GET /merchants`, `GET /merchants/{id}`, `POST /merchants/{id}/follow`
`GET /deals`, `GET /deals/live-now`, `GET /deals/reels`, `GET /deals/{id}`

### Claims (customer)
`POST /deals/{id}/claim`, `GET /claims/me`, `GET /claims/{id}`, `POST /claims/{id}/cancel`

### Merchant
`POST /merchant/onboard`, `GET /merchant/me`, `PATCH /merchant/me`
`GET /merchant/deals`, `POST /merchant/deals`, `PATCH /merchant/deals/{id}`, `POST /merchant/deals/{id}/end`, `POST /merchant/deals/{id}/duplicate`, `DELETE /merchant/deals/{id}`
`GET /merchant/claims`, `POST /merchant/redeem/validate`, `POST /merchant/redeem`, `POST /merchant/claims/{id}/void`
`GET /merchant/analytics/summary`
`GET /merchant/promo-codes`, `POST /merchant/promo-codes`
`GET /merchant/chat/threads`

### Loyalty & chat
`GET /loyalty/me`
`POST /chat/send`, `GET /chat/thread/{merchant_id}`

## Deferred (post-Phase 2)
- OTP / social login
- In-app video trim / filters / licensed music library
- Real react-native-maps on native builds
- Multi-branch merchant chains
- Reviews & ratings write path
- Actual push notifications (requires deploy + native build)
- Merchant chat reply endpoint (thread posting from merchant side)
- Cloudinary/S3 video upload (currently stored as base64 in Mongo; sample library also available)
