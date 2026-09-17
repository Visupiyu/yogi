import { Resend } from "resend";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

// ---------------------------------------------------------------------------
// Branded email-verification sender.
//
// Firebase's own sendEmailVerification() is no longer called anywhere in the
// signup/login flows: this project's Firebase console reports "Email template
// updates are currently unavailable", so its default mail can't be branded or
// pointed at the verified yomico.in domain. Instead the verification LINK is
// generated server-side via the Admin SDK and delivered via Resend from
// YOMICO <noreply@yomico.in>.
//
// The client sends NOTHING. No email, no name, no redirect URL, no template
// data. The recipient is taken from the verified ID token, the display name is
// read from Firestore, and the continue URL is a server constant — so this
// route cannot be used to mail an arbitrary address or inject arbitrary
// content, and it is not an open relay.
//
// NOTE ON THE ADMIN SDK:
// The link comes from firebase-admin/auth's generateEmailVerificationLink()
// (see getAdminAuth() in lib/firebaseAdmin.ts), not a hand-rolled call to
// Identity Toolkit's accounts:sendOobCode — see the comment in
// lib/firebaseAdmin.ts for why importing firebase-admin/auth is safe on this
// project's Node >=22.12.0.
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

    // In development only, surface the real failure reason so the cause is
    // visible without digging through the server console. Production keeps
    // the opaque message either way.
    const isDev = process.env.NODE_ENV !== "production";

    let link: string;
    try {
      link = await getAdminAuth().generateEmailVerificationLink(
        requester.email,
        { url: SITE_URL }
      );
    } catch (error) {
      // FirebaseAuthError only ever carries a code/message describing the
      // failure — never the credential or an access token — so it's safe to
      // log in full server-side.
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code: unknown }).code)
          : null;
      const message = error instanceof Error ? error.message : String(error);

      console.error("send-verification-email: link generation failed", {
        code,
        message,
      });

      return Response.json(
        {
          success: false,
          error: isDev
            ? `[${code ?? "unknown"}] ${message}`
            : "Couldn't create the verification link.",
        },
        { status: 502 }
      );
    }

    const name = await lookupDisplayName(requester.uid);

    const { error: resendError } = await resend.emails.send({
      from: FROM,
      to: requester.email,
      subject: SUBJECT,
      html: buildHtml(name, link),
    });

    if (resendError) {
      // Resend resolves with an { error } object rather than throwing, so
      // this must be checked explicitly — no secrets in this error shape.
      console.error("send-verification-email: Resend send failed", {
        name: resendError.name,
        statusCode: resendError.statusCode,
      });

      return Response.json(
        {
          success: false,
          error: isDev
            ? `[${resendError.name}${
                resendError.statusCode ? " " + resendError.statusCode : ""
              }] ${resendError.message}`
            : "Couldn't send the verification email.",
        },
        { status: 502 }
      );
    }

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
