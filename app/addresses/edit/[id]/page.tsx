"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { onAuthStateChanged, type User } from "firebase/auth";

import { auth, db } from "@/lib/firebase";
import { customerLoginUrl } from "@/lib/authRedirect";
import { EMPTY_ADDRESS_FORM, normalizeAddressForm, validateAddressForm } from "@/lib/addressForm";
import LoadErrorState from "@/components/LoadErrorState";

export default function EditAddressPage() {

  const { id } = useParams();

  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [notFound, setNotFound] = useState(false);

  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_ADDRESS_FORM);

  const loadAddress = useCallback(async (user: User) => {

    setLoading(true);
    setLoadError(null);
    setNotFound(false);

    try {

      const snapshot = await getDoc(
        doc(db, "addresses", id as string)
      );

      const data: any = snapshot.exists() ? snapshot.data() : null;

      // Only the signed-in customer's own address is editable here (the rules
      // enforce it too); anything else reads as not found.
      const owned =
        data &&
        (data.userId === user.uid ||
          (!!user.email && data.userEmail === user.email));

      if (!owned) {

        setNotFound(true);

      } else {

        setForm({
          fullName: data.fullName ?? "",
          phone: data.phone ?? "",
          addressLine1: data.addressLine1 ?? "",
          addressLine2: data.addressLine2 ?? "",
          landmark: data.landmark ?? "",
          city: data.city ?? "",
          state: data.state ?? "",
          pincode: data.pincode ?? "",
          type: data.type ?? "Home",
        });

      }

    } catch (error) {

      console.error(error);

      setLoadError("We couldn't load this address. Please check your connection and try again.");

    } finally {

      setLoading(false);

    }

  }, [id]);

  // Wait for auth to initialise before reading (a signed-out read would just be
  // permission-denied); signed-out visitors go to /login and come back here.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push(customerLoginUrl());
        return;
      }
      loadAddress(user);
    });
    return () => unsubscribe();
  }, [loadAddress, router]);

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

    // Double-submit guard.
    if (saving) return;

    const problem = validateAddressForm(form);

    if (problem) {
      setFormError(problem);
      return;
    }

    setFormError(null);
    setSaving(true);

    try {

      await updateDoc(
        doc(db, "addresses", id as string),
        normalizeAddressForm(form)
      );

      router.push("/addresses");

    } catch (error) {

      console.error(error);

      setFormError("We couldn't update this address. Please check your connection and try again.");

      setSaving(false);

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

  if (loadError || notFound) {

    return (
      <section className="min-h-screen bg-gray-100 py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <LoadErrorState
            message={loadError ?? "This address could not be found."}
            onRetry={
              loadError && auth.currentUser
                ? () => loadAddress(auth.currentUser as User)
                : undefined
            }
          />
          <div className="text-center mt-6">
            <a href="/addresses" className="text-green-700 font-semibold hover:underline">
              ← Back to My Addresses
            </a>
          </div>
        </div>
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

          <input aria-label="Full Name"
            name="fullName"
            value={form.fullName}
            onChange={handleChange}
            placeholder="Full Name"
            className="w-full border rounded-xl p-3"
            required
          />

          <input aria-label="Phone Number"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="Phone Number"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            className="w-full border rounded-xl p-3"
            required
          />

          <input aria-label="House No / Street"
            name="addressLine1"
            value={form.addressLine1}
            onChange={handleChange}
            placeholder="House No / Street"
            className="w-full border rounded-xl p-3"
            required
          />

          <input aria-label="Area / Locality"
            name="addressLine2"
            value={form.addressLine2}
            onChange={handleChange}
            placeholder="Area / Locality"
            className="w-full border rounded-xl p-3"
          />

          <input aria-label="Landmark"
            name="landmark"
            value={form.landmark}
            onChange={handleChange}
            placeholder="Landmark"
            className="w-full border rounded-xl p-3"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <input aria-label="City"
              name="city"
              value={form.city}
              onChange={handleChange}
              placeholder="City"
              className="border rounded-xl p-3"
              required
            />

            <input aria-label="State"
              name="state"
              value={form.state}
              onChange={handleChange}
              placeholder="State"
              className="border rounded-xl p-3"
              required
            />

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <input aria-label="Pincode"
              name="pincode"
              value={form.pincode}
              onChange={handleChange}
              placeholder="Pincode"
              inputMode="numeric"
              maxLength={6}
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

          {formError && (
            <p role="alert" className="text-red-600 font-semibold">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold transition"
          >
            {saving ? "Updating..." : "Update Address"}
          </button>

        </form>

      </div>

    </section>

  );

}