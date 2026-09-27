"use client";

import { useEffect, useState } from "react";

import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import Link from "next/link";

import {
  auth,
  db,
  storage,
} from "@/lib/firebase";
import { vendorStorePath } from "@/lib/storagePaths";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
export default function SellerSettingsPage() {
const [loading, setLoading] = useState(true);

const [saving, setSaving] = useState(false);

const [uploadingLogo, setUploadingLogo] = useState(false);
const [uploadingBanner, setUploadingBanner] = useState(false);

const [vendorId, setVendorId] = useState(""); // auth uid
const [vendorDocId, setVendorDocId] = useState(""); // vendors/ collection doc ID
const [vendorStatus, setVendorStatus] = useState("Pending");

const [form, setForm] = useState({
    businessName: "",
    fullName: "",
    businessType: "",
    email: "",
    businessPhone: "",
    street: "",
    city: "",
    state: "",
    zipCode: "",
    storeLogo: "",
    storeBanner: "",
    aboutStore: "",
    returnPolicy: "",
    shippingPolicy: "",
  });
useEffect(() => {

  const unsubscribe = onAuthStateChanged(

    auth,

    async (user) => {

      if (!user) {

        setLoading(false);

        return;

      }

      setVendorId(user.uid);

      const snap = await getDocs(
        query(collection(db, "vendors"), where("uid", "==", user.uid))
      );

      if (!snap.empty) {

        setVendorDocId(snap.docs[0].id);
        setVendorStatus(snap.docs[0].data().status || "Pending");

        setForm((prev) => ({

          ...prev,

          ...snap.docs[0].data(),

        }));

      }

      setLoading(false);

    }

  );

  return () => unsubscribe();

}, []);
const saveSettings = async () => {

  try {

    setSaving(true);

    if (!vendorDocId) {
      alert("Vendor record not found.");
      return;
    }

    // Store presentation only. Business name, owner, contact and address are
    // verified details — they change through a request on /seller/business
    // (firestore.rules freeze them once KYC is approved), so this page no
    // longer writes them, nor the whole vendor document back.
    await updateDoc(
      doc(db, "vendors", vendorDocId),
      {
        aboutStore: form.aboutStore || "",
        storeLogo: form.storeLogo || "",
        storeBanner: form.storeBanner || "",
      }
    );
    // Keep the public storefront's logo and banner in sync.
    await setDoc(
      doc(db, "vendors_public", vendorId),
      {
        uid: vendorId,
        storeLogo: form.storeLogo || "",
        storeBanner: form.storeBanner || "",
      },
      { merge: true }
    );

    alert("Store updated successfully.");

  } catch (error) {

    console.error(error);

    alert("Failed to update store.");

  } finally {

    setSaving(false);

  }

};

const uploadStoreImage = async (
  file: File,
  field: "storeLogo" | "storeBanner"
) => {

  const setUploading =
    field === "storeLogo" ? setUploadingLogo : setUploadingBanner;

  try {

    setUploading(true);

    // Uid-scoped so one seller cannot overwrite another's logo or banner.
    const uploaderUid = auth.currentUser?.uid;

    if (!uploaderUid) {
      alert("Your session expired. Please sign in again to upload images.");
      return;
    }

    const storageRef = ref(
      storage,
      vendorStorePath(uploaderUid, file)
    );

    await uploadBytes(storageRef, file);

    const url = await getDownloadURL(storageRef);

    setForm((prev) => ({ ...prev, [field]: url }));

  } catch (error) {

    console.error(error);
    alert("Failed to upload image.");

  } finally {

    setUploading(false);

  }

};

  return (

<div className="min-h-screen bg-gray-100 p-6">

<div className="max-w-5xl mx-auto">

<h1 className="text-4xl font-bold mb-8">
Store Settings
</h1>

<div className="bg-white rounded-3xl shadow p-8 space-y-6">

{/* Store Logo & Banner */}

<div className="grid grid-cols-1 md:grid-cols-2 gap-6">

<div>

<label className="font-semibold">
Store Logo
</label>

<div className="mt-2 flex items-center gap-4">

{form.storeLogo && (
  <img
    src={form.storeLogo}
    alt="Store logo"
    className="w-16 h-16 rounded-full object-cover border"
  />
)}

<label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl text-sm font-semibold">
  {uploadingLogo ? "Uploading..." : "Change Logo"}
  <input
    type="file"
    accept="image/*"
    className="hidden"
    disabled={uploadingLogo}
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (file) uploadStoreImage(file, "storeLogo");
    }}
  />
</label>

</div>

</div>

<div>

<label className="font-semibold">
Store Banner
</label>

<div className="mt-2 flex items-center gap-4">

{form.storeBanner && (
  <img
    src={form.storeBanner}
    alt="Store banner"
    className="w-24 h-16 rounded-xl object-cover border"
  />
)}

<label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl text-sm font-semibold">
  {uploadingBanner ? "Uploading..." : "Change Banner"}
  <input
    type="file"
    accept="image/*"
    className="hidden"
    disabled={uploadingBanner}
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (file) uploadStoreImage(file, "storeBanner");
    }}
  />
</label>

</div>

</div>

</div>

{/* Business details — read-only here; changed via a reviewed request */}

<div className="bg-gray-50 rounded-2xl p-5">

<div className="flex flex-wrap items-center justify-between gap-3 mb-3">
<h2 className="font-semibold">Business details</h2>
<Link
href="/seller/business"
className="text-sm bg-white border hover:bg-gray-100 px-4 py-2 rounded-xl font-semibold"
>
Manage in Seller Business
</Link>
</div>

<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
<p><span className="text-gray-500">Business name:</span> {form.businessName || "-"}</p>
<p><span className="text-gray-500">Owner:</span> {form.fullName || "-"}</p>
<p className="break-all"><span className="text-gray-500">Email:</span> {form.email || "-"}</p>
<p><span className="text-gray-500">Phone:</span> {form.businessPhone || "-"}</p>
<p className="md:col-span-2"><span className="text-gray-500">Address:</span> {[form.street, form.city, form.state, form.zipCode].filter(Boolean).join(", ") || "-"}</p>
</div>

</div>

{/* About */}

<div>

<label className="font-semibold">
About Store
</label>

<textarea
rows={5}
className="w-full mt-2 border rounded-xl p-3"
value={form.aboutStore}
onChange={(e)=>
setForm({
...form,
aboutStore:e.target.value,
})
}
/>

</div>

<button
onClick={saveSettings}
disabled={saving}
className="bg-green-600 text-white px-8 py-3 rounded-xl hover:bg-green-700 disabled:opacity-50"
>

{saving ? "Saving..." : "Save Changes"}

</button>

</div>

</div>

</div>

);
}