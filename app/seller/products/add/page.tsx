"use client";

import ProductForm from "../../components/ProductForm";

export default function AddProductPage() {

  // TODO:
  // Later we'll get these values
  // from Firebase Auth / Seller Profile.

  const vendorId = "seller-demo";

  const vendorName = "Demo Seller";

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