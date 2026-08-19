import { Resend } from "resend";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { firebaseConfig } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Branded email-verification sender.
//
// Firebase's own sendEmailVerification() is no longer called anywhere in the
// signup/login flows: this project's Firebase console reports "Email template
// updates are currently unavailable", so its default mail can't be branded or
// pointed at the verified yomico.in domain. Instead the verification LINK is
// generated server-side with the service-account credential and delivered via
// Resend from YOMICO <noreply@yomico.in>.
//
// The client sends NOTHING. No email, no name, no redirect URL, no template
// data. The recipient is taken from the verified ID token, the display name is
// read from Firestore, and the continue URL is a server constant — so this
// route cannot be used to mail an arbitrary address or inject arbitrary
// content, and it is not an open relay.
//
// NOTE ON THE ADMIN SDK:
// firebase-admin/auth (which exposes generateEmailVerificationLink) is
// deliberately NOT imported — see the comment block in lib/firebaseAdmin.ts:
// it pulls in jose v6 (ESM-only) and crashes Vercel with ERR_REQUIRE_ESM,
// which would take down every route that touches the admin app. This calls the
// same Identity Toolkit endpoint that generateEmailVerificationLink() calls
// internally (accounts:sendOobCode with returnOobLink), authenticated with the
// same service-account credential, which is the same workaround
// lib/serverAuth.ts already uses in place of verifyIdToken().
// ---------------------------------------------------------------------------

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const FROM = "YOMICO <noreply@yomico.in>";
const SUBJECT = "Verify your YOMICO account";

// Where the customer lands after Firebase accepts the verification. No env var
// for the site URL exists in this project, so this matches the canonical
// domain already declared in app/layout.tsx's metadataBase, while still
// honouring NEXT_PUBLIC_SITE_URL if one is added later. Never a localhost URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yomico.in";

// Same rateLimits collection / window-count document shape as
// app/api/create-order/route.ts, namespaced so it has its own budget. Stops
// this route being used to repeatedly mail one inbox.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

async function isWithinRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`verify-email_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= RATE_LIMIT_MAX) return false;

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

// The name is rendered into HTML, and it originates from a signup form, so it
// must never be interpolated raw.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Read the greeting name from trusted Firestore data, never from the request.
// Customers get a users/{uid} doc at signup; sellers register before their
// vendor document exists, so both lookups may legitimately miss — in which
// case the email simply greets without a name.
async function lookupDisplayName(uid: string): Promise<string | null> {
  const db = getAdminDb();

  try {
    const userSnap = await db.collection("users").doc(uid).get();
    const name = userSnap.exists ? userSnap.data()?.name : null;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch (error) {
    console.error("send-verification-email: users lookup failed:", error);
  }

  try {
    const vendorSnap = await db
      .collection("vendors")
      .where("uid", "==", uid)
      .limit(1)
      .get();
    if (!vendorSnap.empty) {
      const vendor = vendorSnap.docs[0].data();
      for (const field of [vendor?.fullName, vendor?.businessName]) {
        if (typeof field === "string" && field.trim()) return field.trim();
      }
    }
  } catch (error) {
    console.error("send-verification-email: vendors lookup failed:", error);
  }

  return null;
}

// Structured outcome so the caller can log/surface exactly why Identity
// Toolkit refused, instead of collapsing every failure into "null".
type LinkFailure = {
  stage: "credential" | "token" | "request" | "response";
  httpStatus: number | null;
  code: string | null;
  message: string | null;
  endpoint: string;
};

type LinkResult =
  | { ok: true; link: string }
  | ({ ok: false } & LinkFailure);

// Mints the verification link without sending Firebase's own email.
// returnOobLink:true is what makes Identity Toolkit hand the link back to us
// instead of mailing it, so the customer only ever receives the Resend copy.
async function generateVerificationLink(email: string): Promise<LinkResult> {
  const app = getAdminApp();
  // Same project either way; firebaseConfig is the existing single source of
  // truth for the id (lib/serverAuth.ts already reads it server-side).
  const projectId = app.options.projectId || firebaseConfig.projectId;
  // No API key in this URL — the call is authorised by the Bearer token, so
  // the endpoint is safe to log verbatim.
  const endpoint = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:sendOobCode`;

  const credential = app.options.credential;

  if (!credential) {
    return {
      ok: false,
      stage: "credential",
      httpStatus: null,
      code: null,
      message:
        "Admin app has no credential — FIREBASE_SERVICE_ACCOUNT_KEY may be missing or unparseable.",
      endpoint,
    };
  }

  let accessToken: string | undefined;
  try {
    // Never logged, never returned — only its presence is ever reported.
    const token = await credential.getAccessToken();
    accessToken = token?.access_token;
  } catch (error) {
    return {
      ok: false,
      stage: "token",
      httpStatus: null,
      code: null,
      message: `Could not mint an access token from the service account: ${
        error instanceof Error ? error.message : String(error)
      }`,
      endpoint,
    };
  }

  if (!accessToken) {
    return {
      ok: false,
      stage: "token",
      httpStatus: null,
      code: null,
      message: "Service account returned an empty access token.",
      endpoint,
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestType: "VERIFY_EMAIL",
      email,
      returnOobLink: true,
      continueUrl: SITE_URL,
    }),
  });

  if (!response.ok) {
    const rawBody = await response.text();
    let code: string | null = null;
    let message: string | null = null;

    // Identity Toolkit returns { error: { code, message, status, errors[] } }.
    try {
      const parsed = JSON.parse(rawBody) as {
        error?: { message?: unknown; status?: unknown };
      };
      const m = parsed.error?.message;
      const s = parsed.error?.status;
      message = typeof m === "string" ? m : null;
      code = typeof s === "string" ? s : null;
    } catch {
      message = rawBody.slice(0, 500);
    }

    return {
      ok: false,
      stage: "request",
      httpStatus: response.status,
      code,
      message,
      endpoint,
    };
  }

  const data = (await response.json()) as { oobLink?: unknown };

  if (typeof data.oobLink !== "string" || !data.oobLink) {
    return {
      ok: false,
      stage: "response",
      httpStatus: response.status,
      code: null,
      message: "Identity Toolkit returned 200 but no oobLink field.",
      endpoint,
    };
  }

  return { ok: true, link: data.oobLink };
}

