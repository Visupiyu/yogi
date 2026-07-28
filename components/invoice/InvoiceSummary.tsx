"use client";

interface InvoiceSummaryProps {
  subtotal: number;
  gst: number;
  shipping: number;
  discount: number;
  grandTotal: number;
}

export default function InvoiceSummary({
  subtotal,
  gst,
  shipping,
  discount,
  grandTotal,
}: InvoiceSummaryProps) {

  return (

  <div className="w-full mt-1">

    {/* Order Summary */}

    <div>

      <h2 className="text-lg font-bold mb-2">
        Order Summary
      </h2>

     <table className="w-full border-2 border-black border-collapse text-sm">

        <tbody>

          <tr>
            <td className="border border-black p-1 font-semibold">
              Subtotal
            </td>
            <td className="border border-black p-1 text-right">
              ₹{subtotal.toLocaleString("en-IN",{
                minimumFractionDigits:2,
                maximumFractionDigits:2,
              })}
            </td>
          </tr>

          <tr>
            <td className="border border-black p-1 font-semibold">
              GST (18%)
            </td>
            <td className="border border-black p-1 text-right">
              ₹{gst.toLocaleString("en-IN",{
                minimumFractionDigits:2,
                maximumFractionDigits:2,
              })}
            </td>
          </tr>

          <tr>
            <td className="border border-black p-1 font-semibold">
              Shipping
            </td>
            <td className="border border-black p-1 text-right">
              ₹{shipping.toLocaleString("en-IN",{
                minimumFractionDigits:2,
                maximumFractionDigits:2,
              })}
            </td>
          </tr>

          <tr>
            <td className="border border-black p-1 font-semibold">
              Discount
            </td>
            <td className="border border-black p-1 text-right text-red-600">
              - ₹{discount.toLocaleString("en-IN",{
                minimumFractionDigits:2,
                maximumFractionDigits:2,
              })}
            </td>
          </tr>

          <tr className="bg-green-100 h-12">
            <td className="border-2 border-black p-2 font-bold">
              Grand Total
            </td>
            <td className="border-2 border-black p-2 text-right text-xl font-bold text-green-700">
              ₹{grandTotal.toLocaleString("en-IN",{
                minimumFractionDigits:2,
                maximumFractionDigits:2,
              })}
            </td>
          </tr>

        </tbody>

      </table>

    </div>

    {/* Empty space for Payment Information */}

    <div id="payment-section"></div>

  </div>

);
}