"use client";

interface Props {
  totalProducts: number;
  totalOrders: number;
  pendingOrders: number;
  earnings: number;
  commissionPaid: number;
  netEarnings: number;
}

export default function SellerDashboardCards({
  totalProducts,
  totalOrders,
  pendingOrders,
  earnings,
  commissionPaid,
  netEarnings,
}: Props) {
  const stats = [
    {
      label: "Products",
      value: totalProducts,
      subtitle: "Live Products",
      color: "text-blue-600",
      icon: "📦",
    },
    {
      label: "Total Orders",
      value: totalOrders,
      subtitle: "",
      color: "text-green-600",
      icon: "🛒",
    },
    {
      label: "Pending Orders",
      value: pendingOrders,
      subtitle: "",
      color: "text-yellow-500",
      icon: "⏳",
    },
    {
      label: "Earnings",
      value: `₹${earnings.toLocaleString("en-IN")}`,
      subtitle: "",
      color: "text-pink-600",
      icon: "💰",
    },
    {
      label: "Commission",
      value: `₹${commissionPaid.toLocaleString("en-IN")}`,
      subtitle: "",
      color: "text-orange-600",
      icon: "📊",
    },
    {
      label: "Net Earnings",
      value: `₹${netEarnings.toLocaleString("en-IN")}`,
      subtitle: "",
      color: "text-green-700",
      icon: "✅",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white rounded-2xl shadow-sm hover:shadow-md transition p-5"
        >
          <div className="text-2xl mb-2">{s.icon}</div>

          <p className="text-gray-500 text-sm">
            {s.label}
          </p>

          <p className="text-xs text-gray-400 mt-1">
            {s.subtitle}
          </p>

          <h2
            className={`text-2xl font-bold mt-1 break-all ${s.color}`}
          >
            {s.value}
          </h2>
        </div>
      ))}
    </div>
  );
}