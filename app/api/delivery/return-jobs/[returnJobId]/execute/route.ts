import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import {
  executeReturnTransition,
  ReturnCollectionError,
  RETURN_EXECUTION_ACTIONS,
  RETURN_EXCEPTION_CODES,
  type ReturnExecutionAction,
  type ReturnExceptionCode,
} from "@/lib/deliveryEngine/returnCollection";

// POST /api/delivery/return-jobs/[returnJobId]/execute   { action, exceptionCode?, note? }
//
// The single physical-execution endpoint for a return-collection job — the
// return-engine analogue of POST /api/delivery/scan (one dispatcher route,
// `action` selects the transition, exactly the existing YOMICO convention;
// see scan/route.ts). PERSON-ONLY: only the delivery person a return was
// assigned to may execute it — never an admin, never a company owner, never a
// HUB_PERSON (who can never hold a return assignment at all — assertRiderPerson
// inside the engine). Every field executeReturnTransition needs to decide
// WHO is calling — personId, companyId, providerType — is resolved SERVER-SIDE
// via resolveDeliveryActor; none of it is ever taken from the request body,
// so the mobile client cannot choose its own identity.
//
// `action` is one of the engine's own four actions (RETURN_EXECUTION_ACTIONS —
// imported, never a second hand-typed list): start | collect | receive |
// exception. All FSM legality, custody, multi-parcel availability release and
// the guarded itemRequests advance (PICKUP_ASSIGNED -> PICKED_UP ->
// RECEIVED_BY_YOMICO) already live inside executeReturnTransition itself —
// this route performs no transition logic of its own, only request
// validation and actor resolution, then a single call into the engine inside
// one transaction (same shape as every other execution route in this API).
export async function POST(request: Request, ctx: { params: Promise<{ returnJobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-return-execute", requester.uid, 120, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Only a delivery PERSON may execute a return-collection transition —
    // never a company owner/dispatcher (role "company", rejected here) and
    // never an admin. The exact assignment/company check happens inside
    // executeReturnTransition itself, against the job's own persisted state.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "person")
      return Response.json({ error: "Only the delivery person assigned to this return can act on it." }, { status: 403 });

    const { returnJobId } = await ctx.params;
    let body: { action?: unknown; exceptionCode?: unknown; note?: unknown } = {};
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

    const action = typeof body.action === "string" ? body.action : "";
    if (!(RETURN_EXECUTION_ACTIONS as readonly string[]).includes(action))
      return Response.json({ error: "Invalid action." }, { status: 400 });

    let exceptionCode: ReturnExceptionCode | undefined;
    if (action === "exception") {
      const raw = typeof body.exceptionCode === "string" ? body.exceptionCode : "";
      if (!(RETURN_EXCEPTION_CODES as readonly string[]).includes(raw))
        return Response.json({ error: "Invalid or missing exception reason." }, { status: 400 });
      exceptionCode = raw as ReturnExceptionCode;
    }
    const note = typeof body.note === "string" ? body.note : undefined;

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      executeReturnTransition(tx, db, {
        returnJobId,
        actorUid: actor.uid,
        personId: actor.personId,
        companyId: actor.companyId,
        providerType: actor.providerType,
        action: action as ReturnExecutionAction,
        exceptionCode,
        note,
      })
    );

    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ReturnCollectionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("return-collection execute failed:", error);
    return Response.json({ error: "Could not record this return action." }, { status: 500 });
  }
}
