// ---------------------------------------------------------------------------
// RETIRED: POST /api/request-return (legacy whole-order returns).
//
// Returns are requested per item through app/api/item-request (the /returns
// page and the Customer App), where YOMICO proposes the pickup slot and the
// customer confirms it or asks for another. This older route had no page left
// calling it, but still created a whole-order return beside any item-level
// ones — two refund paths for the same goods. It now refuses every call.
//
// Existing legacy `returns` documents are untouched and still readable by
// their owner and manageable by admin.
// ---------------------------------------------------------------------------

export async function POST() {
  return Response.json(
    { error: "Whole-order returns are no longer available. Request a return for the item from your order instead." },
    { status: 410 }
  );
}
