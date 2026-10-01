import type { Metadata } from "next";

// Search results are for people, not the index (also sent as X-Robots-Tag).
export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
