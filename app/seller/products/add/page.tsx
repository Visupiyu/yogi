"use client";

import ProductForm from "../../components/ProductForm";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function AddProductPage() {

  // TODO:
  // Later we'll get these values
  // from Firebase Auth / Seller Profile.

 const [vendorId, setVendorId] = useState("");
const [vendorName, setVendorName] = useState("");

useEffect(() => {

  const unsubscribe = onAuthStateChanged(auth, async (user) => {

    if (!user) return;

    setVendorId(user.uid);

    const vendorRef = doc(db, "vendors", user.uid);
    const vendorSnap = await getDoc(vendorRef);

    if (vendorSnap.exists()) {
      const data = vendorSnap.data();
      setVendorName(data.businessName || data.fullName || "");
    }

  });

  return () => unsubscribe();

}, []);
  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Add New Product
        </h1>
        <p className="mt-2 text-gray-600">
          Create a new product for your YOMICO store.
        </p>
      </div>
      <ProductForm
        vendorId={vendorId}
        vendorName={vendorName}
      />
    </div>
  );
}