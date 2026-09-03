"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductCard from "@/components/ProductCard";
import { toLegacyProduct, isStorefrontVisible } from "@/lib/products/legacyDisplay";

// Discovery-only recommendation strip, shared by the cart ("Related Products")
// and checkout ("You May Also Like") pages. It is purely additive: it never
// touches cart/checkoutItems/order state. Clicking a card navigates to the
// product page; ProductCard's own Add-to-Cart writes the general `cart` key
// (never `checkoutItems`), so it cannot alter an in-progress checkout.
//
// It fetches the catalog ONCE (client-side — the catalog is small, no index),
// filters to storefront-visible + in-stock products, excludes what's already
// in the cart/checkout, prefers products in the same category as those items,
// then fills from the rest. The set is shuffled and computed ONCE on mount
// (excludeIds are read via a ref) so it does not reshuffle on every render.
// Renders nothing when there are no suitable products.

type Props = {
  heading: string;
  /** Product ids already in the cart/checkout — excluded and used as the
   *  relatedness seed. */
  excludeIds: string[];
  count?: number;
};

type RawProduct = { id: string; data: Record<string, unknown> };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ProductRecommendations({
  heading,
  excludeIds,
  count = 4,
}: Props) {
  const [items, setItems] = useState<
    ReturnType<typeof toLegacyProduct>[]
  >([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const snap = await getDocs(collection(db, "products"));
        const all: RawProduct[] = snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Record<string, unknown>,
        }));

        // excludeIds captured once from the mount render (the cart/checkout is
        // populated synchronously before this component mounts), so the strip
        // is built a single time and never reshuffles on re-render.
        const exclude = new Set(excludeIds || []);

        // Category seed from the products already in the cart/checkout.
        const seedCats = new Set<string>();
        const seedLeaves = new Set<string>();
        for (const { id, data } of all) {
          if (!exclude.has(id)) continue;
          const cat = data.categoryId;
          const sub = data.subCategoryId;
          const leaf = data.leafCategoryId;
          if (typeof cat === "string") seedCats.add(cat);
          if (typeof sub === "string") seedCats.add(sub);
          if (typeof leaf === "string") seedLeaves.add(leaf);
        }

        // Candidates: storefront-visible, in stock, not already in cart/checkout.
        const candidates = all.filter(
          ({ id, data }) =>
            isStorefrontVisible(data) &&
            Number((data as { stock?: unknown }).stock ?? 0) > 0 &&
            !exclude.has(id)
        );

        const isRelated = ({ data }: RawProduct) => {
          const leaf = data.leafCategoryId;
          const cat = data.categoryId;
          const sub = data.subCategoryId;
          return (
            (typeof leaf === "string" && seedLeaves.has(leaf)) ||
            (typeof cat === "string" && seedCats.has(cat)) ||
            (typeof sub === "string" && seedCats.has(sub))
          );
        };

        // Related first (shuffled), then fill from the rest (shuffled).
        const related = shuffle(candidates.filter(isRelated));
        const others = shuffle(candidates.filter((p) => !isRelated(p)));

        const seen = new Set<string>();
        const picked: RawProduct[] = [];
        for (const p of [...related, ...others]) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          picked.push(p);
          if (picked.length >= count) break;
        }

        if (alive) {
          setItems(picked.map((p) => toLegacyProduct(p.id, p.data)));
        }
      } catch (error) {
        console.error("recommendations load failed:", error);
      }
    })();

    return () => {
      alive = false;
    };
    // Intentionally run once on mount; excludeIds are read via excludeRef so a
    // changing cart doesn't reshuffle the strip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-xl sm:text-2xl font-bold mb-4">{heading}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            name={p.name}
            price={p.price}
            image={p.image}
            stock={p.stock}
            vendorId={p.vendorId}
          />
        ))}
      </div>
    </section>
  );
}
