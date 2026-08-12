"use client";

import { usePathname } from "next/navigation";
import TopStrip from "@/components/TopStrip";
import Navbar from "@/components/Navbar";
import MinimalHeader from "@/components/MinimalHeader";
import MobileBottomNav from "@/components/MobileBottomNav";
import QueryProvider from "@/components/providers/QueryProvider";

const HIDE_CHROME_PREFIXES = [
  "/seller",
  "/admin",
  "/invoice",
];

// Vendor auth pages hide the customer navbar (its Login button confuses
// sellers trying to use the seller login form) but still get a minimal
// branded header instead of no header at all.
const MINIMAL_HEADER_PREFIXES = [
  "/vendor-login",
  "/vendor-register",
  "/vendor-forgot-password",
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

  const minimalHeader = MINIMAL_HEADER_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  return (
    <QueryProvider>
      {!hideChrome && !minimalHeader && (
        <>
          <TopStrip />
          <Navbar />
        </>
      )}

      {minimalHeader && <MinimalHeader />}

      {children}

      {!hideChrome && !minimalHeader && <MobileBottomNav />}
    </QueryProvider>
  );
}