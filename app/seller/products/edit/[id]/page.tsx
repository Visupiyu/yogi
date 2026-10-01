"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import LoadErrorState from "@/components/LoadErrorState";

import ProductForm from "../../../components/ProductForm";

import type { Product } from "@/lib/products/product";

export default function EditProductPage() {

  const { id } = useParams();

  const [product, setProduct] =
    useState<Product | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState<string | null>(null);

  const loadProduct = useCallback(async () => {

    if (!id) return;

    setLoading(true);
    setLoadError(null);

    try {

      const ref = doc(
        db,
        "products",
        id as string
      );

      const snap = await getDoc(ref);

      setProduct(
        snap.exists()
          ? ({ ...snap.data(), id: snap.id } as Product)
          : null
      );

    } catch (err) {

      console.error("Failed to load product:", err);

      setLoadError(
        "We couldn't load this product. Please check your connection and try again."
      );

    } finally {

      setLoading(false);

    }

  }, [id]);

  useEffect(() => {

    loadProduct();

  }, [loadProduct]);

  if (loading) {

    return (

      <div className="p-10 text-center">

        Loading...

      </div>

    );

  }

  if (loadError) {

    return (

      <div className="mx-auto max-w-3xl p-4 sm:p-6">

        <LoadErrorState
          message={loadError}
          onRetry={loadProduct}
        />

      </div>

    );

  }

  if (!product) {

    return (

      <div className="p-10 text-center">

        Product not found.

      </div>

    );

  }

  return (

    <div className="mx-auto max-w-7xl p-4 sm:p-6">

      <h1 className="mb-8 text-3xl font-bold">

        Edit Product

      </h1>

      <ProductForm

        vendorId={product.vendorId}

     vendorName={product.vendorName ?? ""}

        product={product as Product & { id: string }}

      />

    </div>

  );

}