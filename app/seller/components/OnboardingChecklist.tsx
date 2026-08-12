"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { Vendor } from "@/hooks/useVendor";

interface OnboardingChecklistProps {
  vendor: Vendor;
  vendorId: string;
}

export default function OnboardingChecklist({
  vendor,
  vendorId,
}: OnboardingChecklistProps) {

  const [hasProduct, setHasProduct] = useState<boolean | null>(null);
  const [hasOrder, setHasOrder] = useState<boolean | null>(null);

  useEffect(() => {

    if (!vendorId) return;

    (async () => {

      try {

        const productSnap = await getDocs(
          query(
            collection(db, "products"),
            where("vendorId", "==", vendorId),
            limit(1)
          )
        );

        setHasProduct(!productSnap.empty);

        const orderSnap = await getDocs(
          query(
            collection(db, "orders"),
            where("vendorIds", "array-contains", vendorId),
            limit(1)
          )
        );

        setHasOrder(!orderSnap.empty);

      } catch (error) {

        console.error(error);
        setHasProduct(false);
        setHasOrder(false);

      }

    })();

  }, [vendorId]);

  // Wait for the two live checks so the percentage doesn't flash wrong
  // before settling.
  if (hasProduct === null || hasOrder === null) return null;

  const steps: {
    label: string;
    done: boolean;
    href?: string;
  }[] = [
    { label: "Account created", done: true },
    { label: "KYC verified", done: vendor.kycStatus === "Approved" },
    {
      label: "Bank details added",
      done: !!(vendor.accountNumber && vendor.ifsc),
    },
    {
      label: "Store profile set up",
      done: !!(vendor.storeLogo && vendor.storeBanner),
      href: "/seller/settings",
    },
    {
      label: "First product added",
      done: hasProduct,
      href: "/seller/products/add",
    },
    { label: "First order received", done: hasOrder },
  ];

  const completedCount = steps.filter((step) => step.done).length;
  const percent = Math.round((completedCount / steps.length) * 100);

  // Fully set up — this stops being useful and just adds clutter.
  if (percent === 100) return null;

  return (
    <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">
          Complete your seller setup
        </h2>

        <span className="text-lg font-bold text-green-600">
          {percent}%
        </span>
      </div>

      <div className="mb-5 h-2 w-full rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-green-600 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {steps.map((step) => {

          const pill = (
            <span
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                step.done
                  ? "bg-green-50 text-green-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {step.done ? "✓" : "○"} {step.label}
            </span>
          );

          return step.href && !step.done ? (
            <Link key={step.label} href={step.href}>
              {pill}
            </Link>
          ) : (
            <span key={step.label}>{pill}</span>
          );

        })}
      </div>

    </div>
  );
}
