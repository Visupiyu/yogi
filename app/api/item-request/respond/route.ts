import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { isAwaitingCustomerPickup } from "@/lib/itemRequests";

// ---------------------------------------------------------------------------
// Customer response to a PROPOSED pickup slot. SERVER-AUTHORITATIVE.
//
// This is the ONLY customer-driven mutation of an itemRequests document.
// firestore.rules still denies every client write (create/update/delete:false);
// the customer never writes the doc — they call this Admin-SDK route, which
// verifies their ID token and confirms they OWN the request before writing.
//
// A return's pickup is a negotiation: admin proposes a slot (PICKUP_PROPOSED),
// and the customer either ACCEPTS it (-> PICKUP_CONFIRMED, the appointment is
// set) or COUNTERS with a different time (stays PICKUP_PROPOSED; admin then
// re-proposes via the transition route). Counters are capped so the loop is
// bounded. Nothing about refunds, stock, or any later stage is touched here.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// How many times a customer may counter before they must accept (or admin
// proceeds). Bounds the negotiation so it can't ping-pong forever.
const MAX_COUNTERS = 2;

type RespondOutcome =
  | { kind: "ok"; action: "accept" | "counter"; toStatus: string }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "item-request-respond",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { requestId?: unknown; action?: unknown; counterAt?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const requestId =
      typeof body.requestId === "string" ? body.requestId.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (!requestId) {
      return Response.json({ error: "Missing request id." }, { status: 400 });
    }
    if (action !== "accept" && action !== "counter") {
      return Response.json(
        { error: "Choose to accept or propose a different time." },
        { status: 400 }
      );
    }

    // A counter must carry a valid alternative date/time. Parsed before the
    // transaction (cheap 400); an ISO string or epoch millis.
    let counterAt: Date | null = null;
    if (action === "counter") {
      const raw = body.counterAt;
      const parsed =
        typeof raw === "string" || typeof raw === "number"
          ? new Date(raw)
          : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return Response.json(
          { error: "Please choose a valid pickup date and time." },
          { status: 400 }
        );
      }
      counterAt = parsed;
    }

    const db = getAdminDb();
    const reqRef = db.collection("itemRequests").doc(requestId);

    const outcome = await db.runTransaction<RespondOutcome>(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) {
        return { kind: "error", status: 404, error: "Request not found." };
      }

      const req = snap.data() as {
        type?: string;
        status?: string;
        userId?: string;
        pickup?: {
          proposedAt?: Timestamp;
          customerResponse?: string;
          counterCount?: number;
        };
        history?: unknown[];
      };

      // ---- WHO: only the owning customer may respond ----
      if (req.userId !== requester.uid) {
        // Same wording as not-found — no information leak about others' requests.
        return { kind: "error", status: 404, error: "Request not found." };
      }

      // ---- WHAT: only while a slot is awaiting the customer ----
      if (req.type !== "return") {
        return {
          kind: "error",
          status: 409,
          error: "Only returns have a pickup to confirm.",
        };
      }
      const from = req.status || "REQUESTED";
      if (!isAwaitingCustomerPickup(from)) {
        return {
          kind: "error",
          status: 409,
          error: "There's no pickup slot awaiting your confirmation right now.",
        };
      }

      const now = Timestamp.now();
      const history = Array.isArray(req.history) ? req.history : [];

      if (action === "accept") {
        const update: Record<string, unknown> = {
          status: "PICKUP_CONFIRMED",
          updatedAt: now,
          history: [
            ...history,
            { status: "PICKUP_CONFIRMED", at: now, by: "customer" },
          ],
          pickup: {
            ...(req.pickup || {}),
            customerResponse: "accepted",
            respondedAt: now,
            confirmedAt: now,
            // The agreed appointment is the slot admin proposed.
            ...(req.pickup?.proposedAt
              ? { scheduledAt: req.pickup.proposedAt }
              : {}),
            scheduledBy: "customer",
          },
        };
        tx.update(reqRef, update);
        return { kind: "ok", action: "accept", toStatus: "PICKUP_CONFIRMED" };
      }

      // action === "counter"
      const priorCounters = Number(req.pickup?.counterCount) || 0;
      if (priorCounters >= MAX_COUNTERS) {
        return {
          kind: "error",
          status: 409,
          error:
            "You've reached the limit for proposing new times. Please accept the offered slot or contact support.",
        };
      }

      // Status stays PICKUP_PROPOSED; admin will re-propose in response.
      tx.update(reqRef, {
        updatedAt: now,
        history: [
          ...history,
          { status: from, at: now, by: "customer", note: "countered pickup" },
        ],
        pickup: {
          ...(req.pickup || {}),
          customerResponse: "countered",
          counterAt: Timestamp.fromDate(counterAt as Date),
          counterCount: priorCounters + 1,
          respondedAt: now,
        },
      });
      return { kind: "ok", action: "counter", toStatus: from };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    // Best-effort: let admin know the customer responded, so they can confirm
    // dispatch or re-propose. role:"admin" notifications carry no userId.
    try {
      await db.collection("notifications").add({
        title: "Pickup response",
        message:
          outcome.action === "accept"
            ? "A customer accepted the proposed pickup slot."
            : "A customer proposed a different pickup time.",
        role: "admin",
        type: "refund",
        read: false,
        createdAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("item-request respond: admin notify failed:", error);
    }

    return Response.json({ success: true, status: outcome.toStatus });
  } catch (error) {
    console.error("item-request respond: unexpected failure:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
