"use client";

import Image from "next/image";

export default function InvoiceHeader() {

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
            TAX INVOICE
          </h2>

          <p className="text-sm mt-2">
            Original for Recipient
          </p>

        </div>

      </div>

      {/* Company Information */}

      <table className="w-full border-collapse">

        <tbody>

          <tr>

            <td className="border border-black p-1 font-semibold w-1/6">
              Company
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
              GSTIN
            </td>

            <td className="border border-black p-1">
              24ABCDE1234F1Z5
            </td>

          </tr>

          <tr>

           <td className="border border-black p-1 font-semibold w-1/6">
              Email
            </td>

            <td className="border border-black p-1">
              support@yomico.in
            </td>

          </tr>

          <tr>

          <td className="border border-black p-1 font-semibold w-1/6">
              Website
            </td>

            <td className="border border-black p-1">
              www.yomico.in
            </td>

          </tr>

        </tbody>

      </table>

    </div>

  );

}