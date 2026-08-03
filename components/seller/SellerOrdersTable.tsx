"use client";

interface Order {
  id: string;
  customer: string;
  amount: number;
  status: string;
  date: string;
}

interface Props {
  orders: Order[];
  updateOrderStatus: (
    id: string,
    status: string
  ) => void;
}

export default function SellerOrdersTable({
  orders,
  updateOrderStatus,
}: Props) {
  return (
    <div
      id="orders"
      className="bg-white p-6 rounded-2xl shadow-sm mt-8"
    >
      <h2 className="text-2xl font-bold mb-6">
        Recent Orders
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full">

          <thead>
            <tr className="border-b text-left text-gray-500 text-sm">
              <th className="py-3">Order ID</th>
              <th className="py-3">Customer</th>
              <th className="py-3">Amount</th>
              <th className="py-3">Status</th>
              <th className="py-3">Date</th>
            </tr>
          </thead>

          <tbody>

            {orders.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-8 md:py-12 text-gray-500"
                >
                  🛒 No Orders Yet
                  <br />
                  Orders from customers will appear here.
                </td>
              </tr>
            )}

            {orders.map((order) => (

              <tr
                key={order.id}
                className="border-b"
              >

                <td className="py-4">
                  {order.id?.slice(0, 8)}
                </td>

                <td>
                  {order.customer}
                </td>

                <td className="font-semibold">
                  ₹{order.amount?.toLocaleString("en-IN")}
                </td>

                <td>

                  <div className="mb-2">

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold
                      ${
                        order.status === "Delivered"
                          ? "bg-green-100 text-green-700"
                          : order.status === "Pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {order.status}
                    </span>

                  </div>

                  <select
                    disabled={
                      order.status === "Cancelled"
                    }
                    value={order.status}
                    onChange={(e) =>
                      updateOrderStatus(
                        order.id,
                        e.target.value
                      )
                    }
                    className="border p-2 rounded-lg outline-none"
                  >
                    <option>Pending</option>
                    <option>Confirmed</option>
                    <option>Packed</option>
                    <option>Shipped</option>
                    <option>Delivered</option>
                    <option>Cancelled</option>
                  </select>

                </td>

                <td>
                  {order.date}
                </td>

              </tr>

            ))}

          </tbody>

        </table>
      </div>
    </div>
  );
}