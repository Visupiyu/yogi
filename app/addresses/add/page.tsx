"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function AddAddressPage() {
    const [form, setForm] = useState({
    fullName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
    type: "Home",
  });
  const router = useRouter();
  

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();

  try {

    // A stale/missing localStorage email here doesn't match
    // request.auth.token.email, so firestore.rules rejects the write —
    // read the live signed-in identity instead.
    if (!auth.currentUser) {
      alert("Please login first.");
      router.push("/login");
      return;
    }

    await addDoc(
      collection(db, "addresses"),
      {
        userEmail: auth.currentUser.email,

        fullName: form.fullName,
        phone: form.phone,

        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,

        landmark: form.landmark,

        city: form.city,
        state: form.state,
        pincode: form.pincode,

        type: form.type,

        isDefault: false,

        createdAt: serverTimestamp(),
      }
    );

    alert("Address saved successfully!");

    router.push("/addresses");

  } catch (error) {

    console.error(error);

    alert("Failed to save address.");

  }
}
 return (
    <section className="min-h-screen bg-gray-100 py-10 px-4">

      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-md p-8">

        <h1 className="text-3xl font-bold mb-8">
          Add New Address
        </h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >

          <input
            name="fullName"
            placeholder="Full Name"
            value={form.fullName}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
            required
          />

          <input
            name="phone"
            placeholder="Phone Number"
            value={form.phone}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
            required
          />

          <input
            name="addressLine1"
            placeholder="House No / Street"
            value={form.addressLine1}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
            required
          />

          <input
            name="addressLine2"
            placeholder="Area / Locality"
            value={form.addressLine2}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
          />

          <input
            name="landmark"
            placeholder="Landmark"
            value={form.landmark}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
          />

          <div className="grid md:grid-cols-2 gap-4">

            <input
              name="city"
              placeholder="City"
              value={form.city}
              onChange={handleChange}
              className="border rounded-xl p-3"
              required
            />

            <input
              name="state"
              placeholder="State"
              value={form.state}
              onChange={handleChange}
              className="border rounded-xl p-3"
              required
            />

          </div>

          <div className="grid md:grid-cols-2 gap-4">

            <input
              name="pincode"
              placeholder="Pincode"
              value={form.pincode}
              onChange={handleChange}
              className="border rounded-xl p-3"
              required
            />

            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="border rounded-xl p-3"
            >
              <option>Home</option>
              <option>Office</option>
              <option>Other</option>
            </select>

          </div>

          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold transition"
          >
            Save Address
          </button>

        </form>

      </div>

    </section>
  );
}