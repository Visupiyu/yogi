// YOMICO's seller commission — a fixed business rule, not a setting.
//
// YOMICO charges sellers NO commission: the rate is permanently 0% and every
// commission amount is ₹0. There is no category, product, seller or admin-
// configurable rate, and settings/global's legacy commissionEnabled /
// commissionRate fields are deliberately ignored. The only seller-side charge
// is the delivery cost on free-delivery orders (lib/deliveryRules.ts), which
// is a separate concept and never a commission.
//
// Dependency-free so the browser, server routes and payout maths can all
// import the same constants.

export const YOMICO_COMMISSION_RATE = 0;
export const YOMICO_COMMISSION_AMOUNT = 0;
