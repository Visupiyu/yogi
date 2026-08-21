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

    await updateDoc(

      doc(db, "vendors", vendorDocId),

      form

    );

    // Keep the public storefront mirror in sync with the display-safe fields
    await setDoc(
      doc(db, "vendors_public", vendorId),
      {
        uid: vendorId,
        status: vendorStatus,
        businessName: form.businessName,
        fullName: form.fullName,
        email: form.email,
        businessPhone: form.businessPhone,
        businessType: form.businessType,
        city: form.city,
        state: form.state,
        storeLogo: form.storeLogo,
        storeBanner: form.storeBanner,
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

{/* Business Name */}

<div>

<label className="font-semibold">
Business Name
</label>

<input
className="w-full mt-2 border rounded-xl p-3"
value={form.businessName}
onChange={(e)=>
setForm({
...form,
businessName:e.target.value,
})
}
/>

</div>

{/* Owner */}

<div>

<label className="font-semibold">
Owner Name
</label>

<input
className="w-full mt-2 border rounded-xl p-3"
value={form.fullName}
onChange={(e)=>
setForm({
...form,
fullName:e.target.value,
})
}
/>

</div>

{/* Email */}

<div>

<label className="font-semibold">
Email
</label>

<input
className="w-full mt-2 border rounded-xl p-3"
value={form.email}
onChange={(e)=>
setForm({
...form,
email:e.target.value,
})
}
/>

</div>

{/* Phone */}

<div>

<label className="font-semibold">
Phone
</label>

<input
className="w-full mt-2 border rounded-xl p-3"
value={form.businessPhone}
onChange={(e)=>
setForm({
...form,
businessPhone:e.target.value,
})
}
/>

</div>

{/* Address */}

<div>

<label className="font-semibold">
Street / Area
</label>

<input
className="w-full mt-2 border rounded-xl p-3"
value={form.street}
onChange={(e)=>
setForm({
...form,
street:e.target.value,
})
}
/>

</div>

<div className="grid grid-cols-1 md:grid-cols-3 gap-4">

<div>

<label className="font-semibold">
City
</label>

<input
className="w-full mt-2 border rounded-xl p-3"
value={form.city}
onChange={(e)=>
setForm({
...form,
city:e.target.value,
})
}
/>

</div>

<div>

<label className="font-semibold">
State
</label>

<input
className="w-full mt-2 border rounded-xl p-3"
value={form.state}
onChange={(e)=>
setForm({
...form,
state:e.target.value,
})
}
/>

</div>

<div>

<label className="font-semibold">
PIN Code
</label>

<input
className="w-full mt-2 border rounded-xl p-3"
value={form.zipCode}
onChange={(e)=>
setForm({
...form,
zipCode:e.target.value,
})
}
/>

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