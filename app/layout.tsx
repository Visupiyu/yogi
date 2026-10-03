import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/siteConfig";

import "./globals.css";



import { cn } from "@/lib/utils";

import { Toaster } from "sonner";

import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  // No site-wide canonical here: a root canonical is inherited by every page
  // without its own and would point all of them at the home page. Pages that are
  // indexable set their own (home, product, category, store, static pages).

  title: {
  default:
  "YOMICO – India's Modern Multi-Vendor Marketplace",
    template: "%s | YOMICO",
  },
  description:
"Shop groceries, electronics, fashion, beauty, furniture, home essentials and more from trusted sellers across India with fast delivery and secure payments.",
  keywords: [
    "YOMICO",
    "Yomico",
    "Online Shopping India",
    "Multi Vendor Marketplace",
    "Ecommerce",
    "Groceries",
    "Electronics",
    "Fashion",
    "Furniture",
    "Home Essentials",
    "Beauty",
    "Shopping",
  ],
  category: "E-commerce",
  authors: [
  {
    name: "YOMICO",
    url: SITE_URL,
  },
],
creator: "YOMICO",

publisher: "YOMICO",

  robots: {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
},

  manifest: "/manifest.json",

  openGraph: {
  title: "YOMICO",
  description: "India's Modern Multi-Vendor Marketplace",
  url: SITE_URL,
  siteName: "YOMICO",
  type: "website",
  locale: "en_IN",
  // /og-image.png never existed (every share preview 404'd). The logo is the
  // real 1024x1024 brand asset in /public.
  images: [
    {
      url: "/logo.png",
      width: 1024,
      height: 1024,
      alt: "YOMICO",
    },
  ],
},
twitter: {
  card: "summary",
  title: "YOMICO",
  description: "India's Modern Multi-Vendor Marketplace",
  images: ["/logo.png"],
},
icons: {
  icon: "/favicon.ico",
  apple: "/logo.png",
},
};
export const viewport: Viewport = {
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  return (
    <html lang="en" className="overflow-x-hidden">
      <body
        className="
          bg-gradient-to-br
          from-green-50
          via-white
          to-blue-50
          min-h-screen
          overflow-x-hidden
        "
        suppressHydrationWarning
      >
        <ClientLayout>
          {children}

          <Toaster
            position="top-right"
            richColors
            closeButton
          />
        </ClientLayout>
      </body>
    </html>
  );
}