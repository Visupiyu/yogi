"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type SellerInquiry = {
  id: string;
  fullName: string;
  contact: string;
  topic?: string;
  message: string;
  status?: string;
  createdAt?: { seconds: number };
};

export default function AdminSellerInquiriesPage() {
  const [inquiries, setInquiries] = useState<SellerInquiry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInquiries = async () => {
    try {
      const snapshot = await getDocs(collection(db, "sellerInquiries"));

      const items: SellerInquiry[] = [];
      snapshot.forEach((docSnap) => {
        items.push({
          ...(docSnap.data() as Omit<SellerInquiry, "id">),
          id: docSnap.id,
        });
      });

      items.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );

      setInquiries(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await loadInquiries();
    })();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "sellerInquiries", id), { status });
      setInquiries((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item))
      );
    } catch (error) {
      console.error(error);
    }
  };

  const badge = (status: string) =>
    status === "Resolved"
      ? "bg-green-100 text-green-700"
      : status === "In Progress"
      ? "bg-blue-100 text-blue-700"
      : "bg-yellow-100 text-yellow-700";

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Seller Inquiries</h1>
          <p className="opacity-90">
            Questions submitted from the &quot;Sell on YOMICO&quot; page
          </p>
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : inquiries.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center text-gray-500">
            No inquiries yet.
          </div>
        ) : (
          <div className="space-y-4">
            {inquiries.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl shadow p-6">

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-lg">{item.fullName}</h2>
                    <p className="text-sm text-gray-500">{item.contact}</p>
                    {item.topic && (
                      <span className="mt-2 inline-block bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full">
                        {item.topic}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${badge(
                        item.status || "New"
                      )}`}
                    >
                      {item.status || "New"}
                    </span>

                    <select
                      value={item.status || "New"}
                      onChange={(e) => updateStatus(item.id, e.target.value)}
                      className="border p-2 rounded-lg text-sm"
                    >
                      <option>New</option>
                      <option>In Progress</option>
                      <option>Resolved</option>
                    </select>
                  </div>
                </div>

                <p className="mt-4 text-gray-700">{item.message}</p>

                <p className="mt-3 text-xs text-gray-400">
                  {item.createdAt?.seconds
                    ? new Date(item.createdAt.seconds * 1000).toLocaleString()
                    : "-"}
                </p>

              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
