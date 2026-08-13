import type { Metadata } from "next";

// page.tsx here is a client component ("use client"), which can't export
// metadata directly — a sibling layout.tsx is the supported way to attach
// it without touching the page's own code.
export const metadata: Metadata = {
  title: "Contact Us | YOMICO",
  description:
    "Get in touch with the YOMICO team for support, seller inquiries or general questions.",
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
