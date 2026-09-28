"use client";

import Link from "next/link";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";
import type { SellerRecentOrder } from "@/lib/sellerAnalytics/sellerAnalytics";

// The five most recent orders come from the server (app/api/seller/analytics):
// this seller's own item value and their own stage, the customer's name only.
// The row shows the human order number — the old "#<first 8 characters of the
// order id>" was, for Pay on Delivery orders, the start of the customer's uid.

type RecentOrdersProps = {
  orders: SellerRecentOrder[];
  loading: boolean;
};

export default function RecentOrders({ orders, loading }: RecentOrdersProps) {
  return (
  <div className="rounded-2xl border bg-white p-6 shadow-sm">

    <div className="mb-6 flex items-center justify-between">

      <h2 className="text-xl font-bold">
        📋 Recent Orders
      </h2>

      <Link
        href="/seller/orders"
        className="text-blue-600 hover:underline"
      >
        View All
      </Link>

    </div>

    {loading ? (

      <div className="py-10 text-center text-gray-500">
        Loading...
      </div>

    ) : orders.length === 0 ? (

      <div className="py-10 text-center text-gray-500">
        No recent orders found.
      </div>

    ) : (

      <div className="overflow-x-auto">

        <table className="w-full">

          <thead>

            <tr className="border-b">

              <th className="p-3 text-left">Order</th>

              <th className="p-3 text-left">Customer</th>

              <th className="p-3 text-left">Amount</th>

              <th className="p-3 text-left">Status</th>

            </tr>

          </thead>

          <tbody>

            {orders.map((order) => (

              <tr
                key={order.orderId}
                className="border-b hover:bg-gray-50"
              >

                <td className="p-3 font-medium">
                  <Link
                    href={`/seller/orders/${encodeURIComponent(order.orderId)}`}
                    className="text-blue-600 hover:underline"
                  >
                    {order.orderRef}
                  </Link>
                </td>

                <td className="p-3">
                  {order.customerName}
                </td>

                <td className="p-3">
                  ₹{Number(order.amount || 0).toLocaleString("en-IN")}
                </td>

                <td className="p-3">

                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium
                    ${
                      order.stage === "Delivered"
                        ? "bg-green-100 text-green-700"
                        : order.stage === "Cancelled"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {fulfilmentStageLabel(order.stage)}
                  </span>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    )}

  </div>
);
}
