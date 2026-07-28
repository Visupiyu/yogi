"use client";

interface InvoiceFinanceProps {
  order: any;
  type: "customer" | "seller" | "admin";
}

export default function InvoiceFinance({
  order,
  type,
}: InvoiceFinanceProps) {

  const commission =
    Number(order.commission || 0);

  const sellerEarning =
    Number(order.sellerEarning || 0);

  return (

    <div className="mt-8">

      <h2 className="text-base font-bold mb-3">
        Financial Information
      </h2>

      <table className="w-full border-2 border-black border-collapse">

        <tbody>

          <tr>

            <td className="border border-black p-1 font-semibold w-1/2">
              Order Value
            </td>

            <td className="border border-black p-1 text-right font-semibold">
              ₹
              {Number(
                order.finalTotal ||
                order.total ||
                0
              ).toLocaleString(
                "en-IN",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}
            </td>

          </tr>

          <tr>

            <td className="border border-black p-1 font-semibold">
              Marketplace Commission
            </td>

            <td className="border border-black p-1 text-right text-red-600 font-bold">
              ₹
              {commission.toLocaleString(
                "en-IN",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}
            </td>

          </tr>

          <tr>

            <td className="border border-black p-1 font-semibold">
              Vendor Earnings
            </td>

            <td className="border border-black p-1 text-right text-green-700 font-bold">
              ₹
              {sellerEarning.toLocaleString(
                "en-IN",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}
            </td>

          </tr>

          {type === "admin" && (

            <>

              <tr>

                <td className="border border-black p-1 font-semibold">
                  Platform Revenue
                </td>

                <td className="border border-black p-1 text-right font-bold">
                  ₹
                  {commission.toLocaleString(
                    "en-IN",
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                </td>

              </tr>

              <tr>

                <td className="border border-black p-1 font-semibold">
                  Vendor ID
                </td>

                <td className="border border-black p-1">
                  {order.vendorId || "-"}
                </td>

              </tr>

              <tr>

                <td className="border border-black p-1 font-semibold">
                  Vendor Name
                </td>

                <td className="border border-black p-1">
                  {order.vendorName || "-"}
                </td>

              </tr>

            </>

          )}

        </tbody>

      </table>

    </div>

  );

}