"use client";

import Link from "next/link";

const actions = [
  {
    title: "Add Product",
    icon: "➕",
    href: "/seller/products/add",
    color: "bg-blue-500",
  },
  {
    title: "My Products",
    icon: "📦",
    href: "/seller/products",
    color: "bg-green-500",
  },
  {
    title: "Orders",
    icon: "📋",
    href: "/seller/orders",
    color: "bg-purple-500",
  },
  {
    title: "Inventory",
    icon: "📦",
    href: "/seller/inventory",
    color: "bg-orange-500",
  },
  {
    title: "Payouts",
    icon: "💰",
    href: "/seller/payouts",
    color: "bg-emerald-600",
  },
  {
    title: "Reports",
    icon: "📊",
    href: "/seller/reports",
    color: "bg-pink-500",
  },
  {
    title: "Questions",
    icon: "❓",
    href: "/seller/questions",
    color: "bg-cyan-500",
  },
  {
    title: "AI Assistant",
    icon: "🤖",
    href: "/seller/assistant",
    color: "bg-indigo-600",
  },
];

export default function QuickActions() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-bold">
        Quick Actions
      </h2>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group rounded-xl border p-5 transition hover:shadow-lg hover:-translate-y-1"
          >
            <div
              className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white ${action.color}`}
            >
              {action.icon}
            </div>

            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">
              {action.title}
            </h3>

            <p className="mt-2 text-sm text-gray-500">
              Open {action.title}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}