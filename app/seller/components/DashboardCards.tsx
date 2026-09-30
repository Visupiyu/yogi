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
      // Orders where this seller's OWN items are still Confirmed (see
      // app/api/seller/analytics). "Pending" would be a permanently-zero
      // card, since sellers never see orders in that state.
      title: "To Pack",
      value: pendingOrders,
      color: "bg-yellow-500",
      icon: "⏳",
    },
    {
      // Booked item value on orders that are not cancelled — activity, not
      // money owed. "Total Earnings" below is the settled figure.
      title: "Booked Sales",
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
      title: "Total Earnings",
      value: `₹${netEarnings.toLocaleString()}`,
      color: "bg-emerald-600",
      icon: "🏆",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-2xl border bg-white p-4 sm:p-6 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-500">
                {card.title}
              </p>

              <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 break-words">
                {card.value}
              </h2>
            </div>

            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl text-white ${card.color}`}
            >
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}