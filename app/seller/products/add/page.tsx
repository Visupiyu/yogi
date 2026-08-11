"use client";

import ProductForm from "../../components/ProductForm";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";

export default function AddProductPage() {
 const [vendorId, setVendorId] = useState("");
const [vendorName, setVendorName] = useState("");

useEffect(() => {

  const unsubscribe = onAuthStateChanged(auth, async (user) => {

    if (!user) return;

    setVendorId(user.uid);

    const vendorSnap = await getDocs(
      query(collection(db, "vendors"), where("uid", "==", user.uid))
    );

    if (!vendorSnap.empty) {
      const data = vendorSnap.docs[0].data();
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