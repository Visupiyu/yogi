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
} from "@/lib/firebase";

import {
  onAuthStateChanged,
} from "firebase/auth";
export default function SellerSettingsPage() {
const [loading, setLoading] = useState(true);

const [saving, setSaving] = useState(false);

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

  return (

<div className="min-h-screen bg-gray-100 p-6">

<div className="max-w-5xl mx-auto">

<h1 className="text-4xl font-bold mb-8">
Store Settings
</h1>

<div className="bg-white rounded-3xl shadow p-8 space-y-6">

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