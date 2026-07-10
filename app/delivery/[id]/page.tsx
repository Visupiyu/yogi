"use client";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import {

 doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,

} from "firebase/firestore";

import { db, storage } from "@/lib/firebase";
import {

  ref,

  uploadBytes,

  getDownloadURL,

} from "firebase/storage";

import { toast } from "sonner";

export default function DeliveryDetailsPage() {

  const params = useParams();

  const id = params.id as string;

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [order, setOrder] =
    useState<any>(null);

  const [status, setStatus] =
    useState("Shipped");

  const [deliveryNotes, setDeliveryNotes] =
    useState("");
    const [otp, setOtp] =
  useState("");

const [enteredOtp, setEnteredOtp] =
  useState("");
  const [proofImage, setProofImage] =
  useState<File | null>(null);

const [proofPreview, setProofPreview] =
  useState("");
    

  useEffect(() => {

    loadOrder();

  }, []);

  const loadOrder = async () => {

    try {

      const snap = await getDoc(

        doc(db, "orders", id)

      );

      if (snap.exists()) {

       const data: any = {

          id: snap.id,

          ...snap.data(),

        };

        setOrder(data);

        setStatus(

          data.status || "Shipped"

        );

        setDeliveryNotes(

          data.deliveryNotes || ""

        );
        setOtp(
  data.deliveryOtp || ""
);

      }

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  };

  const saveDelivery = async () => {

    try {

      setSaving(true);

      if (

  status === "Delivered"

  &&

  otp

  &&

  enteredOtp !== otp

){

  toast.error(

    "Invalid delivery OTP."

  );

  setSaving(false);

  return;

}
let proofImageUrl = order.proofImage || "";

if (proofImage) {

  const storageRef = ref(

    storage,

    `delivery-proof/${id}-${Date.now()}`

  );

  await uploadBytes(

    storageRef,

    proofImage

  );

  proofImageUrl =

    await getDownloadURL(

      storageRef

    );

}

      await updateDoc(

        doc(db, "orders", id),

        {

          status,

          deliveryNotes,
          proofImage:
            proofImageUrl,

          deliveredAt:

            status === "Delivered"

              ? serverTimestamp()

              : null,

          updatedAt:

            serverTimestamp(),

        }

      );
      await addDoc(

  collection(
    db,
    "notifications"
  ),

  {

    title:
      "Delivery Update",

    message:
      `Your order ${id.slice(0,8)} is now ${status}.`,

    userEmail:
      order.userEmail,

    role:
      "customer",

    type:
      "delivery",

    read:
      false,

    createdAt:
      serverTimestamp(),

  }

);

      toast.success(

        "Delivery updated successfully."

      );

    } catch (error) {

      console.error(error);

      toast.error(

        "Failed to update delivery."

      );

    } finally {

      setSaving(false);

    }

  };

  if (loading) {

    return (

      <div className="p-10 text-center">

        Loading...

      </div>

    );

  }

  if (!order) {

    return (

      <div className="p-10 text-center">

        Order not found.

      </div>

    );

  }

  return (

    <div className="min-h-screen bg-gray-100 p-6">

      <div className="max-w-5xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">

          <h1 className="text-4xl font-bold">

            🚚 Delivery Details

          </h1>

          <p>

            Order #

            {order.id.slice(0,8)}

          </p>

        </div>

        <div className="bg-white rounded-3xl shadow p-8 space-y-6">

          <div>

            <h2 className="text-2xl font-bold">

              Customer

            </h2>

            <p>{order.customerName}</p>

            <p>{order.phone}</p>

            <p>{order.address}</p>

          </div>

          <div>

            <h2 className="text-xl font-bold mb-3">

              Tracking

            </h2>

            <p>

              Courier:

              {" "}

              {order.courierPartner || "-"}

            </p>

            <p>

              Tracking No:

              {" "}

              {order.trackingNumber || "-"}

            </p>

          </div>

          <div className="mb-8">

  <h2 className="text-xl font-bold mb-5">

    Delivery Progress

  </h2>

  <div className="flex justify-between items-center gap-2">

    {[
      "Assigned",
      "Packed",
      "Shipped",
      "Out For Delivery",
      "Delivered"
    ].map((step, index) => (

      <div
        key={index}
        className="flex-1 text-center"
      >

        <div
          className={`
            w-10
            h-10
            mx-auto
            rounded-full
            flex
            items-center
            justify-center
            text-white
            font-bold

            ${
              [
                "Assigned",
                "Packed",
                "Shipped",
                "Out For Delivery",
                "Delivered"
              ].indexOf(status)

              >=

              index

              ? "bg-green-600"

              : "bg-gray-300"
            }
          `}
        >

          {index + 1}

        </div>

        <p className="text-xs mt-2">

          {step}

        </p>

      </div>

    ))}

  </div>

</div>

          <div>

            <label className="font-semibold">

              Delivery Status

            </label>
            {status === "Delivered" && (

<div className="mt-6">

  <label className="font-semibold">

    Customer OTP

  </label>

  <input

    type="text"

    value={enteredOtp}

    onChange={(e)=>

      setEnteredOtp(
        e.target.value
      )

    }

    placeholder="Enter customer OTP"

    className="
      w-full
      mt-2
      border
      rounded-xl
      p-3
    "

  />

</div>

)}

            <select

            

              value={status}

              onChange={(e)=>

                setStatus(

                  e.target.value

                )

              }

              className="w-full mt-2 border rounded-xl p-3"

            >

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

          <div>

            <label className="font-semibold">

              Delivery Notes

            </label>

            <textarea

              value={deliveryNotes}

              onChange={(e)=>

                setDeliveryNotes(

                  e.target.value

                )

              }

              rows={4}

              className="w-full mt-2 border rounded-xl p-3"

            />

          </div>

          <div className="flex gap-4">

            <a

              href={`tel:${order.phone}`}

              className="bg-blue-600 text-white px-6 py-3 rounded-xl"

            >

              📞 Call Customer

            </a>

            <a

              target="_blank"

              rel="noopener noreferrer"

              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`}

              className="bg-green-600 text-white px-6 py-3 rounded-xl"

            >

              📍 Open Maps

            </a>

          </div>
          <div className="mt-6">

  <label className="font-semibold">

    Proof of Delivery

  </label>

  <input

    type="file"

    accept="image/*"

    onChange={(e)=>{

      const file = e.target.files?.[0];

      if(file){

        setProofImage(file);

        setProofPreview(

          URL.createObjectURL(file)

        );

      }

    }}

    className="mt-2"

  />

  {proofPreview && (

    <img

      src={proofPreview}

      alt="Proof"

      className="
        mt-4
        h-48
        rounded-xl
        object-cover
      "

    />

  )}

</div>

          <button

            onClick={saveDelivery}

            disabled={saving}

            className="bg-indigo-600 text-white px-8 py-3 rounded-xl disabled:opacity-50"

          >

            {

              saving

              ?

              "Saving..."

              :

              "Save Delivery"

            }

          </button>

        </div>

      </div>

    </div>

  );

}