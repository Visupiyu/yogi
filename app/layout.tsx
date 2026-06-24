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

  title:
    "Yogi Mart",

  description:
    "Multi Vendor Marketplace",

  manifest:
    "/manifest.json",

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