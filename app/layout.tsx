"use client";

import React from "react";

import "./globals.css";

import Navbar
from "@/components/Navbar";

import {
  usePathname
} from "next/navigation";
import MobileBottomNav
from "@/components/MobileBottomNav";

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

    <html lang="en">

      <body>

        {!isSellerPage && (
          <Navbar />
        )}

        {children}
       <MobileBottomNav />
      </body>

    </html>

  );

}