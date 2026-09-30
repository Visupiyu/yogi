import { notFound } from "next/navigation";
import { findNodeByName } from "@/lib/catalog/categoryUtils";
import CategoryPageClient from "./CategoryPageClient";

// /category/[name] — a server component in front of the client page so an
// UNKNOWN category name is a real 404 (Next's not-found), instead of looking
// like a valid category that happens to be empty. A known name — including a
// real category with no products yet — renders the client page, which shows
// its own empty state. Resolution is the same findNodeByName lookup the
// client page, the homepage rows and search use.
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;

  let decoded: string;
  try {
    decoded = decodeURIComponent(name).trim();
  } catch {
    notFound();
  }

  if (!decoded || !findNodeByName(decoded)) {
    notFound();
  }

  return <CategoryPageClient />;
}
