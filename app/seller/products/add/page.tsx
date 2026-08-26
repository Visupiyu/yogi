"use client";

import ProductForm from "../../components/ProductForm";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";

export default function AddProductPage() {
 const [vendorId, setVendorId] = useState("");
const [vendorName, setVendorName] = useState("");

// ProductForm reads the previous upload's values once, when it mounts, and
// they are stored per seller. Mounting it before auth resolves would hand
// it an empty vendorId and it would find nothing to restore, so hold the
// form back for the one tick that takes — the same pattern the edit page
// already uses while it loads its product.
const [authReady, setAuthReady] = useState(false);

useEffect(() => {

  const unsubscribe = onAuthStateChanged(auth, async (user) => {

    if (!user) {
      setAuthReady(true);
      return;
    }

    setVendorId(user.uid);

    // The vendor lookup only supplies a display name. If it fails — offline,
    // a rules denial, a slow network — the seller still has to be able to
    // add a product, so it must never be able to leave the page stuck on
    // "Loading..." with no form. Releasing the gate in finally guarantees
    // the form renders either way.
    try {

      const vendorSnap = await getDocs(
        query(collection(db, "vendors"), where("uid", "==", user.uid))
      );

      if (!vendorSnap.empty) {
        const data = vendorSnap.docs[0].data();
        setVendorName(data.businessName || data.fullName || "");
      }

    } catch (error) {

      console.error("Could not load vendor name:", error);

    } finally {

      setAuthReady(true);

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
      {authReady ? (
        <ProductForm
          vendorId={vendorId}
          vendorName={vendorName}
        />
      ) : (
        <div className="p-10 text-center text-gray-500">
          Loading...
        </div>
      )}
    </div>
  );
}