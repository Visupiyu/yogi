import { Timestamp } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadCustomerProfile } from "@/lib/customerAccount/customerGuards";

// ---------------------------------------------------------------------------
// POST /api/support/tickets { subject, category, message } — open a support
// ticket from the website and tell admin about it.
//
// The page used to write the ticket, then an admin notification, from the
// browser. firestore.rules refuse a browser-written admin notification, so
// that second write threw: the ticket saved, but the customer never saw a
// confirmation and admin was never told. Both writes now happen here, owned
// by the verified token (userId AND userEmail), in one batch. (The Customer
// App still writes its tickets directly, within firestore.rules.)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function field(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("support-ticket", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    let body: { subject?: unknown; category?: unknown; message?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const subject = field(body.subject, 200);
    const message = field(body.message, 2000);
    const category = field(body.category, 100) || "General";
    if (!subject) return Response.json({ error: "Please enter a subject (up to 200 characters)." }, { status: 400 });
    if (!message) return Response.json({ error: "Please describe the issue (up to 2000 characters)." }, { status: 400 });

    const db = getAdminDb();
    const profile = await loadCustomerProfile(db, requester.uid);
    const now = Timestamp.now();
    const ticketRef = db.collection("tickets").doc();
    const batch = db.batch();
    batch.set(ticketRef, {
      userId: requester.uid,
      userEmail: requester.email || "",
      customerName: profile.displayName,
      subject,
      category,
      message,
      status: "Open",
      adminReply: "",
      createdAt: now,
    });
    batch.set(db.collection("notifications").doc(), {
      title: "New Support Ticket",
      message: subject,
      role: "admin",
      type: "support",
      read: false,
      createdAt: now,
    });
    await batch.commit();
    return Response.json({ success: true, id: ticketRef.id });
  } catch (error) {
    console.error("support ticket failed:", error);
    return Response.json({ error: "Couldn't create your ticket. Please try again." }, { status: 500 });
  }
}
