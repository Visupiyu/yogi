// ---------------------------------------------------------------------------
// Delivery Engine Phase 1 — migration of the 2 existing live deliveryPartners
// into the new deliveryPersons collection.
//
// SAFETY: DRY-RUN BY DEFAULT. It performs NO writes unless invoked with
// `--apply`, and even then only ADDITIVELY (it creates deliveryPersons docs and
// never modifies or deletes deliveryPartners, deliveryCompanies, orders, or any
// Auth account). Existing document IDs and Auth UIDs are preserved:
//   - deliveryPersons doc id  === the source deliveryPartners doc id
//     (so orders.deliveryPartnerId references stay valid)
//   - person.uid              === the source partner.uid (login unchanged)
//   - person.companyId        === the source partner.companyId (already set)
//
// It also REPORTS (never fixes) any company missing an ownerUid, since those
// cannot be logged into yet — a separate, explicitly-approved step.
//
// Run:  npx tsx scripts/migrate-delivery-persons.ts           (dry run)
//       npx tsx scripts/migrate-delivery-persons.ts --apply   (after approval)
// ---------------------------------------------------------------------------
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getAdminDb();

  const partners = await db.collection("deliveryPartners").get();
  const persons = await db.collection("deliveryPersons").get();
  const existingPersonIds = new Set(persons.docs.map((d) => d.id));

  console.log(`Mode: ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`deliveryPartners: ${partners.size} | existing deliveryPersons: ${persons.size}\n`);

  const plan: { id: string; action: string; doc?: Record<string, unknown> }[] = [];

  for (const d of partners.docs) {
    const p = d.data() as Record<string, unknown>;
    if (existingPersonIds.has(d.id)) {
      plan.push({ id: d.id, action: "SKIP (deliveryPersons doc already exists)" });
      continue;
    }
    if (typeof p.uid !== "string" || !p.uid) {
      plan.push({ id: d.id, action: "SKIP (no uid — cannot map a login)" });
      continue;
    }
    if (typeof p.companyId !== "string" || !p.companyId) {
      plan.push({ id: d.id, action: "SKIP (no companyId — needs a company first)" });
      continue;
    }
    const now = Timestamp.now();
    const doc = {
      companyId: p.companyId,
      uid: p.uid,
      name: p.name ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      vehicleType: p.vehicleType ?? "",
      vehicleNumber: p.vehicleNumber ?? "",
      serviceArea: p.serviceArea ?? "",
      status: p.status === "Inactive" ? "Inactive" : "Active",
      createdBy: "admin-migrated",
      createdAt: now,
      updatedAt: now,
    };
    plan.push({ id: d.id, action: "CREATE deliveryPersons (same id)", doc });
  }

  for (const item of plan) {
    console.log(`- ${item.id}: ${item.action}`);
    if (item.doc) console.log(`    ${JSON.stringify(item.doc)}`);
  }

  // Report companies with no ownerUid (cannot log in yet).
  const companies = await db.collection("deliveryCompanies").get();
  console.log(`\nCompanies (${companies.size}) ownerUid check:`);
  companies.forEach((c) => {
    const owner = (c.data() as { ownerUid?: unknown }).ownerUid;
    console.log(`  - ${c.id} (${(c.data() as { name?: string }).name}): ownerUid=${owner ? owner : "MISSING (no login until provisioned)"}`);
  });

  if (!apply) {
    console.log("\nDRY RUN complete — no writes performed. Re-run with --apply after approval.");
    return;
  }

  let created = 0;
  for (const item of plan) {
    if (item.doc) {
      await db.collection("deliveryPersons").doc(item.id).set(item.doc);
      created++;
    }
  }
  console.log(`\nAPPLIED — created ${created} deliveryPersons doc(s). No other collection touched.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
