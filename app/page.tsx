import type { Metadata } from "next";
import HomePage from "@/components/home/HomePage";
import { SITE_URL, jsonLdString } from "@/lib/seo";

// Home. The interactive storefront is HomePage (client); this server wrapper gives
// the home its own canonical URL (the root layout no longer sets one, which used
// to canonicalise EVERY page to the home) and site-level structured data.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const siteJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "YOMICO",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "YOMICO",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  },
];

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(siteJsonLd) }} />
      <HomePage />
    </>
  );
}
