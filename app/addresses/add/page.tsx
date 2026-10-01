"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { customerLoginUrl } from "@/lib/authRedirect";
import { EMPTY_ADDRESS_FORM, normalizeAddressForm, validateAddressForm } from "@/lib/addressForm";

export default function AddAddressPage() {
  const [form, setForm] = useState(EMPTY_ADDRESS_FORM);
  const [authReady, setAuthReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();

  // Signed-out visitors go to /login and come back here. Nothing renders until
  // auth has initialised, so a signed-in customer never sees a flash of the form
  // (or a premature redirect) while Firebase restores the session.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push(customerLoginUrl());
        return;
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, [router]);

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

  // Double-submit guard: a second click/Enter while the first save is in flight
  // must not create a duplicate address.
  if (saving) return;

  const user = auth.currentUser;
  if (!user) {
    router.push(customerLoginUrl());
    return;
  }

  const problem = validateAddressForm(form);
  if (problem) {
    setFormError(problem);
    return;
  }

  setFormError(null);
  setSaving(true);

  try {

    const values = normalizeAddressForm(form);

    // Same default rule the list page maintains (delete promotes the next
    // address; "Set as default" keeps exactly one): a customer's FIRST address is
    // their default, later ones are not.
    const existing = await getDocs(
      query(
        collection(db, "addresses"),
        where("userEmail", "==", user.email),
        limit(1)
      )
    );

    // A stale/missing localStorage email here doesn't match
    // request.auth.token.email, so firestore.rules rejects the write —
    // use the live signed-in identity.
    const ref = await addDoc(
      collection(db, "addresses"),
      {
        userEmail: user.email,
        // Owned by the account's uid as well (firestore.rules require every
        // identifier on an address to be the caller's own).
        userId: user.uid,

        ...values,

        isDefault: existing.empty,

        createdAt: serverTimestamp(),
      }
    );

    // When launched from checkout (?returnTo=checkout), return there with the
    // new address's id so checkout can preselect it. Otherwise go to the list.
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");

    if (returnTo === "checkout") {
      router.push(`/checkout?newAddress=${ref.id}`);
    } else {
      router.push("/addresses");
    }

  } catch (error) {

    console.error(error);

    setFormError("We couldn't save this address. Please check your connection and try again.");

    setSaving(false);

  }
}

  if (!authReady) {
    return (
      <section className="min-h-screen flex items-center justify-center">
        <h2 className="text-2xl font-semibold">Loading...</h2>
      </section>
    );
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

          <input aria-label="Full Name"
            name="fullName"
            placeholder="Full Name"
            value={form.fullName}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
            required
          />

          <input aria-label="Phone Number"
            name="phone"
            placeholder="Phone Number"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.phone}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
            required
          />

          <input aria-label="House No / Street"
            name="addressLine1"
            placeholder="House No / Street"
            value={form.addressLine1}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
            required
          />

          <input aria-label="Area / Locality"
            name="addressLine2"
            placeholder="Area / Locality"
            value={form.addressLine2}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
          />

          <input aria-label="Landmark"
            name="landmark"
            placeholder="Landmark"
            value={form.landmark}
            onChange={handleChange}
            className="w-full border rounded-xl p-3"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <input aria-label="City"
              name="city"
              placeholder="City"
              value={form.city}
              onChange={handleChange}
              className="border rounded-xl p-3"
              required
            />

            <input aria-label="State"
              name="state"
              placeholder="State"
              value={form.state}
              onChange={handleChange}
              className="border rounded-xl p-3"
              required
            />

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <input aria-label="Pincode"
              name="pincode"
              placeholder="Pincode"
              inputMode="numeric"
              maxLength={6}
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
            {saving ? "Saving..." : "Save Address"}
          </button>

        </form>

      </div>

    </section>
  );
}