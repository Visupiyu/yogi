import type {
  Metadata
} from "next";

import "./globals.css";

import { Geist }
from "next/font/google";

import { cn }
from "@/lib/utils";

import ClientLayout
from "@/components/ClientLayout";

const geist = Geist({

  subsets:["latin"],

  variable:"--font-sans"

});

export const metadata: Metadata = {

  title: {

    default:
      "Yogi Mart",

    template:
      "%s | Yogi Mart",

  },

  description:
    "Buy groceries, electronics, fashion, furniture and more from local vendors on Yogi Mart.",

  keywords: [

    "Yogi Mart",

    "Online Shopping",

    "Multi Vendor Marketplace",

    "Grocery Delivery",

    "Electronics",

    "Fashion",

    "Furniture",

  ],

  manifest:
    "/manifest.json",

    openGraph: {

  title:
    "Yogi Mart",

  description:
    "Multi Vendor Marketplace",

  type:
    "website",

},

twitter: {

  card:
    "summary_large_image",

  title:
    "Yogi Mart",

  description:
    "Multi Vendor Marketplace",

},

};

export default function RootLayout({

  children,

}:{

  children: React.ReactNode;

}) {

  return (

    <html
      lang="en"
      className={cn(
        "font-sans",
        geist.variable
      )}
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

        </ClientLayout>

      </body>

    </html>

  );

}