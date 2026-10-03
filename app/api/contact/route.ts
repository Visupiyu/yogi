import crypto from "node:crypto";
import { Resend } from "resend";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadCustomerProfile } from "@/lib/customerAccount/customerGuards";
import { validateContact } from "@/lib/contactForm";

// ---------------------------------------------------------------------------
// POST /api/contact { name, email, subject, message } — the public Contact Us
// form. Works signed out.
//
// Destination (existing YOMICO infrastructure, nothing new):
//   signed out  -> email to YOMICO's published support mailbox through Resend
//                  (RESEND_API_KEY, server-side only), Reply-To = the customer.
//                  Success is reported ONLY if Resend accepted the message.
//   signed in   -> a support ticket (the same `tickets` + admin notification
//                  /api/support/tickets writes), owned by the VERIFIED token —
//                  the browser's userId/email/role are never read — so it shows
//                  under Profile > Tickets; the support email is sent as well,
//                  best-effort.
//
// Abuse: per-IP and per-address fixed-window limits (lib/rateLimit), a honeypot
// field, and a duplicate guard — the same message from the same address inside
// 10 minutes is acknowledged but never delivered twice (a double click, retry
// or replayed request). A failed delivery releases that guard so Retry works.
// No Firestore rule changes: rateLimits and tickets are written by the Admin SDK.
// ---------------------------------------------------------------------------

const SUPPORT_INBOX = "yomico.help@gmail.com";
const FROM = "YOMICO <noreply@yomico.in>";
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP_MAX = 8;
const PER_EMAIL_MAX = 4;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);

const FRIENDLY = "We couldn't send your message right now. Your message is still in the form — please try again, or email us directly.";

export async function POST(request: Request) {
  // Read per request (not at import) so the key is never captured in a bundle
  // and tests can supply their own.
  const apiKey = process.env.RESEND_API_KEY;
  let dupClaimed: (() => Promise<void>) | null = null;
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
      if (!body || typeof body !== "object") throw new Error("shape");
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    const { ok, value, errors } = validateContact(body as never);
    if (!ok) return Response.json({ error: "Please check the highlighted fields.", fields: errors }, { status: 400 });

    // Honeypot: bots fill the hidden field. Pretend success, deliver nothing.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return Response.json({ success: true });
    }

    const requester = await verifyRequestUser(request); // null when signed out / bad token
    const db = getAdminDb();

    // Duplicate guard (atomic claim).
    const dupRef = db.collection("rateLimits").doc(`contact-dup_${sha([value.email, value.subject, value.message].join("\u0000"))}`);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(dupRef);
      const at = snap.exists ? Number(snap.get("windowStart")) : 0;
      if (snap.exists && Date.now() - at < WINDOW_MS) return false;
      tx.set(dupRef, { windowStart: Date.now(), count: 1 });
      return true;
    });
    // An identical repeat is acknowledged without spending the sender's budget.
    if (!claimed) return Response.json({ success: true, duplicate: true });
    dupClaimed = async () => { await dupRef.delete().catch(() => {}); };

    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    if (
      !(await isWithinRateLimit("contact-ip", sha(ip), PER_IP_MAX, WINDOW_MS)) ||
      !(await isWithinRateLimit("contact-email", sha(value.email), PER_EMAIL_MAX, WINDOW_MS))
    ) {
      await dupClaimed();
      return Response.json({ error: "Too many messages. Please wait a few minutes and try again." }, { status: 429 });
    }


    // Identity: the verified token wins; the typed address is only a Reply-To.
    const identityEmail = requester?.email || value.email;
    const replyTo = value.email;

    const resend = apiKey ? new Resend(apiKey) : null;
    const sendEmail = async (): Promise<boolean> => {
      if (!resend) return false;
      const result = await resend.emails.send({
        from: FROM,
        to: SUPPORT_INBOX,
        replyTo,
        subject: `[Contact] ${value.subject}`.slice(0, 250),
        html: `
          <h2>New contact form message</h2>
          <p><strong>Name:</strong> ${esc(value.name)}</p>
          <p><strong>Email (reply to):</strong> ${esc(replyTo)}</p>
          <p><strong>Signed in:</strong> ${requester ? `yes — ${esc(identityEmail)}` : "no"}</p>
          <p><strong>Subject:</strong> ${esc(value.subject)}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space:pre-wrap">${esc(value.message)}</p>`,
      });
      return !result.error;
    };

    if (requester) {
      const profile = await loadCustomerProfile(db, requester.uid);
      const now = Timestamp.now();
      const ticketRef = db.collection("tickets").doc();
      const batch = db.batch();
      batch.set(ticketRef, {
        userId: requester.uid,
        userEmail: requester.email || "",
        customerName: value.name || profile.displayName,
        subject: value.subject,
        category: "Contact form",
        message: value.message,
        status: "Open",
        adminReply: "",
        createdAt: now,
      });
      batch.set(db.collection("notifications").doc(), {
        title: "New Support Ticket",
        message: value.subject,
        role: "admin",
        type: "support",
        read: false,
        createdAt: now,
      });
      await batch.commit();
      await sendEmail().catch((e) => console.error("contact: support email failed (ticket saved):", e));
      return Response.json({ success: true, ticket: true });
    }

    if (!(await sendEmail())) {
      await dupClaimed();
      console.error("contact: support email was not accepted");
      return Response.json({ error: FRIENDLY }, { status: 502 });
    }
    return Response.json({ success: true });
  } catch (error) {
    if (dupClaimed) await dupClaimed();
    console.error("contact form failed:", error);
    return Response.json({ error: FRIENDLY }, { status: 500 });
  }
}
