import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { mintSequential } from "@/lib/humanIds";

// ---------------------------------------------------------------------------
// Emits the "New Vendor Registration" admin notification.
//
// app/vendor-register used to addDoc() this straight from the browser with
// role:"admin", which is one of the reasons firestore.rules had to let any
// signed-in client write admin notifications at all. The applicant is already
// authenticated by this point (createUserWithEmailAndPassword runs first), so
// the write can be verified and performed server-side instead.
//
// The business name is read from the vendor document this route looks up, NOT
// from the request body — otherwise the notification text would still be
// attacker-controlled and nothing would have been gained.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

async function isWithinRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb()
    .collection("rateLimits")
    .doc(`vendor-registered_${uid}`);
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

    if (!requester) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }

    if (!(await isWithinRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many requests." },
        { status: 429 }
      );
    }

    const db = getAdminDb();

    // The application must actually exist. Without this the route would be a
    // way to post any text to the admin feed simply by calling it.
    const vendorSnap = await db
      .collection("vendors")
      .where("uid", "==", requester.uid)
      .limit(1)
      .get();

    if (vendorSnap.empty) {
      return Response.json(
        { error: "No vendor application found." },
        { status: 404 }
      );
    }

    const vendorDoc = vendorSnap.docs[0];
    const vendor = vendorDoc.data();

    const businessName =
      typeof vendor?.businessName === "string" && vendor.businessName.trim()
        ? vendor.businessName.trim().slice(0, 120)
        : "A new vendor";

    // Server finalization: mint the human-readable sellerNumber (SELLER…) onto
    // the vendor document, once. The vendor doc itself is created by the
    // registration form; this authoritative server step assigns its number
    // atomically. Idempotent — a vendor that already has one is left alone, so
    // a retried finalize never mints a second.
    if (!vendor?.sellerNumber) {
      const sellerNumber = await db.runTransaction((tx) =>
        mintSequential(tx, db, "seller")
      );
      await vendorDoc.ref.update({ sellerNumber });
    }

    // Idempotent: one registration notification per vendor application, so a
    // retried or replayed submit cannot flood the admin feed.
    const notificationRef = db
      .collection("notifications")
      .doc(`vendor_registered_${vendorDoc.id}`);

    if ((await notificationRef.get()).exists) {
      return Response.json({ success: true, alreadyNotified: true });
    }

    await notificationRef.set({
      title: "New Vendor Registration",
      message: `${businessName} registered as a vendor`,
      role: "admin",
      type: "vendor",
      read: false,
      createdAt: Timestamp.now(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("vendor-registered notification failed:", error);
    // Never fail the registration itself over a notification.
    return Response.json(
      { error: "Could not notify the admin team." },
      { status: 500 }
    );
  }
}
