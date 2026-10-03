import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteConfig";

// Private areas are not for search engines: the account, cart/checkout, auth,
// staff consoles and the API. (The same prefixes also send X-Robots-Tag: noindex —
// next.config.ts — because robots.txt only stops crawling, not indexing of a
// linked URL.) Public catalogue, stores, search-free pages and policies stay open.
const PRIVATE_PATHS = [
  "/api/",
  "/admin",
  "/seller/",
  "/delivery/",
  "/delivery-app",
  "/delivery-company",
  "/cart",
  "/checkout",
  "/orders",
  "/profile",
  "/settings",
  "/addresses",
  "/notifications",
  "/support",
  "/chat",
  "/invoice",
  "/returns",
  "/wishlist",
  "/compare",
  "/search",
  "/login",
  "/signup",
  "/forgot-password",
  "/vendor-login",
  "/vendor-forgot-password",
  "/delivery-login",
  "/delivery-forgot-password",
  "/admin-login",
  "/admin-forgot-password",
  "/track-order",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: PRIVATE_PATHS,
    },

    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
