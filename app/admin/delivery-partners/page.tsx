"use client";

import { useEffect, useState } from "react";

import {

 addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type DeliveryPartner = {

  id: string;

  name: string;

  phone: string;

  email: string;

  vehicleNumber: string;

  vehicleType: string;

  dailyCapacity: number;

  assignedOrders?: number;

  serviceArea: string;

  status: string;

};

export default function DeliveryPartnersPage() {

  const [partners, setPartners] =useState<DeliveryPartner[]>([]);

  const [loading, setLoading] =useState(true);

  const [name, setName] =useState("");

  const [phone, setPhone] =useState("");

  const [email, setEmail] =useState("");

  const [vehicleNumber, setVehicleNumber] =useState("");
  const [vehicleType, setVehicleType] = useState("Bike");
  const [dailyCapacity, setDailyCapacity] = useState(20);

  const [serviceArea, setServiceArea] =useState("");
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] =useState("");

  useEffect(() => {

    loadPartners();

  }, []);

  const loadPartners = async () => {

    try {

      const snapshot = await getDocs(

        collection(
          db,
          "deliveryPartners"
        )

      );

      const items: DeliveryPartner[] = [];

      snapshot.forEach((docSnap) => {

        const data = docSnap.data();

items.push({

  id: docSnap.id,

  ...(data as Omit<DeliveryPartner, "id">),

  assignedOrders:

    data.assignedOrders || 0,


        });

      });

      setPartners(items);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  };

  const addPartner = async () => {

    if (

      !name ||

      !phone ||

      !email

    ) {

      alert("Please fill all required fields.");

      return;

    }

   try {

  if(editingId){

    await updateDoc(

      doc(
        db,
        "deliveryPartners",
        editingId
      ),

      {

        name,
        phone,
        email,
        vehicleNumber,
        vehicleType,
        dailyCapacity,
        serviceArea,

      }

    );

    setEditingId("");

    setName("");

    setPhone("");

    setEmail("");

    setVehicleNumber("");

    setServiceArea("");

    loadPartners();

    return;

  }

  await addDoc(

        collection(
          db,
          "deliveryPartners"
        ),

        {

          name,

          phone,

          email,

          vehicleNumber,
          vehicleType,
          dailyCapacity,
          serviceArea,

          status: "Active",

          createdAt:
            serverTimestamp(),

        }

      );

      setName("");

      setPhone("");

      setEmail("");

      setVehicleNumber("");

      setServiceArea("");

      loadPartners();

    } catch (error) {

      console.error(error);

    }

  };

  const deletePartner = async (id: string) => {

     if (

      !confirm(

        "Delete this delivery partner?"

      )

    ) {

      return;

    }

    await deleteDoc(

      doc(
        db,
        "deliveryPartners",
        id
      )

    );

    loadPartners();

  };

  const togglePartnerStatus = async (
  id: string,
  currentStatus: string
) => {

  try {

    await updateDoc(

      doc(
        db,
        "deliveryPartners",
        id
      ),

      {
        status:
          currentStatus === "Active"
            ? "Inactive"
            : "Active",
      }

    );

    loadPartners();

  } catch (error) {

    console.error(error);

  }

};

  const filteredPartners = partners.filter((partner) =>

  partner.name
    .toLowerCase()
    .includes(search.toLowerCase())

  ||

  partner.phone
    .toLowerCase()
    .includes(search.toLowerCase())

  ||

  partner.email
    .toLowerCase()
    .includes(search.toLowerCase())

  ||

  partner.serviceArea
    .toLowerCase()
    .includes(search.toLowerCase())

);

const editPartner = (partner:any)=>{

  setEditingId(partner.id);

  setName(partner.name);

  setPhone(partner.phone);

  setEmail(partner.email);

  setVehicleNumber(
    partner.vehicleNumber
  );
  setVehicleType(
  partner.vehicleType || "Bike"
);

setDailyCapacity(
  partner.dailyCapacity || 20
);

  setServiceArea(
    partner.serviceArea
  );

};

  return (

    <div className="min-h-screen bg-gray-100 p-6">

      <div className="max-w-7xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">

          <h1 className="text-4xl font-bold">

            🚚 Delivery Partners

          </h1>

          <p className="mt-2">

            Manage marketplace delivery staff

          </p>

        </div>

        <div className="bg-white rounded-3xl shadow p-6 mb-8 grid md:grid-cols-2 gap-4">

          <input
            placeholder="Partner Name"
            value={name}
            onChange={(e)=>setName(e.target.value)}
            className="border rounded-xl p-3"
          />

          <input
            placeholder="Phone"
            value={phone}
            onChange={(e)=>setPhone(e.target.value)}
            className="border rounded-xl p-3"
          />

          <input
            placeholder="Email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            className="border rounded-xl p-3"
          />

          <input
            placeholder="Vehicle Number"
            value={vehicleNumber}
            onChange={(e)=>setVehicleNumber(e.target.value)}
            className="border rounded-xl p-3"
          />

          <select

  value={vehicleType}

  onChange={(e)=>

    setVehicleType(
      e.target.value
    )

  }

  className="border rounded-xl p-3"

>

  <option>Bike</option>

  <option>Scooter</option>

  <option>Car</option>

  <option>Van</option>

</select>

<input

  type="number"

  min="1"

  placeholder="Daily Capacity"

  value={dailyCapacity}

  onChange={(e)=>

    setDailyCapacity(
      Number(e.target.value)
    )

  }

  className="
    border
    rounded-xl
    p-3
  "

/>

          <input
            placeholder="Service Area"
            value={serviceArea}
            onChange={(e)=>setServiceArea(e.target.value)}
            className="border rounded-xl p-3"
          />

          <button

            onClick={addPartner}

            className="bg-green-600 text-white rounded-xl p-3"

          >

         {editingId
  ? "💾 Update Partner"
  : "➕ Add Delivery Partner"}

          </button>

        </div>

        <input

  type="text"

  placeholder="Search Partner..."

  value={search}

  onChange={(e)=>

    setSearch(e.target.value)

  }

  className="
    w-full
    border
    rounded-2xl
    p-4
    mb-6
  "

/>

        {loading ? (

          <div className="bg-white rounded-3xl p-10 text-center">

            Loading...

          </div>

        ) : (

          <div className="space-y-4">

            {filteredPartners.map((partner)=>(

              <div

                key={partner.id}

                className="bg-white rounded-3xl shadow p-6 flex justify-between items-center"

              >

                <div>

                  <h2 className="text-xl font-bold">

                    {partner.name}

                  </h2>

                  <p>📞 {partner.phone}</p>

                  <p>📧 {partner.email}</p>

               <p>
  🚚 {partner.vehicleType}
</p>

<p>
  🔢 {partner.vehicleNumber}
</p>

<p>
  📦 Capacity:
  {" "}
  {partner.dailyCapacity}
  {" "}
  orders/day
</p>

<p>
  📋 Assigned Orders:
  {" "}
  {partner.assignedOrders || 0}
</p>

                  <p>📍 {partner.serviceArea}</p>

                  <span className="inline-block mt-2 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">

                    {partner.status}

                  </span>

                </div>

                <div className="flex gap-3">

                    <button

  onClick={()=>

    editPartner(partner)

  }

  className="
    bg-blue-600
    text-white
    px-5
    py-2
    rounded-xl
  "

>

  Edit

</button>

<button

  onClick={()=>

    togglePartnerStatus(

      partner.id,

      partner.status

    )

  }

  className={`

    px-5
    py-2
    rounded-xl
    text-white

    ${

      partner.status === "Active"

      ? "bg-yellow-600"

      : "bg-green-600"

    }

  `}

>

  {

    partner.status === "Active"

    ? "Deactivate"

    : "Activate"

  }

</button>

<button

  onClick={()=>

    deletePartner(
      partner.id
    )

  }

  className="
    bg-red-600
    text-white
    px-5
    py-2
    rounded-xl
  "

>

  Delete

</button>

</div>

              </div>

            ))}

            {filteredPartners.length === 0 && (

              <div className="bg-white rounded-3xl p-10 text-center shadow">

                No delivery partners added.

              </div>

            )}

          </div>

        )}

      </div>

    </div>

  );

}