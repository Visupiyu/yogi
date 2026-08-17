"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function EditAddressPage() {

  const { id } = useParams();

  const router = useRouter();

  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadAddress();
  }, []);

  async function loadAddress() {

    try {

      const snapshot = await getDoc(
        doc(db, "addresses", id as string)
      );

      if (snapshot.exists()) {

        setForm(snapshot.data() as any);

      }

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {

    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });

  }

  async function handleSubmit(
    e: React.FormEvent
  ) {

    e.preventDefault();

    try {

      await updateDoc(
        doc(db, "addresses", id as string),
        {
          fullName: form.fullName,
          phone: form.phone,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          landmark: form.landmark,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          type: form.type,
        }
      );

      alert("Address updated successfully!");

      router.push("/addresses");

    } catch (error) {

      console.error(error);

      alert("Failed to update address.");

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

  return (

    <section className="min-h-screen bg-gray-100 py-10 px-4">

      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-md p-8">

        <h1 className="text-3xl font-bold mb-8">
          Edit Address
        </h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >

          <input
            name="fullName"
            value={form.fullName}
            onChange={handleChange}
            placeholder="Full Name"
            className="w-full border rounded-xl p-3"
            required
          />

          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="Phone Number"
            className="w-full border rounded-xl p-3"
            required
          />

          <input
            name="addressLine1"
            value={form.addressLine1}
            onChange={handleChange}
            placeholder="House No / Street"
            className="w-full border rounded-xl p-3"
            required
          />

          <input
            name="addressLine2"
            value={form.addressLine2}
            onChange={handleChange}
            placeholder="Area / Locality"
            className="w-full border rounded-xl p-3"
          />

          <input
            name="landmark"
            value={form.landmark}
            onChange={handleChange}
            placeholder="Landmark"
            className="w-full border rounded-xl p-3"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <input
              name="city"
              value={form.city}
              onChange={handleChange}
              placeholder="City"
              className="border rounded-xl p-3"
              required
            />

            <input
              name="state"
              value={form.state}
              onChange={handleChange}
              placeholder="State"
              className="border rounded-xl p-3"
              required
            />

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <input
              name="pincode"
              value={form.pincode}
              onChange={handleChange}
              placeholder="Pincode"
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
            Update Address
          </button>

        </form>

      </div>

    </section>

  );

}