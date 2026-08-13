import { getAdminAuth } from "@/lib/firebaseAdmin";
import { ADMIN_EMAIL } from "@/lib/adminConfig";

export type VerifiedUser = {
  uid: string;
  email: string | null;
  isAdmin: boolean;
};

// Verifies the Firebase ID token the client sent (Authorization: Bearer
// <idToken>, from auth.currentUser.getIdToken()) against Firebase itself
// — never trust a uid/role the client claims in the request body. Every
// AI Engine chat route calls this before running any tool.
export async function verifyRequestUser(
  request: Request
): Promise<VerifiedUser | null> {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);

  if (!match) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      isAdmin: decoded.email === ADMIN_EMAIL,
    };
  } catch (error) {
    console.error("AI Engine: ID token verification failed:", error);
    return null;
  }
}
