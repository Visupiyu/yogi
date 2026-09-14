import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// POST /api/delivery/applications/registered
//
// Emits the "New Freelancer Application" admin notification after a freelancer
// submits a Phase-1 delivery-partner application. Same pattern as
// app/api/vendor-registered: the applicant is already authenticated (they
// self-created their Auth account and wrote deliveryApplications/{uid} first),
// so the admin-role notification is written SERVER-SIDE here rather than from
// the browser. The applicant's display name is read from the STORED application
// document (never the request body) so the notification text is not
// attacker-controlled. NO Aadhaar, bank details, document paths/URLs, or other
// sensitive fields are read into or sent in the notification.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

async function isWithinRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`delivery-application_${uid}`);
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

    // The application must actually exist and belong to the caller (doc id is
    // the applicant uid). Without this the route could post arbitrary text to
    // the admin feed.
    const appRef = db.collection("deliveryApplications").doc(requester.uid);
    const appSnap = await appRef.get();
    if (!appSnap.exists) {
      return Response.json({ error: "No freelancer application found." }, { status: 404 });
    }
    const application = appSnap.data() as { fullName?: unknown };
    const fullName =
      typeof application?.fullName === "string" && application.fullName.trim()
        ? application.fullName.trim().slice(0, 120)
        : "A new applicant";

    // Idempotent: one notification per application, so a retried/replayed
    // submit cannot flood the admin feed.
    const notificationRef = db
      .collection("notifications")
      .doc(`delivery_application_${requester.uid}`);
    if ((await notificationRef.get()).exists) {
      return Response.json({ success: true, alreadyNotified: true });
    }

    await notificationRef.set({
      title: "New Freelancer Application",
      message: `${fullName} applied as a YOMICO delivery freelancer`,
      role: "admin",
      type: "delivery",
      read: false,
      createdAt: Timestamp.now(),
    });

    return Response.json({ success: true });
  } catch (error) {
    // Never fail the application itself over a notification.
    console.error("delivery application notification failed:", error);
    return Response.json({ error: "Could not notify the admin team." }, { status: 500 });
  }
}
