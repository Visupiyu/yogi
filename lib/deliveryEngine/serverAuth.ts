// SERVER-ONLY. Resolves a TOKEN-verified Firebase user (a valid ID token, per
// verifyRequestUser) into their Delivery Engine role by looking the identity up
// in Firestore via the Admin SDK.
//
// "Token-verified" means the caller holds a valid Firebase ID token — it does
// NOT mean email_verified. Delivery persons are DELIBERATELY not gated on
// email verification: both existing live delivery-person accounts are active
// but unverified, and gating them here would lock them out. Only isAdmin (in
// lib/serverAuth) requires email_verified; that is unchanged.
//
// Deliberately does NOT use custom claims / firebase-admin/auth: that pulls the
// ESM-only jose chain that crashes on Vercel (see lib/serverAuth.ts). Ownership
// is enforced by reading the authoritative Firestore docs each call — the same
// approach firestore.rules' isAssignedDeliveryPartner() already relies on, but
// centralised here so every delivery route enforces it identically.
//
// A user is a COMPANY if an Active deliveryCompanies doc has ownerUid == uid.
// A user is a PERSON if an Active deliveryPersons doc has uid == uid AND its
// company is Active. Company identity takes precedence if somehow both match.
// Neither branch checks email_verified — a valid token + Active person + Active
// company is sufficient for a delivery person.
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { DeliveryActor, DeliveryCompany, DeliveryPerson } from "@/lib/deliveryEngine/types";

export async function resolveDeliveryActor(
  uid: string,
  email: string | null
): Promise<DeliveryActor> {
  const db = getAdminDb();

  // ---- Company admin? ----
  const compSnap = await db
    .collection("deliveryCompanies")
    .where("ownerUid", "==", uid)
    .limit(1)
    .get();
  if (!compSnap.empty) {
    const doc = compSnap.docs[0];
    const company = { id: doc.id, ...(doc.data() as DeliveryCompany) };
    if (company.status === "Active") {
      return { role: "company", uid, companyId: doc.id, company };
    }
    // Company exists but not Active -> treat as no delivery role (fail closed).
    return { role: "none", uid };
  }

  // ---- Delivery person? (by uid; email is a fallback for legacy docs) ----
  let personDoc = null as FirebaseFirestore.QueryDocumentSnapshot | null;
  const byUid = await db.collection("deliveryPersons").where("uid", "==", uid).limit(1).get();
  if (!byUid.empty) {
    personDoc = byUid.docs[0];
  } else if (email) {
    const byEmail = await db.collection("deliveryPersons").where("email", "==", email).limit(1).get();
    // Only accept the email match if that doc's uid actually equals the caller.
    if (!byEmail.empty && (byEmail.docs[0].data() as DeliveryPerson).uid === uid) {
      personDoc = byEmail.docs[0];
    }
  }

  if (personDoc) {
    const person = { id: personDoc.id, ...(personDoc.data() as DeliveryPerson) };
    if (person.status !== "Active" || !person.companyId) {
      return { role: "none", uid };
    }
    // The owning company must itself be Active.
    const compRef = await db.collection("deliveryCompanies").doc(person.companyId).get();
    const comp = compRef.exists ? (compRef.data() as DeliveryCompany) : null;
    if (!comp || comp.status !== "Active") {
      return { role: "none", uid };
    }
    // Accepted with a valid token + Active person + Active company.
    // email_verified is intentionally NOT required for delivery persons.
    return { role: "person", uid, companyId: person.companyId, personId: personDoc.id, person };
  }

  return { role: "none", uid };
}
