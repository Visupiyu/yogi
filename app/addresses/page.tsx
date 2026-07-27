"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function AddressesPage() {
    const [addresses, setAddresses] = useState<any[]>([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  loadAddresses();
}, []);

async function loadAddresses() {
  try {

    const user = JSON.parse(
      localStorage.getItem("user") || "{}"
    );

    if (!user.email) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "addresses"),
      where("userEmail", "==", user.email)
    );

    const snapshot = await getDocs(q);

    const list = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    setAddresses(list);

  } catch (error) {

    console.error(error);

  } finally {

    setLoading(false);

  }
}
if (loading) {
  return (
    <section className="min-h-screen flex items-center justify-center">
      <h2 className="text-2xl font-semibold">
        Loading...
      </h2>
    </section>
  );
}
async function deleteAddress(id: string) {

  const ok = confirm(
    "Delete this address?"
  );

  if (!ok) return;

  try {

    await deleteDoc(
      doc(db, "addresses", id)
    );

    loadAddresses();

  } catch (error) {

    console.error(error);

    alert("Failed to delete address.");

  }

}
async function setDefaultAddress(id: string) {

  try {

    const user = JSON.parse(
      localStorage.getItem("user") || "{}"
    );

    const q = query(
      collection(db, "addresses"),
      where("userEmail", "==", user.email)
    );

    const snapshot = await getDocs(q);

    for (const document of snapshot.docs) {

      await updateDoc(
        doc(db, "addresses", document.id),
        {
          isDefault: false,
        }
      );

    }

    await updateDoc(
      doc(db, "addresses", id),
      {
        isDefault: true,
      }
    );

    loadAddresses();

  } catch (error) {

    console.error(error);

    alert("Failed to update default address.");

  }

}
  return (
  <section className="min-h-screen bg-gray-100 py-10 px-4">

    <div className="max-w-5xl mx-auto">

      {/* Header */}

      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">

        <div>

          <h1 className="text-4xl font-bold">
            Saved Addresses
          </h1>

          <p className="text-gray-500 mt-2">
            Manage your delivery addresses.
          </p>

        </div>

        <Link
          href="/addresses/add"
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold"
        >
          + Add New Address
        </Link>

      </div>

      {addresses.length === 0 ? (

        <div className="bg-white rounded-3xl shadow-md p-10 text-center">

          <div className="text-6xl mb-4">
            📍
          </div>

          <h2 className="text-2xl font-bold">
            No Saved Addresses
          </h2>

          <p className="text-gray-500 mt-2">
            Add your first delivery address.
          </p>

        </div>

      ) : (

        addresses.map((address: any) => (

          <div
            key={address.id}
            className="bg-white rounded-3xl shadow-md p-6 mb-6"
          >

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-xl font-bold">
                  {address.type}
                </h2>

                {address.isDefault && (

                  <span className="inline-block mt-2 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                    Default
                  </span>

                )}

              </div>

            </div>

            <div className="space-y-1 mt-5 text-gray-700">

              <p className="font-semibold">
                {address.fullName}
              </p>

              <p>{address.phone}</p>

              <p>{address.addressLine1}</p>

              <p>{address.addressLine2}</p>

              <p>{address.landmark}</p>

              <p>
                {address.city}, {address.state}
              </p>

              <p>{address.pincode}</p>

            </div>

            <div className="flex gap-4 mt-6">

              <Link
  href={`/addresses/edit/${address.id}`}
  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg"
>
  Edit
</Link>

             <button
  onClick={() => deleteAddress(address.id)}
  className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg"
>
  Delete
</button>
<button
  onClick={() => setDefaultAddress(address.id)}
  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg"
>
  Set Default
</button>
{!address.isDefault && (
  <button
    onClick={() => setDefaultAddress(address.id)}
    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg"
  >
    Set Default
  </button>
)}

            </div>

          </div>

        ))

      )}

    </div>

  </section>

);
}