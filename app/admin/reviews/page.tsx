"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const loadReviews = async () => {
    try {
      const snapshot = await getDocs(collection(db, "productReviews"));
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      items.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      setReviews(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  // firestore.rules already allows admin to delete a review — nothing in
  // the app actually exposed that, so a bad or abusive review had no path
  // to removal short of hand-editing Firestore. Deleting also has to walk
  // the product's rating/reviewCount back down, or the aggregate rating
  // stays inflated/deflated by the removed review forever.
  const deleteReview = async (review: any) => {
    if (!confirm(`Delete this review by ${review.customerName || "customer"}?`))
      return;

    setDeletingId(review.id);
    try {
      await deleteDoc(doc(db, "productReviews", review.id));

      try {
        const productRef = doc(db, "products", review.productId);
        const remainingReviews = reviews.filter(
          (r) => r.productId === review.productId && r.id !== review.id
        );
        const newCount = remainingReviews.length;
        const newRating =
          newCount === 0
            ? 0
            : remainingReviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
              newCount;

        await updateDoc(productRef, {
          rating: newRating,
          reviewCount: newCount,
        });
      } catch (aggregateError) {
        console.error("Failed to update product rating:", aggregateError);
      }

      setReviews((prev) => prev.filter((r) => r.id !== review.id));
    } catch (error) {
      console.error(error);
      alert("Failed to delete review.");
    } finally {
      setDeletingId("");
    }
  };

  const filtered = reviews.filter(
    (r) =>
      (r.productName || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.customerName || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.review || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">⭐ Product Reviews</h1>
          <p className="opacity-90">Moderate customer reviews</p>
        </div>

        <input
          type="text"
          placeholder="Search by product, customer or review text..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded-3xl shadow-lg p-4 mb-6"
        />

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center text-gray-500">
            No reviews found.
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((review) => (
              <div
                key={review.id}
                className="bg-white rounded-3xl shadow p-6 flex justify-between items-start gap-4"
              >
                <div>
                  <p className="font-bold">{review.productName || "-"}</p>
                  <p className="text-sm text-gray-500">
                    {review.customerName || "Customer"} ·{" "}
                    {"★".repeat(review.rating || 0)}
                    {"☆".repeat(5 - (review.rating || 0))}
                  </p>
                  <p className="mt-2 text-gray-700">{review.review}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {review.createdAt?.seconds
                      ? new Date(
                          review.createdAt.seconds * 1000
                        ).toLocaleDateString("en-IN")
                      : "-"}
                  </p>
                </div>

                <button
                  onClick={() => deleteReview(review)}
                  disabled={deletingId === review.id}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 transition text-white px-4 py-2 rounded-lg shrink-0"
                >
                  {deletingId === review.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
