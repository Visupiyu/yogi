// The admin sidebar (app/admin/layout.tsx — the same list on desktop and in
// the mobile drawer). Dependency-free so tests can check it.
//
// Every entry is an existing page under app/admin; access to all of them is
// decided by the admin layout's server check, not by this list.

export type AdminNavItem = { href: string; label: string; icon: string };

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/analytics", label: "Analytics", icon: "📈" },
  { href: "/admin/reports", label: "Reports", icon: "📄" },
  { href: "/admin/ai-assistant", label: "AI Assistant", icon: "🤖" },
  { href: "/admin/orders", label: "Orders", icon: "📦" },
  { href: "/admin/returns", label: "Returns", icon: "↩️" },
  { href: "/admin/refunds", label: "Refunds", icon: "💸" },
  { href: "/admin/products", label: "Products", icon: "🏷️" },
  { href: "/admin/users", label: "Admin Access", icon: "👥" },
  { href: "/admin/customers", label: "Customers", icon: "🧑" },
  { href: "/admin/account-deletions", label: "Account Deletions", icon: "🗑" },
  { href: "/admin/vendors", label: "Vendors", icon: "🏬" },
  { href: "/admin/kyc", label: "Vendor KYC", icon: "🪪" },
  { href: "/admin/business-requests", label: "Business Changes", icon: "📝" },
  { href: "/admin/seller-inquiries", label: "Seller Inquiries", icon: "📨" },
  { href: "/admin/payouts", label: "Seller Payouts", icon: "💰" },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: "🏦" },
  { href: "/admin/coupons", label: "Coupons", icon: "🎟" },
  { href: "/admin/delivery", label: "Delivery", icon: "🚚" },
  { href: "/admin/delivery/control-tower", label: "Control Tower", icon: "🗼" },
  { href: "/admin/delivery/persons", label: "Delivery Persons", icon: "🛵" },
  { href: "/admin/delivery/applications", label: "Freelancer Applications", icon: "🧑‍💼" },
  { href: "/admin/delivery/company-applications", label: "Company Applications", icon: "🏢" },
  { href: "/admin/delivery-companies", label: "Delivery Companies", icon: "🏭" },
  { href: "/admin/delivery-partners", label: "Delivery Partners (Legacy)", icon: "🛵" },
  { href: "/admin/notifications", label: "Notifications", icon: "🔔" },
  { href: "/admin/support", label: "Support", icon: "🎫" },
  { href: "/admin/reviews", label: "Reviews", icon: "⭐" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

/** `pathname` is `href` itself or a page below it ("/admin/delivery/x"), never a sibling ("/admin/delivery-companies"). */
function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The ONE entry to highlight: the most specific href the path is under. So
 * /admin/delivery/control-tower highlights only "Control Tower", and
 * /admin/delivery-companies never highlights "Delivery". "/admin" itself is
 * matched only exactly (every admin page is under it).
 */
export function activeAdminHref(pathname: string, items: readonly AdminNavItem[] = ADMIN_NAV): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: string | null = null;
  for (const { href } of items) {
    const match = href === "/admin" ? path === "/admin" : isUnder(path, href);
    if (match && (!best || href.length > best.length)) best = href;
  }
  return best;
}
