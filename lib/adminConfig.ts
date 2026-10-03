// The OWNER admin account — the bootstrap administrator that can never be
// locked out, because it does not depend on any Firestore record. Mirrored in
// firestore.rules' and storage.rules' isAdmin().
//
// Additional administrators are granted by the owner through /admin/users
// (app/api/admin/staff), which writes server-only adminRoles/{uid} records;
// see lib/adminAccess.ts for the full authorization model. This constant is a
// public identifier, not a secret, and is no longer the only path to admin.
// Safe to import from client code (no server dependencies).
export const ADMIN_EMAIL = "adminyogimart@gmail.com";

/** Alias that names the role this email actually holds. */
export const OWNER_ADMIN_EMAIL = ADMIN_EMAIL;

/** Firestore collection holding granted (non-owner) admin roles, keyed by uid. */
export const ADMIN_ROLES_COLLECTION = "adminRoles";
