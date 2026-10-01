import type { Metadata } from "next";

// /store (all stores) is a client page, so its metadata lives here. Individual
// stores (/store/[id]) set their own in their page.
export const metadata: Metadata = {
  title: "All Stores",
  description: "Explore stores and discover products from trusted sellers on YOMICO.",
  alternates: { canonical: "/store" },
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
