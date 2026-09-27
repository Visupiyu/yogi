import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { loadPublicStorefront } from "@/lib/storefront/storefrontServer";
import StorefrontView from "@/components/storefront/StorefrontView";

// Public seller storefront: /store/SELLER00001.
//
// Rendered on the SERVER from lib/storefront (Admin SDK), so the browser
// receives only the whitelisted public shape — never the seller's email,
// phone, address, bank/KYC data, money data or uid. The store is shown only
// while the seller is admin-Approved (vendors.status); products follow the
// shared visibility rule (lib/products/visibility.ts).
//
// Older links used the seller uid (/store/<uid>); they redirect to the
// seller-number URL.

const load = cache((id: string) => loadPublicStorefront(getAdminDb(), id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await load(id);
  if (result.kind !== "ok") return { title: "Store not found | YOMICO" };
  const { storefront } = result;
  return {
    title: `${storefront.storeName} | YOMICO`,
    description: storefront.about ? storefront.about.slice(0, 160) : `Shop ${storefront.storeName} on YOMICO.`,
  };
}

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(id);
  if (result.kind === "redirect") redirect(`/store/${encodeURIComponent(result.sellerNumber)}`);
  if (result.kind !== "ok") notFound();
  return <StorefrontView storefront={result.storefront} />;
}
