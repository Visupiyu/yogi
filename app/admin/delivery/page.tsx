"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";

type Delivery = {
  id: string;
  orderNumber?: string;
  customerName: string;
  phone?: string;
  address?: string;
  courierPartner?: string;
  deliveryCompanyId?: string;
  deliveryCompanyName?: string;
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
  const [partners, setPartners] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  // Per-order Step-1 company choice, so each card independently narrows its
  // Step-2 person list. Keyed by order id; "" means "Unassigned (no company)".
  const [companyByOrder, setCompanyByOrder] = useState<Record<string, string>>(
    {}
  );

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
          deliveryCompanyId: data.deliveryCompanyId || "",
          deliveryCompanyName: data.deliveryCompanyName || "",
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

      const partnerSnapshot = await getDocs(
        collection(db, "deliveryPartners")
      );
      const partnerList: any[] = [];
      partnerSnapshot.forEach((docSnap) =>
        partnerList.push({ id: docSnap.id, ...docSnap.data() })
      );
      setPartners(partnerList);

      const companySnapshot = await getDocs(
        collection(db, "deliveryCompanies")
      );
      const companyList: any[] = [];
      companySnapshot.forEach((docSnap) =>
        companyList.push({ id: docSnap.id, ...docSnap.data() })
      );
      companyList.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );
      setCompanies(companyList);
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

  const assignPartner = async (
    orderId: string,
    partner: any,
    company: any | null
  ) => {
    try {
      // Assigning a partner is orthogonal to fulfillment status — writing
      // "Assigned" into order.status overwrote the real Pending/Packed/
      // Shipped/etc value, which the customer's tracking bar doesn't
      // recognize and so visually reset back to step 1 ("Placed").
      //
      // deliveryPartnerId/deliveryPartnerName stay exactly as the /delivery
      // dashboard expects (it queries deliveryPartnerId == partnerId). The
      // company fields are additive context for admin screens only.
      await updateDoc(doc(db, "orders", orderId), {
        deliveryCompanyId: company?.id || "",
        deliveryCompanyName: company?.name || "",
        deliveryPartnerId: partner.id,
        deliveryPartnerName: partner.name,
        assignedAt: serverTimestamp(),
      });
      loadDeliveries();

      await addDoc(collection(db, "notifications"), {
        role: "admin",
        title: "Delivery Assigned",
        message: `${partner.name}${
          company?.name ? ` (${company.name})` : ""
        } has been assigned to Order ${orderId.slice(0, 8)}.`,
        type: "delivery",
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
    }
  };

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
                    {order.deliveryCompanyName && (
                      <p>🏢 {order.deliveryCompanyName}</p>
                    )}
                    <p>📍 {order.trackingNumber}</p>
                  <p>📅{" "} {order.expectedDelivery &&  order.expectedDelivery !== "-"
                   ? new Date(order.expectedDelivery).toLocaleDateString("en-IN") : "-"} </p>
                    {/* Step 1 — pick a delivery company (or Unassigned). */}
                    <select
                      className="mt-3 border rounded-lg p-2 w-full"
                      value={companyByOrder[order.id] ?? "__CHOOSE__"}
                      disabled={order.status === "Delivered"}
                      onChange={(e) =>
                        setCompanyByOrder((prev) => ({
                          ...prev,
                          [order.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="__CHOOSE__">1️⃣ Select Company</option>
                      {companies
                        .filter((c) => c.status === "Active")
                        .map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      <option value="">Unassigned (no company)</option>
                    </select>

                    {/* Step 2 — pick a person from that company (only its
                        Active partners appear). Shown once a company is chosen. */}
                    {companyByOrder[order.id] !== undefined && (() => {
                      const chosenCompanyId = companyByOrder[order.id];
                      const eligible = partners.filter((p) => {
                        if (p.status !== "Active") return false;
                        return chosenCompanyId
                          ? p.companyId === chosenCompanyId
                          : !p.companyId;
                      });
                      const company =
                        companies.find((c) => c.id === chosenCompanyId) || null;
                      return (
                        <select
                          className="mt-2 border rounded-lg p-2 w-full"
                          value=""
                          disabled={order.status === "Delivered"}
                          onChange={(e) => {
                            const partner = partners.find(
                              (p) => p.id === e.target.value
                            );
                            if (
                              partner &&
                              confirm(
                                `Assign ${partner.name}${
                                  company ? ` (${company.name})` : ""
                                } to this order?`
                              )
                            ) {
                              assignPartner(order.id, partner, company);
                            }
                          }}
                        >
                          <option value="">2️⃣ Select Delivery Person</option>
                          {eligible.map((partner) => (
                            <option key={partner.id} value={partner.id}>
                              {partner.name}
                            </option>
                          ))}
                        </select>
                      );
                    })()}

                    {companyByOrder[order.id] !== undefined &&
                      partners.filter((p) => {
                        if (p.status !== "Active") return false;
                        return companyByOrder[order.id]
                          ? p.companyId === companyByOrder[order.id]
                          : !p.companyId;
                      }).length === 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          No active delivery persons in this company.
                        </p>
                      )}
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
