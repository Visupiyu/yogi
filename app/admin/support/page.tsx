"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-ticket reply drafts, keyed by ticket id
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      const snapshot = await getDocs(collection(db, "tickets"));
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      items.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      setTickets(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "tickets", id), { status });
      setTickets(
        tickets.map((ticket) =>
          ticket.id === id ? { ...ticket, status } : ticket
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  const updateReply = async (id: string) => {
    const text = (replies[id] || "").trim();
    if (!text) {
      alert("Write a reply first.");
      return;
    }
    setSavingId(id);
    try {
      await updateDoc(doc(db, "tickets", id), { adminReply: text });
      setTickets(
        tickets.map((ticket) =>
          ticket.id === id ? { ...ticket, adminReply: text } : ticket
        )
      );
      setReplies((prev) => ({ ...prev, [id]: "" }));
      alert("Reply saved.");
    } catch (error) {
      console.error(error);
      alert("Failed to save reply.");
    } finally {
      setSavingId("");
    }
  };

  const badge = (status: string) =>
    status === "Resolved"
      ? "bg-green-100 text-green-700"
      : status === "In Progress"
      ? "bg-blue-100 text-blue-700"
      : status === "Closed"
      ? "bg-gray-200 text-gray-700"
      : "bg-yellow-100 text-yellow-700";

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* HEADER (sibling of the content, not a wrapper) */}
        <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Support Tickets</h1>
          <p className="opacity-90">Manage customer support requests</p>
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : tickets.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center text-gray-500">
            No support tickets.
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow overflow-x-auto p-6">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left py-4 px-3">Customer</th>
                  <th className="text-left">Subject</th>
                  <th className="text-left">Category</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Admin Reply</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="border-b align-top hover:bg-gray-50"
                  >
                    <td className="py-4 px-3">
                      {ticket.customerName || "-"}
                      {ticket.userEmail && (
                        <p className="text-xs text-gray-400">
                          {ticket.userEmail}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[220px]">{ticket.subject || "-"}</td>
                    <td>{ticket.category || "-"}</td>
                    <td>
                      <div className="flex flex-col gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold w-fit ${badge(
                            ticket.status || "Open"
                          )}`}
                        >
                          {ticket.status || "Open"}
                        </span>
                        <select
                          value={ticket.status || "Open"}
                          onChange={(e) =>
                            updateStatus(ticket.id, e.target.value)
                          }
                          className="border p-2 rounded-lg"
                        >
                          <option>Open</option>
                          <option>In Progress</option>
                          <option>Resolved</option>
                          <option>Closed</option>
                        </select>
                      </div>
                    </td>
                    <td className="min-w-[240px]">
                      {ticket.adminReply && (
                        <p className="text-xs text-gray-500 mb-2 bg-gray-50 rounded-lg p-2">
                          Last reply: {ticket.adminReply}
                        </p>
                      )}
                      <textarea
                        placeholder="Reply to customer"
                        value={replies[ticket.id] || ""}
                        onChange={(e) =>
                          setReplies((prev) => ({
                            ...prev,
                            [ticket.id]: e.target.value,
                          }))
                        }
                        className="border p-2 rounded-lg w-full min-w-[220px]"
                      />
                      <button
                        onClick={() => updateReply(ticket.id)}
                        disabled={savingId === ticket.id}
                        className="mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg transition"
                      >
                        {savingId === ticket.id ? "Saving..." : "Save Reply"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
