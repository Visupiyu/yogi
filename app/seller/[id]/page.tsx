import { redirect } from "next/navigation";

// The old public seller page (/seller/<uid>) rendered the owner's personal
// name, email and phone straight from vendors_public. The single public
// storefront is now /store/[id] (server-rendered, whitelisted fields only),
// which also redirects uid links to the seller-number URL.
export default async function SellerPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/store/${encodeURIComponent(id)}`);
}
