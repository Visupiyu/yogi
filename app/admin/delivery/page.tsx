"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";
import AssignDelivery from "@/app/admin/delivery/_components/AssignDelivery";

type Delivery = {
  id: string;
  orderNumber?: string;
  customerName: string;
  phone?: string;
  address?: string;
  courierPartner?: string;
  deliveryPartnerId?: string;
  deliveryPartnerName?: string;
  trackingNumber?: string;
  expectedDelivery?: string;
  assignedAt?: any;
  status: string;
  createdAt?: any;
};

export default function AdminDeliveryPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  useEffect(() => {
    loadDeliveries();
  }, []);

  const loadDeliveries = async () => {
    try {
      const snapshot = await getDocs(
        query(collection(db, "orders"), orderBy("createdAt", "desc"))
      );
      const items: Delivery[] = [];
      snapshot.forEach((docSnap) => {
        const data: any = docSnap.data();
        items.push({
          id: docSnap.id,
          orderNumber: data.orderNumber || "",
          customerName: data.customerName || "Customer",
          phone: data.phone || "",
          address: data.address || "",
          courierPartner: data.courierPartner || "Not Assigned",
          deliveryPartnerId: data.deliveryPartnerId || "",
          deliveryPartnerName: data.deliveryPartnerName || "",
          trackingNumber: data.trackingNumber || "-",
          expectedDelivery: data.expectedDelivery || "-",
          assignedAt: data.assignedAt || null,
          status: data.status || "Pending",
          createdAt: data.createdAt,
        });
      });
      setDeliveries(items);
      // Legacy note: this page no longer reads the legacy `deliveryPartners`
      // collection or assigns deliveries. Delivery assignment now happens in the
      // Delivery Control Tower (the current delivery engine).
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const assignedCount = deliveries.filter((d) => !!d.deliveryPartnerId).length;
  const outForDeliveryCount = deliveries.filter(
    (d) => d.status === "Out For Delivery"
  ).length;
  const deliveredCount = deliveries.filter(
    (d) => d.status === "Delivered"
  ).length;
  const failedCount = deliveries.filter(
    (d) => d.status === "Delivery Failed"
  ).length;

  const filtered = deliveries.filter((item) => {
  const searchMatch =
  item.customerName.toLowerCase().includes(search.toLowerCase()) ||
  item.id.toLowerCase().includes(search.toLowerCase()) ||
  (item.trackingNumber || "")
    .toLowerCase()
    .includes(search.toLowerCase());
    const statusMatch =
      statusFilter === "All" ||
      (statusFilter === "Assigned"
        ? !!item.deliveryPartnerId
        : item.status === statusFilter);
    return searchMatch && statusMatch;
  });

  const exportCSV = () => {
    const rows = [
      ["Order ID", "Customer", "Partner", "Status", "Tracking", "Expected Delivery"],
      ...filtered.map((item) => [
        item.id,
        item.customerName,
        item.deliveryPartnerName || item.courierPartner || "",
        item.status,
        item.trackingNumber || "",
        item.expectedDelivery || "",
      ]),
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
   a.download = `delivery-report-${new Date()
  .toISOString()
  .split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Assignment uses the CURRENT delivery engine (YOMICO persons + delivery
            companies), not the legacy `deliveryPartners` list. */}
        <div className="mb-6 rounded-2xl border border-teal-300 bg-teal-50 p-4">
          <p className="text-sm font-semibold text-teal-900">Delivery assignment</p>
          <p className="mt-1 text-sm text-teal-800">
            Assign each shipment to a YOMICO delivery person/freelancer, or hand it to a delivery company. This uses the
            current YOMICO delivery engine — the legacy partner list is no longer used. When you hand a shipment to a
            company, the company assigns its own rider(s) in the Company Console. You can monitor live progress in the{" "}
            <Link href="/admin/delivery/control-tower" className="font-semibold underline">
              Control Tower
            </Link>
            .
          </p>
        </div>

        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">🚚 Delivery Management</h1>
          <p className="mt-2 opacity-90">Manage all marketplace deliveries</p>

          <div className="mt-5 flex gap-3">
            <button
              onClick={loadDeliveries}
              className="bg-white text-indigo-700 px-5 py-2 rounded-xl font-semibold hover:bg-gray-100"
            >
              🔄 Refresh Deliveries
            </button>
            <button
              onClick={exportCSV}
              className="bg-green-600 text-white px-5 py-2 rounded-xl font-semibold hover:bg-green-700"
            >
              📥 Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-8">
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <p className="text-gray-500">Total Deliveries</p>
            <h2 className="text-3xl font-bold">{deliveries.length}</h2>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <p className="text-gray-500">Assigned</p>
            <h2 className="text-3xl font-bold text-indigo-600">{assignedCount}</h2>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <p className="text-gray-500">
              {fulfilmentStageLabel("Out For Delivery")}
            </p>
            <h2 className="text-3xl font-bold text-blue-600">
              {outForDeliveryCount}
            </h2>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <p className="text-gray-500">
              {fulfilmentStageLabel("Delivered")}
            </p>
            <h2 className="text-3xl font-bold text-green-600">{deliveredCount}</h2>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <p className="text-gray-500">Failed</p>
            <h2 className="text-3xl font-bold text-red-600">{failedCount}</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <input
            placeholder="Search customer or order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-2xl p-4"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-2xl p-4"
          >
            <option value="All">All</option>
            <option value="Assigned">Assigned</option>
            <option value="Packed">{fulfilmentStageLabel("Packed")}</option>
            <option value="Shipped">{fulfilmentStageLabel("Shipped")}</option>
            <option value="Out For Delivery">
              {fulfilmentStageLabel("Out For Delivery")}
            </option>
            <option value="Delivered">
              {fulfilmentStageLabel("Delivered")}
            </option>
            <option value="Delivery Failed">Delivery Failed</option>
          </select>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl p-10 text-center">Loading deliveries...</div>
        ) : (
          <div className="space-y-4">
            {filtered.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-3xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition duration-300 p-6"
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <Link href={`/delivery/${order.id}`}>
                      <h2 className="text-xl font-bold hover:text-indigo-600">
                        {order.customerName}
                      </h2>
                    </Link>
                    <p className="text-gray-500">Order #{order.orderNumber || order.id.slice(0, 8)}</p>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          order.status === "Delivered"
                            ? "bg-green-100 text-green-700"
                            : order.status === "Out For Delivery"
                            ? "bg-blue-100 text-blue-700"
                            : order.status === "Delivery Failed"
                             ? "bg-red-600 text-white"
                            : order.status === "Cancelled"
                            ? "bg-gray-200 text-gray-600"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {fulfilmentStageLabel(order.status)}
                      </span>
                      {order.deliveryPartnerId && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                          Partner Assigned
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p>🚚 {order.deliveryPartnerName || order.courierPartner || "Not Assigned"}</p>
                    <p>📍 {order.trackingNumber}</p>
                  <p>📅{" "} {order.expectedDelivery &&  order.expectedDelivery !== "-"
                   ? new Date(order.expectedDelivery).toLocaleDateString("en-IN") : "-"} </p>
                    <AssignDelivery orderId={order.id} />
                  </div>
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="bg-white rounded-3xl p-10 text-center shadow text-gray-500">
                No deliveries found.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-center py-8 text-gray-500">
       Delivery Management powered by YOMICO
      </div>
    </div>
  );
}
