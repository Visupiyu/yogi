import { firebaseConfig } from "@/lib/firebase";
import { ADMIN_EMAIL } from "@/lib/adminConfig";

export type VerifiedUser = {
  uid: string;
  email: string | null;
  isAdmin: boolean;
  // Google's lookup response already carries this; surfacing it lets the
  // verification-email route skip re-sending to an already-verified address
  // without a second round trip. Additive — existing callers ignore it.
  emailVerified: boolean;
};

// Verifies the Firebase ID token the client sent (Authorization: Bearer
// <idToken>, from auth.currentUser.getIdToken()) via Google's own
// Identity Toolkit REST API — Google validates the token's signature
// server-side and returns the account it belongs to, or rejects it.
// Never trust a uid/role the client claims in the request body.
//
// Shared by every server route that needs to know who's really calling
// (AI Engine chat routes, checkout/payment routes) — do not re-implement
// this per route.
//
// Deliberately NOT using firebase-admin/auth's verifyIdToken(): it pulls
// in jwks-rsa -> jose v6 (ESM-only, no CJS build), which crashes on
// Vercel with ERR_REQUIRE_ESM (Vercel's runtime hard-disables
// require(ESM) regardless of Node version — confirmed in production).
// This REST call uses the same public Firebase Web API key already
// shipped to the browser — not a secret, safe to use server-side too.
export async function verifyRequestUser(
  request: Request
): Promise<VerifiedUser | null> {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);

  if (!match) return null;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: match[1] }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const user = data?.users?.[0];

    if (!user?.localId) {
      return null;
    }

    return {
      uid: user.localId,
      email: user.email ?? null,
      // Admin authorization must match firestore.rules' isAdmin(), which
      // requires BOTH the admin email AND a verified email — otherwise the
      // client and server disagree (a write route would admit an admin whose
      // token the security rules reject on every read).
      isAdmin: user.email === ADMIN_EMAIL && user.emailVerified === true,
      emailVerified: user.emailVerified === true,
    };
  } catch (error) {
    console.error("verifyRequestUser: ID token verification failed:", error);
    return null;
  }
}
