"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import ProductForm from "../../../components/ProductForm";

import type { Product } from "@/lib/products/product";

export default function EditProductPage() {

  const { id } = useParams();

  const [product, setProduct] =
    useState<Product | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    const loadProduct = async () => {

      if (!id) return;

      try {

        const ref = doc(
          db,
          "products",
          id as string
        );

        const snap = await getDoc(ref);

        if (snap.exists()) {

          setProduct({

            ...snap.data(),

            id: snap.id,

          } as Product);

        }

      } finally {

        setLoading(false);

      }

    };

    loadProduct();

  }, [id]);

  if (loading) {

    return (

      <div className="p-10 text-center">

        Loading...

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

    <div className="mx-auto max-w-7xl p-6">

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