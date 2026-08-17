"use client";

interface InvoiceItemsProps {
  order: any;
}

export default function InvoiceItems({
  order,
}: InvoiceItemsProps) {

  return (

    <div className="mt-1">

      <h2 className="text-base font-bold mb-2">
        Invoice Items
      </h2>

      <div className="overflow-x-auto">
      <table className="w-full border-2 border-black border-collapse">

        <thead>

          <tr className="bg-gray-100">

            <th className="border border-black p-1 w-12">
              Sl
            </th>

            <th className="border border-black p-1 text-left">
              Product Name
            </th>

            <th className="border border-black p-1">
              HSN / SKU
            </th>

            <th className="border border-black p-1">
              Qty
            </th>

            <th className="border border-black p-1">
              Unit Price
            </th>

            <th className="border border-black p-1">
              GST %
            </th>

            <th className="border border-black p-1">
              Discount
            </th>

            <th className="border border-black p-1">
              Total
            </th>

          </tr>

        </thead>

        <tbody>

          {order.items?.length ? (

            order.items.map(
              (
                item: any,
                index: number
              ) => {

                const qty =
                  Number(item.qty || 1);

                const price =
                  Number(item.price || 0);

                const gst =
                  Number(item.gst || 18);

                const discount =
                  Number(item.discount || 0);

                const total =
                  (price * qty) - discount;

                return (

                  <tr
                    key={index}
                    className="hover:bg-gray-50"
                  >

                    <td className="border border-black p-1 text-center">
                      {index + 1}
                    </td>

                    <td className="border border-black p-1">

                      <div className="font-semibold">
                        {item.name}
                      </div>

                      {item.description && (

                        <div className="text-xs text-gray-500 mt-1">
                          {item.description}
                        </div>

                      )}

                    </td>

                    <td className="border border-black p-1 text-center">
                      {item.hsn || item.sku || "-"}
                    </td>

                    <td className="border border-black p-1 text-center">
                      {qty}
                    </td>

                    <td className="border border-black p-1 text-right">
                      ₹
                      {price.toLocaleString(
                        "en-IN"
                      )}
                    </td>

                    <td className="border border-black p-1 text-center">
                      {gst}%
                    </td>

                    <td className="border border-black p-1 text-right">
                      ₹
                      {discount.toLocaleString(
                        "en-IN"
                      )}
                    </td>

                    <td className="border border-black p-1 text-right font-bold">
                      ₹
                      {total.toLocaleString(
                        "en-IN"
                      )}
                    </td>

                  </tr>

                );

              }

            )

          ) : (

            <tr>

              <td
                colSpan={8}
                className="border border-black p-1 text-center text-gray-500"
              >
                No items found.
              </td>

            </tr>

          )}

        </tbody>

      </table>
      </div>

    </div>

  );

}