function buildHtml(name: string | null, link: string): string {
  const greeting = name ? `Hello ${escapeHtml(name)},` : "Hello,";

  return `
  <div style="margin:0;padding:0;background:#f4f5f7;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
      <div style="background:linear-gradient(90deg,#16a34a,#2563eb);border-radius:20px;padding:28px 24px;text-align:center;">
        <div style="font-size:28px;font-weight:700;letter-spacing:1px;color:#ffffff;">YOMICO</div>
        <div style="margin-top:6px;font-size:13px;color:#e5f5ea;">Your trusted marketplace</div>
      </div>

      <div style="background:#ffffff;border-radius:20px;padding:32px 28px;margin-top:16px;">
        <p style="margin:0 0 16px;font-size:17px;font-weight:600;">${greeting}</p>

        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
          Welcome to YOMICO. We're glad to have you with us.
        </p>

        <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#374151;">
          To finish setting up your account, please confirm this email address
          belongs to you. It keeps your account secure and lets us send you
          order updates.
        </p>

        <div style="text-align:center;margin:0 0 26px;">
          <a href="${link}"
             style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:15px 38px;border-radius:12px;">
            Verify My Email
          </a>
        </div>

        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="margin:0 0 22px;font-size:12px;line-height:1.5;color:#2563eb;word-break:break-all;">
          ${link}
        </p>

        <p style="margin:0;padding-top:18px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.6;color:#6b7280;">
          If you didn't create a YOMICO account, you can safely ignore this
          email — no account will be activated without confirming.
        </p>
      </div>

      <div style="text-align:center;padding:22px 10px 0;font-size:12px;line-height:1.6;color:#9ca3af;">
        <div style="font-weight:600;color:#6b7280;">YOMICO</div>
        <div>This is an automated message, please don't reply to it.</div>
        <div style="margin-top:6px;">© ${new Date().getFullYear()} YOMICO. All rights reserved.</div>
      </div>
    </div>
  </div>`;
}

export async function POST(request: Request) {
  try {
    if (!resend) {
      console.error("send-verification-email: RESEND_API_KEY is missing");
      return Response.json(
        { success: false, error: "Email service is not configured." },
        { status: 500 }
      );
    }

    // Identity comes only from the ID token. The recipient address is
    // whatever Google says this token belongs to — never a request field.
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json(
        { success: false, error: "Please sign in first." },
        { status: 401 }
      );
    }

    if (!requester.email) {
      return Response.json(
        { success: false, error: "No email address on this account." },
        { status: 400 }
      );
    }

    // Already done — treat as success so callers stay simple, but send nothing.
    if (requester.emailVerified) {
      return Response.json({ success: true, alreadyVerified: true });
    }

    if (!(await isWithinRateLimit(requester.uid))) {
      return Response.json(
        {
          success: false,
          error:
            "Too many verification emails requested. Please wait a few minutes and try again.",
        },
        { status: 429 }
      );
    }

    const linkResult = await generateVerificationLink(requester.email);

    if (!linkResult.ok) {
      // Always log the full diagnostic server-side. Contains no secrets: the
      // access token and service-account key are never included, and the
      // endpoint carries no API key (it is Bearer-authorised).
      console.error("send-verification-email: link generation failed", {
        stage: linkResult.stage,
        httpStatus: linkResult.httpStatus,
        firebaseCode: linkResult.code,
        firebaseMessage: linkResult.message,
        endpoint: linkResult.endpoint,
        continueUrl: SITE_URL,
      });

      // In development only, hand the same detail back to the browser so the
      // real cause is visible without digging through the server console.
      // Production keeps the opaque message.
      const isDev = process.env.NODE_ENV !== "production";

      return Response.json(
        {
          success: false,
          // In development the real Identity Toolkit reason replaces the
          // generic string, so the browser shows the actual cause. Production
          // still returns the opaque message.
          error: isDev
            ? `[${linkResult.stage}${
                linkResult.httpStatus ? " " + linkResult.httpStatus : ""
              }] ${linkResult.message ?? "Couldn't create the verification link."}`
            : "Couldn't create the verification link.",
          ...(isDev
            ? {
                debug: {
                  stage: linkResult.stage,
                  httpStatus: linkResult.httpStatus,
                  firebaseCode: linkResult.code,
                  firebaseMessage: linkResult.message,
                  endpoint: linkResult.endpoint,
                  continueUrl: SITE_URL,
                },
              }
            : {}),
        },
        { status: 502 }
      );
    }

    const link = linkResult.link;
    const name = await lookupDisplayName(requester.uid);

    await resend.emails.send({
      from: FROM,
      to: requester.email,
      subject: SUBJECT,
      html: buildHtml(name, link),
    });

    return Response.json({ success: true });
  } catch (error) {
    // Never surface the provider error, the link, or admin details.
    console.error("send-verification-email: unexpected failure:", error);
    return Response.json(
      { success: false, error: "Couldn't send the verification email." },
      { status: 500 }
    );
  }
}
