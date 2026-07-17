"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, "adminUsers"));
      const items: User[] = [];
      snapshot.forEach((docSnap) => {
        const data: any = docSnap.data();
        items.push({
          id: docSnap.id,
          name: data.name || "Admin",
          email: data.email || "-",
          role: data.role || "Admin",
          status: data.status || "Active",
        });
      });
      setUsers(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (user: User) => {
    try {
      await updateDoc(doc(db, "adminUsers", user.id), {
        status: user.status === "Active" ? "Inactive" : "Active",
      });
      toast.success("Staff updated.");
      loadUsers();
    } catch (error) {
      console.error(error);
      toast.error("Update failed.");
    }
  };

  const deleteStaff = async (id: string) => {
    if (!confirm("Delete this staff member?")) return;
    try {
      await deleteDoc(doc(db, "adminUsers", id));
      toast.success("Staff deleted.");
      loadUsers();
    } catch (error) {
      console.error(error);
      toast.error("Delete failed.");
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Name", "Email", "Role", "Status"],
      ...users.map((u) => [u.name, u.email, u.role, u.status]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admin-users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = users.filter(
    (user) =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
  );

  const activeStaff = users.filter((u) => u.status === "Active").length;
  const inactiveStaff = users.filter((u) => u.status === "Inactive").length;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto p-8">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Admin Staff Management</h1>
          <p className="opacity-90">
            Manage Yogi Mart administrators and staff
          </p>
        </div>

        <div className="flex justify-end mb-6">
          <button
            onClick={exportCSV}
            className="bg-green-600 hover:bg-green-700 transition text-white px-6 py-3 rounded-xl"
          >
            📥 Export CSV
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-xl font-bold">Total Staff</h2>
            <p className="text-4xl font-bold text-blue-600 mt-2">
              {users.length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-xl font-bold">Active Staff</h2>
            <p className="text-4xl font-bold text-green-600 mt-2">
              {activeStaff}
            </p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-xl font-bold">Inactive Staff</h2>
            <p className="text-4xl font-bold text-red-600 mt-2">
              {inactiveStaff}
            </p>
          </div>
        </div>

        <input
          type="text"
          placeholder="Search Name or Email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border p-4 rounded-2xl mb-6"
        />

        {loading ? (
          <div className="bg-white rounded-2xl shadow p-10 text-center">
            Loading Users...
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow p-6 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left py-4 px-3">Name</th>
                  <th className="text-left py-4">Email</th>
                  <th className="text-left py-4">Role</th>
                  <th className="text-left py-4">Status</th>
                  <th className="text-left py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-500">
                      No staff found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-gray-50">
                      <td className="py-4 px-3">{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            user.status === "Active"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleStatus(user)}
                            className={`px-3 py-1 rounded-lg text-white transition ${
                              user.status === "Active"
                                ? "bg-yellow-600 hover:bg-yellow-700"
                                : "bg-green-600 hover:bg-green-700"
                            }`}
                          >
                            {user.status === "Active"
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                          <button
                            onClick={() => deleteStaff(user.id)}
                            className="bg-red-600 hover:bg-red-700 transition text-white px-3 py-1 rounded-lg"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
