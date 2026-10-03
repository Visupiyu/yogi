import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_ROLES_COLLECTION, OWNER_ADMIN_EMAIL } from "@/lib/adminConfig";

// SERVER-ONLY. Imports lib/firebaseAdmin — never reachable from the browser.
//
// ---------------------------------------------------------------------------
// ADMIN AUTHORIZATION MODEL
// ---------------------------------------------------------------------------
// A caller is an admin when their Firebase account has a VERIFIED email AND
// either:
//   1. it is the OWNER account (lib/adminConfig OWNER_ADMIN_EMAIL) — the
//      bootstrap admin, independent of any database record, so the owner can
//      never be locked out by a bad or deleted record; or
//   2. adminRoles/{uid} exists with active === true — a role the owner granted
//      through /api/admin/staff.
//
// adminRoles is written ONLY by the Admin SDK (firestore.rules denies every
// client write), so neither a customer, a seller nor a delivery person can
// grant themselves admin by editing Firestore, and no client-supplied role,
// email or uid is ever consulted. users/{uid}.role and the legacy adminUsers
// staff directory are NOT admin grants. firestore.rules' isAdmin() applies the
// identical two-branch test, so server routes and security rules agree.
//
// Custom claims were considered and not used: setting them needs
// firebase-admin/auth, which this codebase deliberately never imports (see
// lib/firebaseAdmin.ts — it crashes on Vercel), and a revoked claim survives in
// already-issued ID tokens for up to an hour. A Firestore record is checked on
// every request and revocation takes effect within ROLE_CACHE_TTL_MS.
// ---------------------------------------------------------------------------

export type AdminRoleRecord = {
  uid: string;
  email: string;
  role: "admin";
  active: boolean;
  grantedByUid: string;
  grantedByEmail: string;
  grantedAt: unknown;
  revokedAt?: unknown;
  revokedByUid?: string;
};

export function isOwnerAdminEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase() === OWNER_ADMIN_EMAIL;
}

// Short per-instance cache so a burst of requests from one admin (or one
// customer, who is checked too) costs one read, not one per request. Bounded
// so a revoked role stops working within this window.
const ROLE_CACHE_TTL_MS = 30_000;
const roleCache = new Map<string, { active: boolean; at: number }>();

/** Test hook — clears the per-instance role cache. */
export function clearAdminRoleCache(): void {
  roleCache.clear();
}

/**
 * Whether adminRoles/{uid} grants an active admin role. FAILS CLOSED: any
 * read error (unconfigured Admin SDK, network, malformed record) is "no".
 */
export async function hasActiveAdminRole(uid: string): Promise<boolean> {
  if (!uid) return false;
  const cached = roleCache.get(uid);
  if (cached && Date.now() - cached.at < ROLE_CACHE_TTL_MS) return cached.active;

  let active = false;
  try {
    const snap = await getAdminDb().collection(ADMIN_ROLES_COLLECTION).doc(uid).get();
    active = snap.exists && snap.get("active") === true && snap.get("role") === "admin";
  } catch {
    active = false;
  }
  roleCache.set(uid, { active, at: Date.now() });
  return active;
}

/**
 * The single admin decision for a verified Firebase identity. `emailVerified`
 * is required on both branches, matching firestore.rules' isAdmin().
 */
export async function resolveIsAdmin(identity: {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}): Promise<boolean> {
  if (!identity.emailVerified) return false;
  if (isOwnerAdminEmail(identity.email)) return true;
  return hasActiveAdminRole(identity.uid);
}
