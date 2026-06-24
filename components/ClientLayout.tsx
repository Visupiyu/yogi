"use client";

import { usePathname } from "next/navigation";

import TopStrip from "@/components/TopStrip";
import Navbar from "@/components/Navbar";
import MobileBottomNav from "@/components/MobileBottomNav";

import QueryProvider from "@/components/providers/QueryProvider";

export default function ClientLayout({
  children,
}:{
  children: React.ReactNode;
}) {

  const pathname =
    usePathname();

  const isSellerPage =

    pathname.startsWith(
      "/seller"
    );

  return (

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

  );

}