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
  "/delivery",
];

// Vendor/delivery-partner auth pages hide the customer navbar (its Login
// button confuses sellers/partners trying to use their own login form) but
// still get a minimal branded header instead of no header at all.
const MINIMAL_HEADER_PREFIXES = [
  "/vendor-login",
  "/vendor-register",
  "/vendor-forgot-password",
  "/sell",
  "/delivery-login",
];

// Matches the prefix as a whole path segment, not a raw string prefix —
// otherwise "/sell" would also match "/seller-agreement" and "/seller"
// would also match "/seller-agreement", both of which should behave like
// an ordinary page (e.g. /terms, /privacy-policy), not the seller funnel.
function pathMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";

  const hideChrome = HIDE_CHROME_PREFIXES.some((prefix) =>
    pathMatches(pathname, prefix)
  );

  const minimalHeader = MINIMAL_HEADER_PREFIXES.some((prefix) =>
    pathMatches(pathname, prefix)
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