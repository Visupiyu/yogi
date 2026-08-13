import type { Metadata } from "next";

// page.tsx here is a client component ("use client"), which can't export
// metadata directly — a sibling layout.tsx is the supported way to attach
// it without touching the page's own code.
export const metadata: Metadata = {
  // Root layout's title template already appends " | YOMICO".
  title: "Sell on YOMICO — Become a Seller",
  description:
    "Start selling on YOMICO's multi-vendor marketplace — reach customers, manage your products and grow your business.",
};

export default function SellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
