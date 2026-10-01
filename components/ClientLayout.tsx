"use client";

import { usePathname } from "next/navigation";
import TopStrip from "@/components/TopStrip";
import Navbar from "@/components/Navbar";
import MinimalHeader from "@/components/MinimalHeader";
import MobileBottomNav from "@/components/MobileBottomNav";
import QueryProvider from "@/components/providers/QueryProvider";
import EmailVerificationBanner from "@/components/EmailVerificationBanner";

const HIDE_CHROME_PREFIXES = [
  "/seller",
  "/admin",
  "/invoice",
  "/delivery",
  // Has its own full saffron header + hero built into the page — the
  // shared MinimalHeader would stack a second, redundant bar above it.
  "/vendor-register",
  // Delivery-partner registration pages carry their own branded header/hero
  // (same reasoning as vendor-register). Whole-segment matches, so
  // "/delivery-company-register" is distinct from "/delivery-company".
  "/delivery-register",
  "/delivery-company-register",
  // The Delivery Company operator console has its OWN header/nav and auth gate;
  // the customer TopStrip/Navbar/MobileBottomNav and the customer email-
  // verification banner must never appear inside it. Whole-segment match, so it
  // covers /delivery-company and /delivery-company/* but NOT
  // /delivery-company-register (already listed above).
  "/delivery-company",
  // The Delivery Person web app (login + person console) has its OWN shell;
  // the customer chrome/verification banner must not appear inside it. Note
  // "/delivery" above does NOT cover "/delivery-app" (whole-segment match).
  "/delivery-app",
];

// Vendor/delivery-partner auth pages hide the customer navbar (its Login
// button confuses sellers/partners trying to use their own login form) but
// still get a minimal branded header instead of no header at all.
const MINIMAL_HEADER_PREFIXES = [
  "/vendor-login",
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
      {/* Keyboard users can jump past the header/navigation. Visible only on focus.
          Staff consoles (hideChrome) have their own layout and landmarks. */}
      {!hideChrome && (
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[10000] focus:rounded-lg focus:bg-green-700 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>
      )}
      {!hideChrome && !minimalHeader && (
        <>
          <TopStrip />
          <Navbar />
          <EmailVerificationBanner />
        </>
      )}

      {minimalHeader && <MinimalHeader />}

      {hideChrome ? (
        children
      ) : (
        <main id="main-content" tabIndex={-1} className="outline-none">
          {children}
        </main>
      )}

      {!hideChrome && !minimalHeader && <MobileBottomNav />}
    </QueryProvider>
  );
}