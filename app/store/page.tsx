import Link from "next/link";
import { getAdminDb } from "@/lib/firebaseAdmin";

// Stores directory. Rendered on the SERVER so each public store profile
// (vendors_public) can be checked against the seller's private vendor record
// (vendors, which the browser cannot read). A store is listed only while a
// vendors record for that uid exists and is admin-Approved: a public profile
// can outlive its seller account, and a stale profile must not be shown as a
// live store. Nothing is written — a stale profile is simply left out.
//
// Only the business identity is shown publicly: the owner's personal name
// (vendors_public.fullName) is deliberately not read into the card.
// Rendered per request (force-dynamic) so the directory never serves a
// build-time snapshot.
export const dynamic = "force-dynamic";

type StoreCard = {
  id: string;
  uid: string;
  businessName: string;
  location: string;
  storeLogo: string;
  rating: number | null;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function loadStores(): Promise<StoreCard[] | null> {
  try {
    const db = getAdminDb();
    const [profiles, vendors] = await Promise.all([
      db.collection("vendors_public").get(),
      db.collection("vendors").get(),
    ]);
    const approvedVendorUids = new Set(
      vendors.docs
        .filter((d) => d.get("status") === "Approved")
        .map((d) => text(d.get("uid")))
        .filter(Boolean)
    );
    return profiles.docs
      .filter((d) => d.get("status") === "Approved")
      .map((d) => ({ d, uid: text(d.get("uid")) || d.id }))
      .filter(({ uid }) => approvedVendorUids.has(uid))
      .map(({ d, uid }) => {
        const x = d.data();
        return {
          id: d.id,
          uid,
          businessName: text(x.businessName) || "YOMICO Store",
          location: [text(x.city), text(x.state)].filter(Boolean).join(", "),
          storeLogo: text(x.storeLogo),
          rating: typeof x.rating === "number" && x.rating > 0 ? x.rating : null,
        };
      });
  } catch (error) {
    console.error("stores directory failed to load:", error);
    return null;
  }
}

export default async function StoresPage() {
  const stores = await loadStores();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-5xl font-bold text-center mb-4">All Stores</h1>

        <p className="text-center text-gray-600 mb-12">
          Explore stores and discover products from YOMICO sellers.
        </p>

        {stores === null ? (
          <p className="text-center text-gray-500">Unable to load stores right now. Please try again later.</p>
        ) : (
          <>
            <p className="text-center text-green-600 font-semibold mb-10">
              {stores.length} Stores Available
            </p>

            {stores.length === 0 && (
              <p className="text-center text-gray-500">No stores found.</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {stores.map((store) => (
                <div
                  key={store.id}
                  className="bg-white p-8 rounded-2xl shadow hover:shadow-xl transition"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <img
                      src={store.storeLogo || "/user.png"}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover border"
                    />

                    <div className="min-w-0">
                      <h2 className="text-2xl font-bold break-words">{store.businessName}</h2>
                      <p className="text-sm text-gray-500">Verified Seller</p>
                    </div>
                  </div>

                  {store.location && (
                    <p className="text-gray-600 mb-6">{store.location}</p>
                  )}

                  <div className="mb-4">
                    <span className="inline-block bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold mr-2">
                      Verified Store
                    </span>

                    <span className="inline-block bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-semibold">
                      ⭐ {store.rating ?? "New"}
                    </span>
                  </div>

                  <div>
                    <Link
                      href={`/store/${store.uid}`}
                      className="inline-block bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white px-5 py-3 rounded-xl font-semibold"
                    >
                      Visit Store
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
