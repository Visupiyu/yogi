# YOMICO

Multi-vendor marketplace built on Next.js (App Router), Firebase (Auth, Firestore, Storage)
and Razorpay, deployed on Vercel.

## Local development

`npm run dev` **does not connect to the production Firebase project.** On startup it requires an
explicit target and throws a clear error if none is configured (client config:
`lib/firebaseConfig.ts`, Admin SDK: `lib/firebaseAdmin.ts`).

Copy `.env.example` to `.env.local`, then choose one option.

### Option A: Firebase Emulator Suite (recommended)

```bash
# terminal 1 — local Firestore, Auth and Storage (Java 11+ required)
npx firebase emulators:start --only firestore,auth,storage --project demo-yomico-local

# terminal 2
npm run dev
```

with, in `.env.local`:

```
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-yomico-local
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```

The project id must start with `demo-`, which Firebase guarantees has no real counterpart. The
browser SDK connects to the emulators. The server uses the emulators with no service account.
Pairing emulator mode with a real project id is refused.

### Option B: a separate development Firebase project

Set all `NEXT_PUBLIC_FIREBASE_*` values and that project's `FIREBASE_SERVICE_ACCOUNT_KEY`. The Admin
SDK refuses a service account whose project differs from the client config.

### Option C: production (deliberate only)

`NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV=true` restores the old behaviour. Every write then
goes to real customer data. Don't use it for routine development.

### Razorpay outside production

`RAZORPAY_KEY_ID` must be a `rzp_test_…` key under `npm run dev` and on Vercel Preview
(`lib/razorpayEnv.ts`). A live key is refused unless `ALLOW_LIVE_RAZORPAY_IN_DEV=true` is set.

## Environments

| Environment | Firebase | Razorpay |
| --- | --- | --- |
| Vercel Production (`next build`) | production project (unchanged) | live keys |
| Vercel Preview | its own project via `NEXT_PUBLIC_FIREBASE_*`, fail-closed if incomplete | test keys only (enforced) |
| `npm run dev` | emulators / dev project / explicit opt-in (enforced) | test keys only (enforced) |
| Test harnesses (`scripts/test`) | emulators only (`firebase emulators:exec`) | in-repo fake |

## Environment variables

Names only. See `.env.example`; never commit values.

Server-only: `FIREBASE_SERVICE_ACCOUNT_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`, `DELIVERY_OTP_SECRET`, `GEMINI_API_KEY`.

Public: `NEXT_PUBLIC_RAZORPAY_KEY`, `NEXT_PUBLIC_SITE_URL`, and the optional
`NEXT_PUBLIC_FIREBASE_*` set.

Local-only switches: `NEXT_PUBLIC_USE_FIREBASE_EMULATORS`,
`NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV`, `ALLOW_LIVE_RAZORPAY_IN_DEV`, and the
`*_EMULATOR_HOST` variables.

## Operations

### Refunds (cancelled online orders)

Cancelling a paid online order records `refundStatus: "Required"` with the amount owed. In
**Admin → Orders**, use **Refund via Razorpay** to send the refund. The server
(`app/api/admin/orders/[id]/refund`, `lib/refunds/orderRefund.ts`) takes the amount and payment
from the stored order and verifies the payment with Razorpay before acting. It is safe to click
twice: a repeated or concurrent request never creates a second Razorpay refund.

- **Processing**: Razorpay accepted the refund but hasn't settled it. Use **Check Status with
  Razorpay**, or enable the webhook events below.
- **Refunded**: Razorpay reports the refund as processed.
- **Failed**: no money was returned. The reason is shown, and you can retry.
- Reward-point portions are returned as points at cancellation, so only the money actually paid
  is refunded. Seller payouts are not affected.
- **Record Manual Refund** is still available for refunds made outside Razorpay, such as UPI or bank
  transfer.

Configuration: it needs `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, which checkout already
uses. Without them the button answers "not configured" and only the manual path works. Optional:
add the `refund.processed` and `refund.failed` events to the Razorpay webhook, so pending
refunds settle automatically.

### Admin access

An account is an admin when its email is **verified** and it is either the owner account
(`lib/adminConfig.ts`) or holds an active `adminRoles/{uid}` record. The same test runs in
`lib/adminAccess.ts` (every admin API), `firestore.rules` and `storage.rules`. `adminRoles` can only
be written by the server. Only the owner can grant or revoke access, from **Admin → Admin Access**.
The old `adminUsers` staff directory never granted access and is labelled as such.

Deployment: the updated `firestore.rules` and `storage.rules` must be deployed
(`firebase deploy --only firestore:rules,storage`) before a granted admin can use the panel. The
owner account works before and after deployment. Revocation takes effect within about 30 seconds on
the server, and immediately in the security rules.

### Delivery OTP

The customer's handover code is sent by **in-app notification and email**. **There is no SMS
channel**: no SMS provider is configured, so customers can't receive the code by text. The
delivery status of each code is recorded per shipment (no code, no address). It is shown to the
rider, the delivery company and the customer, including "email failed" and "not delivered". If the
customer can't find the code, they tap **Resend delivery code** on their order page. If they still
can't get it, the rider must not hand over and records a **failed attempt**. Codes are 6 digits,
stored only as an HMAC, valid for 24 h, and lock after 5 wrong entries. Each code is single-use
and is cleared when the parcel is delivered.

Adding SMS needs a provider account and DLT-registered sender and template (India). It would be a
new channel in `lib/deliveryEngine/otpService.ts`.

### Error monitoring

- `app/error.tsx` and `app/global-error.tsx` show customers a safe page with **Try again** and a
  reference code. They never show error text or stack traces.
- `instrumentation.ts` (`onRequestError`) writes one redacted JSON line per server error to the
  deployment's runtime logs (Vercel → Logs). Browser render errors are reported to
  `/api/client-errors` and logged the same way. Search the logs by the reference (`digest`).
- No third-party monitoring service, such as Sentry, is configured. Adding one needs an account and
  DSN. Its SDK would hook into the same two places.

## Tests

Emulator suites live in `scripts/test/*`. Each file's header gives its exact command, for example:

```bash
npx firebase emulators:exec --only firestore --project demo-yomico-test \
  "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/order-refund/run.mts"
```

The suites refuse to run without a local emulator. Razorpay is replaced by an in-repo fake, so no
real payment or refund is ever made.
