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

## Latest Iteration (this session)
- ✅ Customer + Merchant Sign-up now has Phone/Email tabs
- ✅ Customer feed radius selector added and wired to backend max_km
- ✅ Merchant map picker "Use my GPS" button added
- ✅ AuthContext.setSession fix — OTP flow now populates user immediately

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
