import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";
import { ADMIN_ROLES_COLLECTION, OWNER_ADMIN_EMAIL } from "@/lib/adminConfig";
import { clearAdminRoleCache, isOwnerAdminEmail } from "@/lib/adminAccess";
import { lookupAuthAccountByEmail } from "@/lib/authUserLookup";
import { Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// /api/admin/staff — the AUTHORITATIVE admin access list (see lib/adminAccess).
//
//   GET                                  any admin: owner + granted roles
//   POST { action:"grant",  email }      OWNER only: grant admin to an account
//   POST { action:"revoke", uid }        OWNER only: revoke a granted role
//
// Grant/revoke are owner-only so an admin cannot mint further admins. The
// target is resolved from Firebase Auth by email server-side — the role is
// keyed on that account's real uid, never on a client-supplied uid. Accounts
// that are sellers or delivery actors are refused, keeping those roles
// separate from platform administration. Every change writes audit_logs in
// the same transaction as the role record.
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });

    const snap = await getAdminDb().collection(ADMIN_ROLES_COLLECTION).get();
    const admins = snap.docs
      .map((d) => {
        const r = d.data();
        return {
          uid: d.id,
          email: str(r.email),
          active: r.active === true && r.role === "admin",
          grantedByEmail: str(r.grantedByEmail),
          grantedAt: iso(r.grantedAt),
          revokedAt: iso(r.revokedAt),
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.email.localeCompare(b.email));

    return Response.json({
      owner: { email: OWNER_ADMIN_EMAIL },
      admins,
      viewerIsOwner: isOwnerAdminEmail(requester.email),
    });
  } catch (error) {
    console.error("admin/staff GET failed:", error);
    return Response.json({ error: "Couldn't load admin access." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin || !isOwnerAdminEmail(requester.email)) {
      return Response.json({ error: "Only the owner account can change admin access." }, { status: 403 });
    }
    if (!(await isWithinRateLimit("admin-staff", requester.uid, 30, 10 * 60 * 1000))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const body = (await request.json().catch(() => null)) as { action?: unknown; email?: unknown; uid?: unknown } | null;
    const action = str(body?.action);
    const db = getAdminDb();
    const now = Timestamp.now();

    if (action === "grant") {
      const email = str(body?.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 200) {
        return Response.json({ error: "Enter a valid email address." }, { status: 400 });
      }
      if (isOwnerAdminEmail(email)) {
        return Response.json({ error: "The owner account is always an admin." }, { status: 409 });
      }

      const account = await lookupAuthAccountByEmail(email);
      // One message for "no account" and "not usable" — this is owner-only, but
      // there is still no reason to describe other people's accounts.
      if (!account || account.disabled) {
        return Response.json(
          { error: "No active YOMICO account uses that email. Ask them to sign up first." },
          { status: 404 }
        );
      }
      if (!account.emailVerified) {
        return Response.json(
          { error: "That account hasn't verified its email yet. Admin access requires a verified email." },
          { status: 409 }
        );
      }

      const [vendorSnap, personSnap, companySnap] = await Promise.all([
        db.collection("vendors").where("uid", "==", account.uid).limit(1).get(),
        db.collection("deliveryPersons").where("uid", "==", account.uid).limit(1).get(),
        db.collection("deliveryCompanies").where("ownerUid", "==", account.uid).limit(1).get(),
      ]);
      if (!vendorSnap.empty || !personSnap.empty || !companySnap.empty) {
        return Response.json(
          { error: "That account is a seller or delivery account. Use a separate account for admin access." },
          { status: 409 }
        );
      }

      const roleRef = db.collection(ADMIN_ROLES_COLLECTION).doc(account.uid);
      await db.runTransaction(async (tx) => {
        tx.set(roleRef, {
          uid: account.uid,
          email: account.email,
          role: "admin",
          active: true,
          grantedByUid: requester.uid,
          grantedByEmail: requester.email || "",
          grantedAt: now,
          revokedAt: null,
          revokedByUid: null,
        });
        tx.set(db.collection("audit_logs").doc(), {
          actorUid: requester.uid,
          actorEmail: requester.email || "",
          action: "admin_role_granted",
          targetId: account.uid,
          details: { email: account.email },
          createdAt: now,
        });
      });
      clearAdminRoleCache();
      return Response.json({ success: true, uid: account.uid, email: account.email });
    }

    if (action === "revoke") {
      const uid = body?.uid;
      if (!isValidDocId(uid)) return Response.json({ error: "Admin not found." }, { status: 404 });
      if (uid === requester.uid) {
        return Response.json({ error: "The owner account cannot be revoked." }, { status: 409 });
      }
      const roleRef = db.collection(ADMIN_ROLES_COLLECTION).doc(uid);
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(roleRef);
        if (!snap.exists) return "missing" as const;
        if (snap.get("active") !== true) return "already" as const;
        tx.update(roleRef, { active: false, revokedAt: now, revokedByUid: requester.uid });
        tx.set(db.collection("audit_logs").doc(), {
          actorUid: requester.uid,
          actorEmail: requester.email || "",
          action: "admin_role_revoked",
          targetId: uid,
          details: { email: str(snap.get("email")) },
          createdAt: now,
        });
        return "revoked" as const;
      });
      clearAdminRoleCache();
      if (outcome === "missing") return Response.json({ error: "Admin not found." }, { status: 404 });
      return Response.json({ success: true, alreadyRevoked: outcome === "already" });
    }

    return Response.json({ error: "action must be grant or revoke." }, { status: 400 });
  } catch (error) {
    console.error("admin/staff POST failed:", error);
    return Response.json({ error: "Couldn't update admin access. Nothing was changed." }, { status: 500 });
  }
}
