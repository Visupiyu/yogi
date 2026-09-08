import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// POST /api/delivery/company-applications/registered
//
// Emits the "New Delivery Company Application" admin notification after an
// authorised person submits a Phase-2 delivery-company application. Same pattern
// as app/api/delivery/applications/registered: the applicant is already
// authenticated (they self-created their Auth account and wrote
// deliveryCompanyApplications/{uid} first), so the admin-role notification is
// written SERVER-SIDE here. The company name is read from the STORED application
// document, never from the request body. NO bank details, GST, document
// paths/URLs, or other sensitive fields are read into or sent in the notification.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

async function isWithinRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`delivery-company-application_${uid}`);
  const now = Date.now();
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const windowStart = Number(data?.windowStart || 0);
    const count = Number(data?.count || 0);
    if (!data || now - windowStart > RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 }, { merge: true });
      return true;
    }
    if (count >= RATE_LIMIT_MAX) return false;
    tx.set(ref, { windowStart, count: count + 1 }, { merge: true });
    return true;
  });
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Not signed in." }, { status: 401 });
    if (!(await isWithinRateLimit(requester.uid)))
      return Response.json({ error: "Too many requests." }, { status: 429 });

    const db = getAdminDb();

    // The application must exist and belong to the caller (doc id = uid).
    const appRef = db.collection("deliveryCompanyApplications").doc(requester.uid);
    const appSnap = await appRef.get();
    if (!appSnap.exists) {
      return Response.json({ error: "No company application found." }, { status: 404 });
    }
    const application = appSnap.data() as { companyName?: unknown };
    const companyName =
      typeof application?.companyName === "string" && application.companyName.trim()
        ? application.companyName.trim().slice(0, 120)
        : "A new delivery company";

    // Idempotent: one notification per application.
    const notificationRef = db
      .collection("notifications")
      .doc(`delivery_company_application_${requester.uid}`);
    if ((await notificationRef.get()).exists) {
      return Response.json({ success: true, alreadyNotified: true });
    }

    await notificationRef.set({
      title: "New Delivery Company Application",
      message: `${companyName} applied to become a YOMICO delivery company`,
      role: "admin",
      type: "delivery",
      read: false,
      createdAt: Timestamp.now(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("delivery company application notification failed:", error);
    return Response.json({ error: "Could not notify the admin team." }, { status: 500 });
  }
}
