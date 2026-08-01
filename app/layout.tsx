import type { Metadata, Viewport } from "next";

import "./globals.css";



import { cn } from "@/lib/utils";

import { Toaster } from "sonner";

import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  metadataBase: new URL("https://yomico.in"),

  alternates: {
    canonical: "https://yomico.in",
  },

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
    url: "https://yomico.in",
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
  url: "https://yomico.in",
  siteName: "YOMICO",
  type: "website",
  locale: "en_IN",
  images: [
    {
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "YOMICO",
    },
  ],
},
twitter: {
  card: "summary_large_image",
  title: "YOMICO",
  description: "India's Modern Multi-Vendor Marketplace",
  images: ["/og-image.png"],
},
icons: {
  icon: "/favicon.ico",
  apple: "/apple-touch-icon.png",
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
    <html lang="en">
      <body
        className="
          bg-gradient-to-br
          from-green-50
          via-white
          to-blue-50
          min-h-screen
        "
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