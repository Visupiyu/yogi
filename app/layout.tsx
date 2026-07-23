import type { Metadata } from "next";

import "./globals.css";

import { Geist } from "next/font/google";

import { cn } from "@/lib/utils";

import { Toaster } from "sonner";

import ClientLayout from "@/components/ClientLayout";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://yomico.in"),

  alternates: {
    canonical: "https://yomico.in",
  },

  title: {
    default: "YOMICO",
    template: "%s | YOMICO",
  },
  description:
    "YOMICO is India's modern multi-vendor marketplace for groceries, electronics, fashion, furniture, beauty, home essentials and more.",

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable)}
    >
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