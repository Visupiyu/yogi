export default function DealStrip() {
  const deals = [
    "🔥 Welcome Offer 10% OFF",
    "🚚 Free Delivery Above ₹499",
    "💳 COD Available",
    "🛍 Multi-Vendor Marketplace",
    "⭐ Trusted Sellers",
  ];

  return (
    <div className="bg-gradient-to-r from-green-600 via-green-500 to-blue-600 text-white">
      <div className="max-w-screen-2xl mx-auto flex gap-8 overflow-x-auto px-4 py-2 font-semibold whitespace-nowrap scrollbar-hide">
        {deals.map((deal) => (
          <span key={deal}>{deal}</span>
        ))}
      </div>
    </div>
  );
}
