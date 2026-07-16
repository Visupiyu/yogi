"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import {

  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
  addDoc,
  serverTimestamp,

} from "firebase/firestore";

import { db } from "@/lib/firebase";

type Delivery = {

  id: string;

  customerName: string;

  phone?: string;

  address?: string;

  courierPartner?: string;

  deliveryPartnerId?: string;

  deliveryPartnerName?: string;

  trackingNumber?: string;

  expectedDelivery?: string;

  assignedAt?: any;

  status: string;

  createdAt?: any;

};

export default function AdminDeliveryPage() {

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const [loading, setLoading] =useState(true);

  const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [partners,setPartners] = useState<any[]>([]);

  useEffect(() => {

    loadDeliveries();

  }, []);

  const loadDeliveries = async () => {
    
    try {

      const snapshot = await getDocs(

        query(

          collection(db, "orders"),

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
            data.courierPartner || "Not Assigned",

          deliveryPartnerId:
            data.deliveryPartnerId || "",

          deliveryPartnerName:
            data.deliveryPartnerName || "",

          trackingNumber:
            data.trackingNumber || "-",

          expectedDelivery:
            data.expectedDelivery || "-",

            assignedAt:
           data.assignedAt || null,

          status:
            data.status || "Pending",

          createdAt:
            data.createdAt,

        });

      });

      setDeliveries(items);
      const partnerSnapshot =
await getDocs(

  collection(
    db,
    "deliveryPartners"
  )

);

const partnerList:any[]=[];

partnerSnapshot.forEach((docSnap)=>{

  partnerList.push({

    id:docSnap.id,

    ...docSnap.data(),

  });

});

setPartners(partnerList);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  };

  const assignedCount =
  deliveries.filter(
    (d) => d.status === "Assigned"
  ).length;

const outForDeliveryCount =
  deliveries.filter(
    (d) => d.status === "Out For Delivery"
  ).length;

const deliveredCount =
  deliveries.filter(
    (d) => d.status === "Delivered"
  ).length;

const failedCount =
  deliveries.filter(
    (d) => d.status === "Delivery Failed"
  ).length;
  

 const filtered = deliveries.filter((item) => {

  const searchMatch =

    item.customerName
      .toLowerCase()
      .includes(search.toLowerCase())

    ||

    item.id
      .toLowerCase()
      .includes(search.toLowerCase());

  const statusMatch =

    statusFilter === "All"

      ||

    item.status === statusFilter;

  return searchMatch && statusMatch;

});

  const assignPartner =
async(

orderId:string,

partner:any

)=>{

try{

await updateDoc(

doc(

db,

"orders",

orderId

),

{

deliveryPartnerId:
partner.id,

deliveryPartnerName:
partner.name,

assignedAt:
serverTimestamp(),

status:"Assigned",

}

);

loadDeliveries();

await addDoc(

  collection(
    db,
    "notifications"
  ),

  {

    title:
      "Delivery Assigned",

    message:
      `${partner.name} has been assigned to Order ${orderId.slice(0,8)}.`,

    type:
      "delivery",

    read: false,

    createdAt:
      serverTimestamp(),

  }

);

}catch(error){

console.error(error);

}

};  

