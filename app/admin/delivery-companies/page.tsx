"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Admin management of delivery COMPANIES (e.g. Blue Dart). A company groups
// delivery persons: a partner (app/admin/delivery-partners) carries a companyId,
// and order assignment (app/admin/delivery) is Company -> Person -> Order.
//
// Minimal CRUD: list / add / edit / activate-deactivate. Auto-id documents.
// Admin-only, per firestore.rules' deliveryCompanies match block.
// ---------------------------------------------------------------------------

type DeliveryCompany = {
  id: string;
  name: string;
  status: string;
  createdAt?: unknown;
};

export default function DeliveryCompaniesPage() {
  const [companies, setCompanies] = useState<DeliveryCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const snapshot = await getDocs(collection(db, "deliveryCompanies"));
      const items: DeliveryCompany[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          name: typeof data.name === "string" ? data.name : "",
          status: typeof data.status === "string" ? data.status : "Active",
          createdAt: data.createdAt,
        });
      });
      items.sort((a, b) => a.name.localeCompare(b.name));
      setCompanies(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setEditingId("");
    setName("");
  };

  const saveCompany = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Enter a company name.");
      return;
    }
    if (trimmed.length > 120) {
      alert("Company name is too long.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "deliveryCompanies", editingId), {
          name: trimmed,
        });
      } else {
        await addDoc(collection(db, "deliveryCompanies"), {
          name: trimmed,
          status: "Active",
          createdAt: serverTimestamp(),
        });
      }
      clearForm();
      await loadCompanies();
    } catch (error) {
      console.error(error);
      alert("Failed to save the company. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (company: DeliveryCompany) => {
    try {
      await updateDoc(doc(db, "deliveryCompanies", company.id), {
        status: company.status === "Active" ? "Inactive" : "Active",
      });
      await loadCompanies();
    } catch (error) {
      console.error(error);
    }
  };

  const editCompany = (company: DeliveryCompany) => {
    setEditingId(company.id);
    setName(company.name);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">🏢 Delivery Companies</h1>
          <p className="mt-2 opacity-90">
            Manage delivery companies. Assign persons to a company under Delivery
            Partners.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-lg p-6 mb-8 flex flex-col sm:flex-row gap-4">
          <input
            placeholder="Company Name (e.g. Blue Dart)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded-xl p-3 flex-1"
          />
          <button
            onClick={saveCompany}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 transition text-white rounded-xl px-6 py-3 font-semibold"
          >
            {saving ? "Saving…" : editingId ? "💾 Update Company" : "➕ Add Company"}
          </button>
          {editingId && (
            <button
              onClick={clearForm}
              className="border border-gray-300 rounded-xl px-6 py-3 font-semibold"
            >
              Cancel
            </button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl p-10 text-center">Loading...</div>
        ) : (
          <div className="space-y-3">
            {companies.map((company) => (
              <div
                key={company.id}
                className="bg-white rounded-3xl shadow p-5 flex justify-between items-center gap-4"
              >
                <div>
                  <h2 className="text-lg font-bold">{company.name}</h2>
                  <span
                    className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-semibold ${
                      company.status === "Active"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {company.status}
                  </span>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button
                    onClick={() => editCompany(company)}
                    className="bg-blue-600 hover:bg-blue-700 transition text-white px-5 py-2 rounded-xl"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleStatus(company)}
                    className={`px-5 py-2 rounded-xl text-white transition ${
                      company.status === "Active"
                        ? "bg-yellow-600 hover:bg-yellow-700"
                        : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    {company.status === "Active" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}

            {companies.length === 0 && (
              <div className="bg-white rounded-3xl p-10 text-center shadow">
                🏢 No delivery companies yet. Add one above.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
