"use client";

import Image from "next/image";
import { SITE_HOST, SUPPORT_EMAIL } from "@/lib/siteConfig";

// The document title comes from lib/invoiceTax (TAX INVOICE / BILL OF SUPPLY /
// ORDER SUMMARY, by the seller's recorded GST status). YOMICO is the
// marketplace here, not the supplier — the seller's GSTIN, when one applies,
// is printed in the seller block (InvoiceVendor). No GSTIN is printed for the
// marketplace: none is configured, and a placeholder must never appear.
export default function InvoiceHeader({
  title = "ORDER SUMMARY",
  subtitle = "Not a tax invoice",
}: {
  title?: string;
  subtitle?: string;
}) {

  return (

    <div className="border-2 border-black rounded-lg overflow-hidden mb-3">

      {/* Top Header */}

      <div className="flex flex-col md:flex-row justify-between items-center bg-green-700 text-white p-1">

        <div className="flex items-center gap-1">

          <Image
            src="/logo.png"
            alt="YOMICO"
            width={70}
            height={70}
            priority
          />

          <div>

            <h1 className="text-base font-bold tracking-wide">
              YOMICO
            </h1>

            <p className="text-sm">
              India's Multi Vendor Marketplace
            </p>

          </div>

        </div>

        <div className="text-center md:text-right mt-4 md:mt-0">

          <h2 className="text-base font-extrabold">
            {title}
          </h2>

          <p className="text-sm mt-2">
            {subtitle}
          </p>

        </div>

      </div>

      {/* Company Information */}

      <table className="w-full border-collapse">

        <tbody>

          <tr>

            <td className="border border-black p-1 font-semibold w-1/6">
              Marketplace
            </td>

            <td className="border border-black p-1">
              YOMICO Marketplace Pvt. Ltd.
            </td>

          </tr>

          <tr>

            <td className="border border-black p-1 font-semibold w-1/6">
              Address
            </td>

            <td className="border border-black p-1">
              Vadodara, Gujarat, India
            </td>

          </tr>

          <tr>

           <td className="border border-black p-1 font-semibold w-1/6">
              Email
            </td>

            <td className="border border-black p-1">
              {SUPPORT_EMAIL}
            </td>

          </tr>

          <tr>

          <td className="border border-black p-1 font-semibold w-1/6">
              Website
            </td>

            <td className="border border-black p-1">
              {SITE_HOST}
            </td>

          </tr>

        </tbody>

      </table>

    </div>

  );

}