const exportCSV = () => {

  const rows = [

    [

      "Order ID",

      "Customer",

      "Partner",

      "Status",

      "Tracking",

      "Expected Delivery"

    ],

    ...filtered.map((item)=>([

      item.id,

      item.customerName,

      item.deliveryPartnerName ||

      item.courierPartner ||

      "",

      item.status,

      item.trackingNumber ||

      "",

      item.expectedDelivery ||

      ""

    ]))

  ];

  const csv = rows

    .map((row)=>row.join(","))

    .join("\n");

  const blob = new Blob(

    [csv],

    {

      type:"text/csv"

    }

  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;

  a.download =

    "delivery-report.csv";

  a.click();

  URL.revokeObjectURL(url);

};

  return (

    <div className="min-h-screen bg-gray-100 p-6">

      <div className="max-w-7xl mx-auto">

        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-3xl p-8 mb-8">

          <h1 className="text-4xl font-bold">

            🚚 Delivery Management

          </h1>

          <p className="mt-2 opacity-90">

            Manage all marketplace deliveries

          </p>

         <div className="mt-5 flex gap-3">

  <button

    onClick={loadDeliveries}

    className="
      bg-white
      text-indigo-700
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

  onClick={exportCSV}

  className="
    bg-green-600
    text-white
    px-5
    py-2
    rounded-xl
    font-semibold
    hover:bg-green-700
  "

>

  📥 Export CSV

</button>

</div>

        </div>

       <div className="grid md:grid-cols-5 gap-5 mb-8">

  <div className="bg-white rounded-3xl p-6 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition">

    <p className="text-gray-500">
      Total Deliveries
    </p>

    <h2 className="text-3xl font-bold">
      {deliveries.length}
    </h2>

  </div>

  <div className="bg-white rounded-2xl p-6 shadow">

    <p className="text-gray-500">
      Assigned
    </p>

    <h2 className="text-3xl font-bold text-indigo-600">
      {assignedCount}
    </h2>

  </div>

  <div className="bg-white rounded-2xl p-6 shadow">

    <p className="text-gray-500">
      Out For Delivery
    </p>

    <h2 className="text-3xl font-bold text-blue-600">
      {outForDeliveryCount}
    </h2>

  </div>

  <div className="bg-white rounded-2xl p-6 shadow">

    <p className="text-gray-500">
      Delivered
    </p>

    <h2 className="text-3xl font-bold text-green-600">
      {deliveredCount}
    </h2>

  </div>

  <div className="bg-white rounded-2xl p-6 shadow">

    <p className="text-gray-500">
      Failed
    </p>

    <h2 className="text-3xl font-bold text-red-600">
      {failedCount}
    </h2>

  </div>

</div>
<div className="grid md:grid-cols-2 gap-4 mb-6">

<input

placeholder="Search customer or order..."

value={search}

onChange={(e)=>

setSearch(e.target.value)

}

className="
w-full
border
rounded-2xl
p-4
"

/>
<select

value={statusFilter}

onChange={(e)=>

setStatusFilter(

e.target.value

)

}

className="
border
rounded-2xl
p-4
"

>
<option>

All

</option>

<option>

Assigned

</option>

<option>

Packed

</option>

<option>

Shipped

</option>

<option>

Out For Delivery

</option>

<option>

Delivered

</option>

<option>

Delivery Failed

</option>

</select>

</div>

        {loading ? (

          <div className="bg-white rounded-3xl p-10 text-center">

            Loading...

          </div>

        ) : (

          <div className="space-y-4">

            {filtered.map((order) => (

              <Link

                key={order.id}

                href={`/delivery/${order.id}`}

                className="block bg-white rounded-3xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition duration-300 transition p-6"

              >

                <div className="flex justify-between items-center">

                  <div>

                    <h2 className="text-xl font-bold">

                      {order.customerName}

                    </h2>

                    <p className="text-gray-500">

                      Order #

                      {order.id.slice(0,8)}

                    </p>

                    <div className="mt-2">

<span
className={`

px-3
py-1
rounded-full
text-xs
font-semibold

${
order.status==="Delivered"

? "bg-green-100 text-green-700"

: order.status==="Assigned"

? "bg-indigo-100 text-indigo-700"

: order.status==="Out For Delivery"

? "bg-blue-100 text-blue-700"

: order.status==="Delivery Failed"

? "bg-red-100 text-red-700"

: "bg-yellow-100 text-yellow-700"

}

`}
>

{order.status}

</span>

</div>
                  </div>

                 <div className="text-right">

  <p>

    🚚

    {" "}

    {order.deliveryPartnerName ||

      order.courierPartner ||

      "Not Assigned"}

  </p>

  <p>

    📍

    {" "}

    {order.trackingNumber}

  </p>

  <p>

    📅

    {" "}

    {order.expectedDelivery}

  </p>

  <select

    className="
      mt-3
      border
      rounded-lg
      p-2
      w-full
    "

    defaultValue=""

    onChange={(e)=>{

      const partner =

        partners.find(

          (p)=>

            p.id === e.target.value

        );

      if(partner){

        assignPartner(

          order.id,

          partner

        );

      }

    }}

  >
    <option value="">
      Assign Delivery Partner
    </option>
    {
      partners.map(
        (partner)=>(
          <option
            key={partner.id}
            value={partner.id}
          >
            {partner.name}
          </option>
        )
      )
    }
 </select>
</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="text-center py-8 text-gray-500">Delivery Management powered by Yogi Mart</div>
      </div>   
  );
}