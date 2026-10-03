# YOMICO

YOMICO is a multi-vendor marketplace for India. Customers shop and pay online (Razorpay) or on
delivery. Sellers list products after KYC approval. YOMICO's own delivery network (freelance riders
and delivery companies) delivers orders. Admins run approvals, orders, refunds and payouts from one
console.

Live site: **https://yomico.in** (the apex domain is canonical; see [Domain and external
configuration](#domain-and-external-configuration)).

## Stack

| Area | What is used |
| --- | --- |
| Web app | Next.js 16 (App Router, built with `--webpack`), React 19, Tailwind CSS 4 |
| Data | Firebase Auth, Cloud Firestore, Cloud Storage (client SDK in the browser, Admin SDK on the server) |
| Payments | Razorpay (orders, webhook, refunds API) |
| Email | Resend (verification, order status, delivery codes, contact form) |
| AI assistants | Google Gemini (`@google/genai`), customer / seller / admin assistants |
| Hosting | Vercel (one daily cron, see `vercel.json`) |
| Tests | Firebase Emulator Suite + `tsx` harnesses in `scripts/test`, run by `npm test` |

## Architecture in one page

- **Money and status never come from the browser.** Order prices, totals, stock, coupons,
  points, refunds, KYC decisions and status changes are computed and written by server routes in
  `app/api/**` with the Admin SDK. The browser sends ids and choices only.
- **Firestore rules are the second wall.** `firestore.rules` and `storage.rules` deny anything
  the client should not write (status, money, KYC decisions, document pointers). Collections
  written only by the server (for example `orderEmails`, `vendorChangeRequests`) fall under the
  final default-deny rule.
- **Orders:** placed by `app/api/place-order` (web, pay on delivery),
  `app/api/create-order` → Razorpay → `app/api/finalize-online-order` or the webhook (web online),
  and `app/api/mobile/*` (Customer App). An admin confirms the order (`app/api/confirm-order`),
  which creates one `sellerOrders` record per seller. Line items then move
  Confirmed → Packed → Shipped → Out For Delivery → Delivered (`app/api/seller/advance-item`
  or the Delivery Engine via `lib/deliveryEngine/reconcile.ts`). The order status is derived from
  its items.
- **Shared rules live in dependency-free `lib/*` modules**, for example `lib/returnEligibility.ts`,
  `lib/deliveryEstimate.ts`, `lib/orderTracking.ts`, `lib/productImage.ts`,
  `lib/storefront/searchRelevance.ts`, `lib/sellerKyc.ts` and `lib/adminNav.ts`. Pages, routes and
  tests import the same rule.

## Local setup

Requirements: Node.js ≥ 22.12, npm, and Java 11+ (for the Firebase emulators).

```bash
npm ci
cp .env.example .env.local      # names only; fill in what you need
```

`npm run dev` **does not connect to the production Firebase project.** It requires an explicit
target and throws a clear error if none is configured (`lib/firebaseConfig.ts`,
`lib/firebaseAdmin.ts`). Choose one option.

### Option A: Firebase Emulator Suite (recommended)

```bash
# terminal 1: local Firestore, Auth and Storage
npx firebase emulators:start --only firestore,auth,storage --project demo-yomico-local

# terminal 2
npm run dev
```

Set the emulator values shown in `.env.example` (Option A) in `.env.local`. The project id must
start with `demo-`, which Firebase guarantees has no real project behind it. The app refuses to
pair emulator mode with a real project id.

### Option B: a separate development Firebase project

Set all `NEXT_PUBLIC_FIREBASE_*` values and that project's `FIREBASE_SERVICE_ACCOUNT_KEY`. The Admin
SDK refuses a service account whose project differs from the client configuration.

### Option C: production (deliberate only)

`NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV=true` points `npm run dev` at production. Every write
then goes to real customer data. Do not use it for routine development.

## Environments and safety

| Environment | Firebase | Razorpay | Email |
| --- | --- | --- | --- |
| Vercel Production (`next build`) | production project | live keys | Resend (real) |
| Vercel Preview | its own project via `NEXT_PUBLIC_FIREBASE_*`; fails closed if incomplete | test keys only (enforced) | only if `RESEND_API_KEY` is set there |
| `npm run dev` | emulators / dev project / explicit opt-in (enforced) | test keys only (enforced) | only if `RESEND_API_KEY` is set |
| `npm test` and CI | emulators only, `demo-*` project ids | in-repo fake | fake transport; never sent |

- `RAZORPAY_KEY_ID` must be a `rzp_test_…` key under `npm run dev` and on Preview
  (`lib/razorpayEnv.ts`). A live key is refused unless `ALLOW_LIVE_RAZORPAY_IN_DEV=true`.
- Never commit `.env*` files. Only `.env.example`, which holds names, is tracked.

## Environment variables

**Names only.** Production values live in Vercel → Project → Settings → Environment Variables.
`.env.example` lists the same names.

| Kind | Names |
| --- | --- |
| Server secrets | `FIREBASE_SERVICE_ACCOUNT_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`, `DELIVERY_OTP_SECRET`, `GEMINI_API_KEY` |
| Public | `NEXT_PUBLIC_RAZORPAY_KEY`, `NEXT_PUBLIC_SITE_URL`, optional `NEXT_PUBLIC_FIREBASE_*` set |
| Local-only switches | `NEXT_PUBLIC_USE_FIREBASE_EMULATORS`, `NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV`, `ALLOW_LIVE_RAZORPAY_IN_DEV`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST` |

## Build and deploy

```bash
npm run typecheck   # npx tsc --noEmit
npm run build       # next build --webpack
npm start
```

Vercel deploys the app from the Git repository. A production build needs no secrets at build time:
without `FIREBASE_SERVICE_ACCOUNT_KEY` the sitemap simply omits products and stores.

`vercel.json` schedules `/api/cron/credit-reward-points` daily at 01:30 UTC. Vercel sends
`Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set on the project.

## Firebase rules deployment

Rules are **not** deployed by CI or by Vercel. After a change to `firestore.rules`,
`storage.rules` or `firestore.indexes.json`:

1. Run the rules suites locally, for example `npm test -- admin-access-rules kyc-rules storage-rules`
   (or all of `npm test`).
2. Deploy deliberately, from a machine logged in to the production project:
   `npx firebase deploy --only firestore:rules,storage` (add `firestore:indexes` when indexes
   changed).

The Phase 6 medium batch (KYC resubmission, return windows, order emails) needs **no** rules change.

## Admin access

An account is an admin when its email is **verified** and it is either the owner account
(`lib/adminConfig.ts`) or holds an active `adminRoles/{uid}` record. The same test runs in
`lib/adminAccess.ts` (every admin API), `firestore.rules` and `storage.rules`. Only the server
writes `adminRoles`. Only the owner can grant or revoke access, from **Admin → Admin Access**. The
old `adminUsers` staff directory never granted access and is labelled as such. Revocation takes
effect within about 30 seconds on the server, and immediately in the security rules.

The admin sidebar (`lib/adminNav.ts`) is one list for desktop and the mobile drawer. It highlights
only the most specific matching page, so "Delivery" is not highlighted on
`/admin/delivery-companies` or `/admin/delivery-partners`.

## Sellers and KYC

1. A seller registers at `/vendor-register` (business, identity, bank details and KYC documents
   in `vendor-kyc/{uid}/`). The record starts as `kycStatus: "Pending"`.
2. An admin reviews in **Admin → Vendor KYC** and approves or rejects through
   `app/api/admin/kyc/decision`. The server checks admin access from the verified token. A
   rejection **requires a reason** (5–500 characters). Each decision updates `vendors`, the public
   mirror `vendors_public` and `audit_logs` in one transaction.
3. At `/vendor-login`, a Pending or Rejected seller is sent to **`/seller-kyc`** instead of a dead
   end. There they see the status and, if rejected, the reason. They can correct their PAN,
   Aadhaar, GSTIN and bank details, upload replacement documents, and **resubmit**
   (`app/api/seller/kyc`). This puts the application back to Pending for review.
4. Only an Approved seller can open `/seller` or list products. A seller can never approve
   themselves: `kycStatus` and `status` are frozen against the seller's own writes in
   `firestore.rules`, and only the admin route sets Approved. Approval never lifts a Blocked
   account.

## Returns and return windows

- Each product has a return window in whole days, set by the seller (**1–30**, default **7**).
  The create/update product routes validate it (`lib/products/sellerProductValidation.ts`).
- The window is **copied onto every order line when the order is created**. Later product edits
  never change an existing order. Orders placed before this change keep the 7 days they were sold
  with.
- A return or replacement request is judged per item against that line's own window
  (`app/api/item-request`, `lib/itemRequests.ts`). Pickup and approval rules are unchanged.
- Anything that waits for **all** return windows to close (reward-point credit) uses the
  **longest** line window on the order (`lib/returnEligibility.ts#orderReturnDays`).

## Payments: Razorpay

- Web online: `app/api/create-order` creates a Razorpay order from a server-priced payment intent.
  `app/api/finalize-online-order` (browser) or `app/api/razorpay/webhook` (browser gone) finalises
  it exactly once.
- Customer App: `app/api/mobile/create-payment-order` → `lib/mobileOnlineOrder.ts`.
- The webhook needs `RAZORPAY_WEBHOOK_SECRET` and the dashboard setup in
  [Domain and external configuration](#domain-and-external-configuration).

## Refunds (cancelled online orders)

Cancelling a paid online order records `refundStatus: "Required"` with the amount owed. In
**Admin → Orders**, use **Refund via Razorpay**. The server (`app/api/admin/orders/[id]/refund`,
`lib/refunds/orderRefund.ts`) takes the amount and payment from the stored order and verifies the
payment with Razorpay before acting. It is safe to click twice: a repeated or concurrent request
never creates a second Razorpay refund.

- **Processing**: Razorpay accepted the refund but hasn't settled it. Use **Check Status with
  Razorpay**, or enable the refund webhook events.
- **Refunded**: Razorpay reports the refund as processed. The customer gets one "Refund
  processed" email.
- **Failed**: no money was returned. The reason is shown, and you can retry.
- Reward-point portions are returned as points at cancellation, so only money actually paid is
  refunded. Seller payouts are not affected.
- **Record Manual Refund** is for refunds made outside Razorpay (UPI, bank transfer). It is
  recorded from the admin page directly and does **not** send a customer email.

## Email: Resend

All mail is sent from `YOMICO <noreply@yomico.in>` (`lib/siteConfig.ts#EMAIL_FROM`) using
`RESEND_API_KEY`. Without the key nothing is sent, and every commerce operation still succeeds.

**Order-status emails** (`lib/orderStatusEmail.ts`): placed, confirmed, shipped, out for
delivery, delivered, cancelled, refunded.

- Sent only **after** the status change is saved, by the route that made it. A mail failure never
  fails or undoes the order operation.
- **Once per order and event:** a server-only ledger `orderEmails/{orderId}_{event}` is claimed in
  a transaction, and Resend receives the same idempotency key. Retries, double clicks and the
  webhook/browser race therefore send one email. A failed send can be retried up to 3 times.
- The recipient and every value come from the stored order. Names are HTML-escaped.

Other mail: account verification (`app/api/auth/send-verification-email`), delivery codes
(`lib/deliveryEngine/otpService.ts`) and the contact form (`app/api/contact`, delivered to the
support inbox in `lib/siteConfig.ts`).

## Delivery, OTP and delivery dates

- The customer's handover code is sent by **in-app notification and email**. **There is no SMS
  channel**: no SMS provider is configured. Each code's delivery status is recorded per shipment
  and shown to the rider, the delivery company and the customer. The customer can tap **Resend
  delivery code**. If they still can't get it, the rider must not hand over, and records a
  failed attempt. Codes are 6 digits, stored only as an HMAC (`DELIVERY_OTP_SECRET`), valid for
  24 h, lock after 5 wrong entries, and are single-use.
- Adding SMS needs a provider account and a DLT-registered sender and template (India). It would be
  a new channel in `lib/deliveryEngine/otpService.ts`.
- **Delivery dates are never invented.** Before an order exists, customers see the rule (when
  orders are usually confirmed, and the delivery target after confirmation). After confirmation
  they see the stored target date, or the seller's own expected date (`lib/deliveryEstimate.ts`).
  There is no carrier or pincode transit data.

## Support

Support is staffed Monday–Saturday and replies within 24–48 business hours
(`lib/siteConfig.ts`). There is no 24/7 support, and no page may claim one.

## Error monitoring

- `app/error.tsx` and `app/global-error.tsx` show customers a safe page with **Try again** and a
  reference code. They never show error text or stack traces.
- `instrumentation.ts` (`onRequestError`) writes one redacted JSON line per server error to the
  Vercel runtime logs. Browser render errors are reported to `/api/client-errors`. Search by the
  reference (`digest`).
- No third-party monitoring service (such as Sentry) is configured.

## Tests and CI

```bash
npm test                           # every suite
npm test -- kyc-flow order-emails  # only these suites (prefix match)
npm test -- --list                 # list suites
npx tsx scripts/test/phase6/storefront.test.mts   # one plain-Node suite directly
```

- The suite list is `scripts/test/suites.mjs`. Each emulator suite runs in its own
  `firebase emulators:exec` with a `demo-*` project. The runner removes Firebase, Razorpay, Resend
  and Gemini credentials from its environment. It works on Windows, macOS and Linux.
- Razorpay is replaced by an in-repo fake (`scripts/test/mobile-variant/razorpay-fake.mjs`), and
  order emails go to a fake transport. No real payment, refund or email is ever made.
- Every suite runs in CI; none is excluded. (The four legacy failures inherited from `e88d1aa` were
  stale tests and have been fixed.)
- **CI** (`.github/workflows/ci.yml`) runs on every push and pull request: `npx tsc --noEmit`,
  `npm run build`, `npm test`. No secrets are configured, and nothing is masked: any failure
  fails the job.

## Domain and external configuration

These settings live **outside this repository**, in third-party dashboards. Nothing in the code or
CI changes them. Check them by hand before launch and after any domain change.

| What | Where | Required setting |
| --- | --- | --- |
| Canonical domain | code (`lib/siteConfig.ts`) | `https://yomico.in` (apex). Already used by metadata, canonical URLs, the sitemap, robots.txt, JSON-LD and emails. |
| `www` → apex redirect | Vercel → Project → Settings → Domains | `www.yomico.in` added and set to **redirect (308) to `yomico.in`**, with `yomico.in` as the primary domain. |
| Razorpay webhook | Razorpay Dashboard → Settings → Webhooks | URL **`https://yomico.in/api/razorpay/webhook`**. Use the apex, not `www`, because Razorpay does not follow redirects. Event `payment.captured`; optionally `refund.processed` and `refund.failed`. Secret = the value of `RAZORPAY_WEBHOOK_SECRET`. |
| Sender domain | Resend → Domains | `yomico.in` verified (SPF/DKIM), so `noreply@yomico.in` can send. |
| Cron secret | Vercel → Environment Variables | `CRON_SECRET` set, so the daily reward-credit cron is authorised. |
| Firebase rules | Firebase CLI (manual) | The repository's `firestore.rules` and `storage.rules` deployed (see above). |

To check the redirect: `curl -sI https://www.yomico.in/` should show a `308` status with
`location: https://yomico.in/`.

## Launch checklist

1. `npx tsc --noEmit`, `npm run build` and `npm test` pass (CI green on the release commit).
2. Vercel Production has every server secret and public variable listed above.
3. `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY` are **live** keys in Production and **test**
   keys in Preview.
4. Razorpay webhook URL and events as in the table above. Send a test event from the dashboard.
5. `www.yomico.in` redirects to `https://yomico.in` (curl check above).
6. Resend domain verified. Place a test order on Production with your own account and receive
   the "Order placed" email.
7. `firestore.rules` and `storage.rules` deployed and matching the repository.
8. The owner admin account's email is verified. Admin roles are granted only to the people who
   need them.
9. `CRON_SECRET` set, and the cron is listed under Vercel → Crons.
10. `DELIVERY_OTP_SECRET` set (delivery codes cannot be issued without it).

## Known external dependencies and limitations

- **No SMS:** delivery codes go by app notification and email only.
- **No carrier tracking or pincode ETAs:** delivery dates come from YOMICO's own target or a
  seller-entered date.
- **Manual refunds send no email.** They are recorded from the admin page.
- **No third-party error monitoring** (Sentry or similar) is configured.
- External services: Firebase (Google Cloud), Razorpay, Resend, Vercel and Google Gemini. If one is
  down, its feature is unavailable. Orders still commit when email fails.
