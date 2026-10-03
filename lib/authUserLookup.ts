import { getAdminApp, getAdminProjectId } from "@/lib/firebaseAdmin";

// SERVER-ONLY. Looks a Firebase Auth account up BY EMAIL with the service
// account's own credentials (Identity Toolkit REST, project-scoped) — the same
// mechanism app/api/auth/send-verification-email uses, and for the same reason:
// firebase-admin/auth is never imported in this codebase (see
// lib/firebaseAdmin.ts). Used by the owner-only admin grant flow so the role is
// keyed on the account's real uid, never on an email the caller typed.
//
// Under the local Auth emulator (FIREBASE_AUTH_EMULATOR_HOST, never set in a
// deployment) the emulator's endpoint is used with its fixed "owner" token.

export type AuthAccount = {
  uid: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
};

export async function lookupAuthAccountByEmail(email: string): Promise<AuthAccount | null> {
  const projectId = getAdminProjectId();
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

  let base: string;
  let bearer: string;
  if (emulatorHost) {
    base = `http://${emulatorHost}/identitytoolkit.googleapis.com`;
    bearer = "owner";
  } else {
    base = "https://identitytoolkit.googleapis.com";
    const credential = getAdminApp().options.credential;
    if (!credential) throw new Error("Admin credential unavailable.");
    const token = await credential.getAccessToken();
    if (!token?.access_token) throw new Error("Admin access token unavailable.");
    bearer = token.access_token;
  }

  const response = await fetch(`${base}/v1/projects/${projectId}/accounts:lookup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: [email] }),
  });
  if (!response.ok) throw new Error(`Account lookup failed (HTTP ${response.status}).`);

  const data = (await response.json()) as {
    users?: { localId?: string; email?: string; emailVerified?: boolean; disabled?: boolean }[];
  };
  const user = data.users?.[0];
  if (!user?.localId || typeof user.email !== "string") return null;
  return {
    uid: user.localId,
    email: user.email.toLowerCase(),
    emailVerified: user.emailVerified === true,
    disabled: user.disabled === true,
  };
}
