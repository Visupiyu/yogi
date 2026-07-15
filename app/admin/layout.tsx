"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex">

      <div className="w-64 min-h-screen bg-black text-white p-5">

        <div className="text-center mb-8">

          <img
            src="/logo.png"
            alt="Yogi Mart"
            className="w-40 mx-auto mb-3"
          />

          <h1 className="text-2xl font-bold">
            Admin Panel
          </h1>

        </div>

        <div className="space-y-3">

          <Link
            href="/admin"
            className="block px-4 py-3 rounded-xl hover:bg-gray-800"
          >
            Dashboard
          </Link>

          <Link
            href="/admin/orders"
            className="block px-4 py-3 rounded-xl hover:bg-gray-800"
          >
            Orders
          </Link>

          <Link
            href="/admin/users"
            className="block px-4 py-3 rounded-xl hover:bg-gray-800"
          >
            Users
          </Link>

          <Link
            href="/admin/vendors"
            className="block px-4 py-3 rounded-xl hover:bg-gray-800"
          >
            Vendors
          </Link>

          <button
            onClick={async () => {

              await signOut(auth);

              localStorage.removeItem("admin");

              window.location.href = "/admin/login";

            }}
            className="w-full text-left px-4 py-3 rounded-xl hover:bg-red-600"
          >
            Logout
          </button>

        </div>

      </div>

      <div className="flex-1">

        {children}

      </div>

    </div>
  );
}