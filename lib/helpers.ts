export function formatCurrency(
  amount: number
): string {

  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
    }
  ).format(amount);

}

export function formatDate(
  date: Date
): string {

  return date.toLocaleDateString(
    "en-IN"
  );

}

export function generateId(
  prefix = "YMC"
): string {

  return `${prefix}-${Date.now()}`;

}

export function capitalize(
  text: string
): string {

  return text.charAt(0).toUpperCase() +
    text.slice(1);

}

export function slugify(
  text: string
): string {

  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

}