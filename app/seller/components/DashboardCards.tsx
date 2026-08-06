"use client";

interface DashboardCardsProps {
  totalProducts?: number;
  totalOrders?: number;
  pendingOrders?: number;
  earnings?: number;
  commissionPaid?: number;
  netEarnings?: number;
}

export default function DashboardCards({
  totalProducts = 0,
  totalOrders = 0,
  pendingOrders = 0,
  earnings = 0,
  commissionPaid = 0,
  netEarnings = 0,
}: DashboardCardsProps) {
  const cards = [
    {
      title: "Products",
      value: totalProducts,
      color: "bg-blue-500",
      icon: "📦",
    },
    {
      title: "Orders",
      value: totalOrders,
      color: "bg-green-500",
      icon: "📋",
    },
    {
      title: "Pending",
      value: pendingOrders,
      color: "bg-yellow-500",
      icon: "⏳",
    },
    {
      title: "Revenue",
      value: `₹${earnings.toLocaleString()}`,
      color: "bg-purple-500",
      icon: "💰",
    },
    {
      title: "Commission",
      value: `₹${commissionPaid.toLocaleString()}`,
      color: "bg-red-500",
      icon: "💸",
    },
    {
      title: "Net Earnings",
      value: `₹${netEarnings.toLocaleString()}`,
      color: "bg-emerald-600",
      icon: "🏆",
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                {card.title}
              </p>

              <h2 className="mt-2 text-3xl font-bold text-gray-900">
                {card.value}
              </h2>
            </div>

            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white ${card.color}`}
            >
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}