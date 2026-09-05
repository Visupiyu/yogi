// SERVER-ONLY. Resolves a TOKEN-verified Firebase user (a valid ID token, per
// verifyRequestUser) into their Delivery Engine role by looking the identity up
// in Firestore via the Admin SDK.
//
// "Token-verified" means the caller holds a valid Firebase ID token — it does
// NOT mean email_verified. Delivery persons are DELIBERATELY not gated on email
// verification: existing live delivery accounts are active but unverified, and
// gating them here would lock them out. Only isAdmin (in lib/serverAuth)
// requires email_verified; that is unchanged.
//
// Deliberately does NOT use custom claims / firebase-admin/auth (ESM/Vercel
// crash — see lib/serverAuth.ts). Ownership is enforced by reading the
// authoritative Firestore docs each call, centralised here.
//
// Roles:
//   COMPANY admin -> an Active deliveryCompanies doc has ownerUid == uid.
//   PERSON        -> a deliveryPersons doc has uid == uid, is Active, AND:
//                      providerType "COMPANY" -> its company must be Active;
//                      providerType "YOMICO"  -> no company (companyId null),
//                                                no company check.
// Company identity takes precedence if somehow both match. Neither branch
// checks email_verified.
import { getAdminDb } from "@/lib/firebaseAdmin";
import type {
  DeliveryActor,
  DeliveryCompany,
  DeliveryPerson,
  DeliveryProviderType,
} from "@/lib/deliveryEngine/types";

// Reads accountStatus, falling back to the deprecated `status` alias during the
// one-phase transition. Active only.
function isActiveAccount(p: DeliveryPerson): boolean {
  if (p.accountStatus) return p.accountStatus === "Active";
  return p.status === "Active";
}

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
    return { role: "none", uid }; // company exists but not Active -> fail closed
  }

  // ---- Delivery person? (by uid; email is a fallback for legacy docs) ----
  let personDoc = null as FirebaseFirestore.QueryDocumentSnapshot | null;
  const byUid = await db.collection("deliveryPersons").where("uid", "==", uid).limit(1).get();
  if (!byUid.empty) {
    personDoc = byUid.docs[0];
  } else if (email) {
    const byEmail = await db.collection("deliveryPersons").where("email", "==", email).limit(1).get();
    if (!byEmail.empty && (byEmail.docs[0].data() as DeliveryPerson).uid === uid) {
      personDoc = byEmail.docs[0];
    }
  }

  if (personDoc) {
    const person = { id: personDoc.id, ...(personDoc.data() as DeliveryPerson) };
    if (!isActiveAccount(person)) {
      return { role: "none", uid };
    }
    // providerType defaults to COMPANY for legacy/migrated docs written before
    // this field existed (they always carry a companyId).
    const providerType: DeliveryProviderType =
      person.providerType === "YOMICO" ? "YOMICO" : "COMPANY";

    if (providerType === "COMPANY") {
      if (!person.companyId) return { role: "none", uid }; // COMPANY needs a company
      const compRef = await db.collection("deliveryCompanies").doc(person.companyId).get();
      const comp = compRef.exists ? (compRef.data() as DeliveryCompany) : null;
      if (!comp || comp.status !== "Active") return { role: "none", uid };
      // Accepted: valid token + Active COMPANY person + Active company.
      return {
        role: "person",
        uid,
        providerType,
        companyId: person.companyId,
        personId: personDoc.id,
        person,
      };
    }

    // YOMICO person: no company; a YOMICO person must NOT carry a companyId.
    if (person.companyId) return { role: "none", uid }; // mixed provider -> fail closed
    // Accepted: valid token + Active YOMICO person. email_verified not required.
    return {
      role: "person",
      uid,
      providerType,
      companyId: null,
      personId: personDoc.id,
      person,
    };
  }

  return { role: "none", uid };
}
