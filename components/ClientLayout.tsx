"use client";

import { usePathname } from "next/navigation";
import TopStrip from "@/components/TopStrip";
import Navbar from "@/components/Navbar";
import MobileBottomNav from "@/components/MobileBottomNav";
import QueryProvider from "@/components/providers/QueryProvider";

const HIDE_CHROME_PREFIXES = [
  "/seller",
  "/admin",
];

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";

  const hideChrome = HIDE_CHROME_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  return (
    <QueryProvider>
      {!hideChrome && (
        <>
          <TopStrip />
          <Navbar />
        </>
      )}

      {children}

      {!hideChrome && <MobileBottomNav />}
    </QueryProvider>
  );
}