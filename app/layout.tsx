"use client";

import TopStrip from "@/components/TopStrip";
import React from "react";

import "./globals.css";

import Navbar
from "@/components/Navbar";

import {
  usePathname
} from "next/navigation";
import MobileBottomNav
from "@/components/MobileBottomNav";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

import QueryProvider from "@/components/providers/QueryProvider";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


export default function RootLayout({

  children

}:{

  children: React.ReactNode

}) {


  const pathname =
    usePathname();

  const isSellerPage =

    pathname.startsWith(
      "/seller"
    );

  return (

    <html lang="en" className={cn("font-sans", geist.variable)}>


<body
  className="
    bg-gradient-to-br
    from-green-50
    via-white
    to-blue-50
    min-h-screen
  "
>

  <QueryProvider>

    {!isSellerPage && (

      <>

        <TopStrip />

        <Navbar />

      </>

    )}

    {children}

    <MobileBottomNav />

  </QueryProvider>

</body>

</html>

  );

}