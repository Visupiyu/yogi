import { verifyRequestUser } from "@/lib/serverAuth";
import { isOwnerAdminEmail } from "@/lib/adminAccess";

// GET /api/admin/whoami — the admin UI gate (app/admin/layout.tsx,
// app/admin-login). Answers from the SAME server-side decision every admin API
// uses (lib/adminAccess via verifyRequestUser), so the panel opens for exactly
// the accounts the server and firestore.rules treat as admin. Returns only
// booleans about the caller themselves.
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ isAdmin: false, isOwner: false }, { status: 401 });
  return Response.json({
    isAdmin: requester.isAdmin,
    isOwner: requester.isAdmin && isOwnerAdminEmail(requester.email),
    emailVerified: requester.emailVerified,
  });
}
