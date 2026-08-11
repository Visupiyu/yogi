"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type { Product } from "@/lib/products/product";

export default function ViewProductPage() {

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

      <div className="mb-8 flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">

            Product Details

          </h1>

          <p className="text-gray-600">

            View complete product information.

          </p>

        </div>

        <Link

          href="/seller/products"

          className="rounded-lg bg-gray-700 px-5 py-3 text-white"

        >

          Back

        </Link>

      </div>

      <div className="grid gap-8 lg:grid-cols-2">

        <div>

          <img

            src={product.thumbnail}

            alt={product.title}

            className="w-full rounded-xl border"

          />

        </div>

        <div className="space-y-4">

          <h2 className="text-2xl font-bold">

            {product.title}

          </h2>

          <p>

            <strong>Brand:</strong> {product.brand}

          </p>

          <p>

            <strong>Category:</strong> {product.categoryId}

          </p>

          <p>

            <strong>SKU:</strong> {product.sku}

          </p>

          <p>

            <strong>Price:</strong> ₹{product.sellingPrice}

          </p>

          <p>

            <strong>Stock:</strong> {product.stock}

          </p>

          <p>

            <strong>Status:</strong>

            {product.active ? " Active" : " Inactive"}

          </p>

          <p>

            <strong>Description:</strong>

          </p>

          <div className="rounded-lg bg-gray-50 p-4">

            {product.description}

          </div>

        </div>

      </div>

    </div>

  );

}