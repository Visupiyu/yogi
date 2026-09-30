"use client";

import Link from "next/link";
import Image from "next/image";
import { useQueries } from "@tanstack/react-query";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { findNodeByName, isTopLevelCategory } from "@/lib/catalog";
import { toLegacyProduct } from "@/lib/products/legacyDisplay";
import { isProductVisible } from "@/lib/products/visibility";
import { MIN_PRODUCTS_TO_SHOW_SECTION } from "@/lib/storefront/homepageMerchandising";

// "Explore by Category" (formerly "Recommended For You"): NOT personalised —
// the newest products in each of these category groups. A group's card is
// shown only when it has at least MIN_PRODUCTS_TO_SHOW_SECTION (4) visible
// products to fill its 2x2 grid; the section hides when no card qualifies.

const collections = [
  {
    title: "Electronics",
    category: "Electronics",
    link: "/category/Electronics",
  },
  {
    title: "Grocery",
    category: "Grocery",
    link: "/category/Grocery",
  },
  {
    title: "Fashion",
    category: "Fashion",
    link: "/category/Fashion",
  },
  {
    title: "Beauty",
    category: "Beauty",
    link: "/category/Beauty",
  },
];

async function getCategoryProducts(category) {

  const node = findNodeByName(category);
  if (!node) return [];

  const top = isTopLevelCategory(node);
  const snapshot = await getDocs(
    query(
      collection(db, "products"),
      top
        ? where("categoryId", "==", node.id)
        : where("subCategoryId", "==", node.id),
      orderBy("createdAt", "desc"),
      // Over-fetch; hidden products (pending/rejected/blocked) are dropped
      // below BEFORE slicing.
      limit(16)
    )
  );

  let docs = snapshot.docs;
  if (!top) {
    // Also products filed with this node as their LEAF category — the same
    // rule the homepage category rows and search use (subCategoryId OR
    // leafCategoryId). Equality-only query, so no extra composite index;
    // merged, de-duplicated and re-sorted newest first here.
    const leafSnap = await getDocs(
      query(collection(db, "products"), where("leafCategoryId", "==", node.id), limit(16))
    );
    const seen = new Set(docs.map((d) => d.id));
    const createdMs = (d) => d.get("createdAt")?.toMillis?.() ?? 0;
    docs = [...docs, ...leafSnap.docs.filter((d) => !seen.has(d.id))].sort(
      (a, b) => createdMs(b) - createdMs(a)
    );
  }

  return docs
    .filter((doc) => isProductVisible(doc.data()))
    .slice(0, 4)
    .map((doc) => toLegacyProduct(doc.id, doc.data()));

}

export default function RecommendedProducts() {

  const queries = useQueries({

    queries: collections.map((item) => ({

      queryKey: ["recommended", item.category],

      queryFn: () => getCategoryProducts(item.category),

      staleTime: 1000 * 60 * 5,

      retry: 2,

    })),

  });

  const loading = queries.some((q) => q.isLoading);

  const error = queries.some((q) => q.error);

  const fetching = queries.some((q) => q.isFetching);

  const retryFailed = () => {
    queries.forEach((q) => {
      if (q.error) q.refetch();
    });
  };

  if (loading) {

    return (

      <section className="max-w-7xl mx-auto px-4 py-8">

        <div className="animate-pulse">

          <div className="h-8 w-60 bg-gray-200 rounded mb-6"/>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

            {[...Array(4)].map((_,index)=>(

              <div
                key={index}
                className="bg-white rounded-3xl shadow p-5"
              >

                <div className="grid grid-cols-2 gap-3">

                  {[...Array(4)].map((_,i)=>(

                    <div
                      key={i}
                      className="h-28 rounded-xl bg-gray-200"
                    />

                  ))}

                </div>

              </div>

            ))}

          </div>

        </div>

      </section>

    );

  }

  if (error) {

    return (

      <section className="max-w-7xl mx-auto px-4 py-8">

        <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center">

          <h2 className="font-bold text-red-600">

            Unable to load recommendations.

          </h2>

          <button
            onClick={retryFailed}
            disabled={fetching}
            className="mt-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-semibold transition"
          >
            {fetching ? "Retrying..." : "Retry"}
          </button>

        </div>

      </section>

    );

  }

  const groups = collections
    .map((item, index) => ({ item, products: queries[index].data || [] }))
    .filter(({ products }) => products.length >= MIN_PRODUCTS_TO_SHOW_SECTION);

  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="max-w-7xl mx-auto px-2 py-4">

  <h2 className="text-2xl md:text-3xl font-bold mb-3">
    🧭 Explore by Category
  </h2>

  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">

    {groups.map(({ item, products }) => {

      return (

        <div
          key={item.category}
          className="bg-white rounded-3xl shadow-lg border border-gray-100 p-2 sm:p-3 hover:shadow-xl transition"
        >

          <div className="flex items-center justify-between mb-2">

            <h3 className="font-bold text-lg">
              {item.title}
            </h3>

          </div>

          <div className="grid grid-cols-2 gap-1">

            {products.map((product) => (

              <Link
                key={product.id}
                href={`/product/${product.id}`}
              >

                <div className="group">

                  <div className="relative h-32 sm:h-48 rounded-xl overflow-hidden bg-gray-50">

                    <Image
                      src={product.image || "/placeholder.png"}
                      alt={product.name}
                      fill
                      sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 160px"
                      className="
                      object-contain
                      p-1
                      group-hover:scale-105
                      transition
                      "
                    />

                  </div>

                  <p
                    className="
                    text-xs
                    mt-2
                    line-clamp-2
                    text-gray-700
                    group-hover:text-blue-600
                    "
                  >
                    {product.name}
                  </p>

                </div>

              </Link>

            ))}

          </div>

          <Link
            href={item.link}
            className="
            inline-block
            mt-1
            text-blue-600
            font-semibold
            hover:text-orange-500
            "
          >
            See More →
          </Link>

        </div>

      );

    })}

  </div>

</section>
  );
}