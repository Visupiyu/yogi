export interface AnalyticsSummary {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  totalSellers: number;
  totalProducts: number;
}

export function calculateRevenue(
  orders: { total: number }[]
): number {
  return orders.reduce(
    (sum, order) => sum + order.total,
    0
  );
}

export function calculateAverageOrderValue(
  orders: { total: number }[]
): number {

  if (!orders.length) return 0;

  return calculateRevenue(orders) / orders.length;

}

export function calculateGrowth(
  current: number,
  previous: number
): number {

  if (previous === 0) return 100;

  return (
    ((current - previous) / previous) * 100
  );

}

export function topSellingProducts<
  T extends { sales: number }
>(
  products: T[],
  limit = 5
): T[] {

  return [...products]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);

}