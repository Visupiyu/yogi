"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
type Delivery = {
  id: string;
  customerName: string;
  phone?: string;
  address?: string;
  courierPartner?: string;
  trackingNumber?: string;
  expectedDelivery?: string;
  status: string;
  createdAt?: any;
};
export default function DeliveryDashboardPage() {

  const router = useRouter();
  const [partnerId, setPartnerId] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [deliveries, setDeliveries] =useState<Delivery[]>([]);
  const [loading, setLoading] =    useState(true);
  const [search, setSearch] =    useState("");
    const [statusFilter, setStatusFilter] =  useState("All");
    const totalDeliveries =  deliveries.length;
const pendingDeliveries =  deliveries.filter(
    (d:any)=>
      d.status === "Pending"
  ).length;

const outForDelivery =
  deliveries.filter(
    (d:any)=>
      d.status ===
      "Out For Delivery"
  ).length;

const deliveredDeliveries =
  deliveries.filter(
    (d:any)=>
      d.status ===
      "Delivered"
  ).length;

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const sessionRaw = localStorage.getItem("deliveryPartner");

      if (!user || !sessionRaw) {
        router.replace("/delivery-login");
        return;
      }

      const session = JSON.parse(sessionRaw);

      if (session.uid !== user.uid) {
        router.replace("/delivery-login");
        return;
      }

      setPartnerId(session.partnerId);
      setPartnerName(session.name || "");
      loadDeliveries(session.partnerId);
    });

    return () => unsubscribe();

  }, [router]);

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("deliveryPartner");
    router.replace("/delivery-login");
  };

  const loadDeliveries = async (forPartnerId?: string) => {

    const activePartnerId = forPartnerId || partnerId;

    if (!activePartnerId) return;

    try {

      const snapshot = await getDocs(

        query(
          collection(db, "orders"),
          // deliveryPartnerId stores the deliveryPartners collection's
          // document id (set by app/admin/delivery), not this partner's
          // Auth uid — filtering on user.uid here silently never matched
          // any order, so no delivery partner could ever see their queue.
          where("deliveryPartnerId", "==", activePartnerId),
          orderBy("createdAt", "desc")
        )
      );

      const items: Delivery[] = [];

      snapshot.forEach((docSnap) => {

        const data: any = docSnap.data();

        items.push({

          id: docSnap.id,

          customerName:
            data.customerName || "Customer",

          phone:
            data.phone || "",

          address:
            data.address || "",

          courierPartner:
            data.courierPartner || "",

          trackingNumber:
            data.trackingNumber || "-",

          expectedDelivery:
            data.expectedDelivery || "-",

          status:
            data.status || "Pending",

          createdAt:
            data.createdAt,

        });

      });

      setDeliveries(items);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  };

 const filtered = deliveries.filter((item) => {

  const matchesSearch =

    item.customerName
      .toLowerCase()
      .includes(search.toLowerCase())

    ||

    item.id
      .toLowerCase()
      .includes(search.toLowerCase());

  const matchesStatus =

    statusFilter === "All"

    ||

    item.status === statusFilter;

  return matchesSearch && matchesStatus;

});

  return (

    <div className="min-h-screen bg-gray-100 p-6">

      <div className="max-w-7xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">

          <h1 className="text-4xl font-bold">

            🚚 Delivery Dashboard

          </h1>

          <p className="mt-2 opacity-90">

            {partnerName ? `Welcome, ${partnerName}` : "Assigned deliveries"}

          </p>
          <div className="mt-5 flex gap-3">

  <button

    onClick={() => loadDeliveries()}

    className="
      bg-white
      text-blue-700
      px-5
      py-2
      rounded-xl
      font-semibold
      hover:bg-gray-100
    "

  >

    🔄 Refresh Deliveries

  </button>

  <button
    onClick={logout}
    className="bg-white/20 text-white px-5 py-2 rounded-xl font-semibold hover:bg-white/30"
  >
    Logout
  </button>

</div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">

              Assigned

            </p>

            <h2 className="text-3xl font-bold">

              {totalDeliveries}

            </h2>

          </div>

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">

              Pending

            </p>

            <h2 className="text-3xl font-bold text-yellow-600">

              {pendingDeliveries}

              </h2>

          </div>

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">

              Out For Delivery

            </p>

           <h2 className="text-3xl font-bold text-blue-600">
  {outForDelivery}
</h2>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">

              Delivered

            </p>

            <h2 className="text-3xl font-bold text-green-600">

              {deliveredDeliveries}
               
            </h2>

          </div>

        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">

  <input

    placeholder="Search delivery..."

    value={search}

    onChange={(e)=>
      setSearch(e.target.value)
    }

    className="
      flex-1
      border
      rounded-2xl
      p-4
    "

  />

  <select

    value={statusFilter}

    onChange={(e)=>
      setStatusFilter(e.target.value)
    }

    className="
      border
      rounded-2xl
      p-4
      md:w-64
    "

  >

    <option>All</option>

    <option>Confirmed</option>

    <option>Packed</option>

    <option>Shipped</option>

    <option>Out For Delivery</option>

    <option>Delivered</option>

    <option>Delivery Failed</option>

  </select>

</div>

        {loading ? (

          <div className="bg-white rounded-3xl p-10 text-center">

            Loading...

          </div>

        ) : filtered.length === 0 ? (

          <div className="bg-white rounded-3xl p-10 text-center shadow">

            <h2 className="text-2xl font-bold">

              No Assigned Deliveries

            </h2>

            <p className="text-gray-500 mt-2">

              You don't have any deliveries assigned yet.

            </p>

          </div>

        ) : (

          <div className="space-y-4">

            {filtered.map((delivery) => (

              <Link

                key={delivery.id}

                href={`/delivery/${delivery.id}`}

                className="block bg-white rounded-3xl shadow hover:shadow-lg transition p-6"

              >

                <div className="flex justify-between items-center">

                  <div>

                    <h2 className="text-xl font-bold">

                      {delivery.customerName}

                    </h2>

                    <p className="text-gray-500">

                      Order #

                      {delivery.id.slice(0,8)}

                    </p>

                    <p className="mt-2">

                      📞 {delivery.phone}

                    </p>
                    <div className="
flex
flex-wrap
gap-3
mt-4
">

<a

  href={`tel:${delivery.phone}`}

  className="
    bg-green-600
    text-white
    px-4
    py-2
    rounded-xl
    text-sm
  "

>

  📞 Call Customer

</a>

<a

  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    delivery.address || ""
  )}`}

  target="_blank"

  rel="noopener noreferrer"

  className="
    bg-blue-600
    text-white
    px-4
    py-2
    rounded-xl
    text-sm
  "

>

  🗺️ Open Maps

</a>

</div>

                  </div>

                  <div className="text-right">

                    <span
  className={`
    inline-block
    px-4
    py-2
    rounded-full
    text-sm
    font-semibold

    ${
      delivery.status === "Delivered"
        ? "bg-green-100 text-green-700"

        : delivery.status === "Out For Delivery"
        ? "bg-blue-100 text-blue-700"

        : delivery.status === "Delivery Failed"
        ? "bg-red-600 text-white"

        : "bg-yellow-100 text-yellow-700"
    }
  `}
>

  {delivery.status}

</span>

                    <p>

                      📦 {delivery.trackingNumber}

                    </p>
                    <p>

  📍 {delivery.address}

</p>

                    <p>

                      📅 {delivery.expectedDelivery}

                    </p>

                  </div>

                </div>

              </Link>

            ))}

          </div>

        )}

      </div>

    </div>

  );

}