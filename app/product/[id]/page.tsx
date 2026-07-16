"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();

  const [product, setProduct] = useState<any>(null);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [showSizeChart, setShowSizeChart] = useState(false);
  const [question, setQuestion] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");

  useEffect(() => {
    async function loadProduct() {
      try {
        const snap = await getDoc(
          doc(db, "products", params.id as string)
        );

        if (snap.exists()) {
          const productData = snap.data();
          const fullProduct: any = { id: snap.id, ...productData };
          setProduct(fullProduct);
          setSelectedImage(
            fullProduct.images?.[0] ||
              fullProduct.image ||
              "/no-image.png"
          );

          const relatedSnap = await getDocs(
            query(
              collection(db, "products"),
              where("category", "==", productData.category)
            )
          );
          const related: any[] = [];
          relatedSnap.forEach((d) => {
            if (d.id !== snap.id) related.push({ id: d.id, ...d.data() });
          });
          setRelatedProducts(related.slice(0, 4));

          const questionSnap = await getDocs(
            query(
              collection(db, "productQuestions"),
              where("productId", "==", snap.id)
            )
          );
          const questionData: any[] = [];
          questionSnap.forEach((d) =>
            questionData.push({ id: d.id, ...d.data() })
          );
          setQuestions(questionData);

          const reviewSnap = await getDocs(
            query(
              collection(db, "productReviews"),
              where("productId", "==", snap.id)
            )
          );
          const reviewData: any[] = [];
          reviewSnap.forEach((d) =>
            reviewData.push({ id: d.id, ...d.data() })
          );
          setReviews(reviewData);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    if (params?.id) loadProduct();
  }, [params]);

  const colors = product?.color
    ? product.color.split(",").map((c: string) => c.trim()).filter(Boolean)
    : [];

  // Filter out empty entries — an empty sizes field can be stored as [""].
  const sizes = (product?.sizes || []).filter(
    (s: string) => s && s.trim()
  );

  // Shared cart logic. Returns false if a required option is missing.
  const addItemToCart = (): boolean => {
    if (sizes.length > 0 && !selectedSize) {
      alert("Please select a size");
      return false;
    }
    if (colors.length > 0 && !selectedColor) {
      alert("Please select a color");
      return false;
    }

    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const index = cart.findIndex(
      (item: any) =>
        item.id === product.id &&
        item.size === selectedSize &&
        item.color === selectedColor
    );

    if (index > -1) {
      cart[index].qty = Math.min(cart[index].qty + 1, product.stock);
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        stock: product.stock,
        qty: 1,
        size: selectedSize,
        color: selectedColor,
        vendorId: product.vendorId,
        vendorName: product.vendorName,
      });
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    window.dispatchEvent(new Event("cartUpdated"));
    return true;
  };

  const addToCart = () => {
    if (addItemToCart()) alert("Added To Cart");
  };

  const buyNow = () => {
    if (addItemToCart()) router.push("/checkout");
  };

  const addToWishlist = () => {
    const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
    const exists = wishlist.find((item: any) => item.id === product.id);
    if (exists) {
      alert("Already In Wishlist");
      return;
    }
    wishlist.push(product);
    localStorage.setItem("wishlist", JSON.stringify(wishlist));
    window.dispatchEvent(new Event("wishlistUpdated"));
    alert("Added To Wishlist");
  };

  const askQuestion = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!question.trim()) {
      alert("Enter a question");
      return;
    }
    try {
      await addDoc(collection(db, "productQuestions"), {
        productId: product.id,
        productName: product.name,
        customerName: user.name || "Customer",
        question,
        answer: "",
        status: "Pending",
        createdAt: new Date(),
      });
      alert("Question submitted");
      setQuestion("");
      window.location.reload();
    } catch (error) {
      console.error(error);
    }
  };

  const submitReview = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!reviewText) {
      alert("Enter review");
      return;
    }
    try {
      await addDoc(collection(db, "productReviews"), {
        productId: product.id,
        productName: product.name,
        customerName: user.name || "Customer",
        userEmail: user.email || "",
        rating,
        review: reviewText,
        createdAt: serverTimestamp(),
      });
      alert("Review Submitted");
      window.location.reload();
    } catch (error) {
      console.error(error);
    }
  };

  const startChat = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user.email) {
      alert("Please Login First");
      router.push("/login");
      return;
    }

    const snapshot = await getDocs(
      query(
        collection(db, "chats"),
        where("customerEmail", "==", user.email),
        where("sellerId", "==", product.vendorId)
      )
    );

    if (!snapshot.empty) {
      router.push(`/chat/${snapshot.docs[0].id}`);
      return;
    }

    const docRef = await addDoc(collection(db, "chats"), {
      customerEmail: user.email,
      customerName: user.name,
      sellerId: product.vendorId,
      sellerName: product.vendorName,
      sellerImage: "",
      customerImage: "",
      productId: product.id,
      productName: product.name,
      lastMessage: "",
      customerUnread: 0,
      sellerUnread: 0,
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
    });

    router.push(`/chat/${docRef.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading Product...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Product Not Found
      </div>
    );
  }

  const hasDiscount = product.mrp && Number(product.mrp) > product.price;
  const discountPercent = hasDiscount
    ? product.discountPercent ||
      Math.round(((product.mrp - product.price) / product.mrp) * 100)
    : 0;
  const savings = hasDiscount ? product.mrp - product.price : 0;

  const avgRating = reviews.length
    ? (
        reviews.reduce((s: number, r: any) => s + (r.rating || 0), 0) /
        reviews.length
      ).toFixed(1)
    : null;
  const starCount = avgRating ? Math.round(Number(avgRating)) : 0;

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-3 pb-32">
        <div className="max-w-7xl mx-auto">
          {/* BREADCRUMB */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 px-1">
            <Link href="/" className="hover:text-green-600">Home</Link>
            <span>/</span>
            <Link
              href={`/category/${encodeURIComponent(product.category || "")}`}
              className="hover:text-green-600"
            >
              {product.category}
            </Link>
            <span>/</span>
            <span className="text-gray-700 line-clamp-1">{product.name}</span>
          </div>

          <div className="bg-white rounded-3xl shadow-sm p-4 md:p-6">
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
              {/* IMAGE GALLERY */}
              <div className="md:sticky md:top-24 self-start">
                <div className="bg-gray-50 rounded-3xl p-4 overflow-hidden">
                  <img
                    src={selectedImage}
                    alt={product.name}
                    className="w-full h-[300px] sm:h-[400px] md:h-[520px] object-contain rounded-2xl transition-transform duration-300 hover:scale-105 cursor-zoom-in"
                  />
                </div>

                <div className="flex justify-center gap-3 mt-4 flex-wrap">
                  {(product.images || [product.image]).map(
                    (img: string, index: number) => (
                      <img
                        key={index}
                        src={img}
                        alt=""
                        onClick={() => setSelectedImage(img)}
                        className={`w-16 h-16 md:w-20 md:h-20 object-cover rounded-xl border-2 cursor-pointer transition ${
                          selectedImage === img
                            ? "border-green-600"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      />
                    )
                  )}
                </div>
              </div>

              {/* DETAILS */}
              <div>
               <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-2">
                  {product.name}
                </h1>

                {/* RATING */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-yellow-500 text-lg">
                    {"★".repeat(starCount)}
                    <span className="text-gray-300">
                      {"★".repeat(5 - starCount)}
                    </span>
                  </span>
                  <span className="text-gray-500 text-sm">
                    {avgRating
                      ? `${avgRating} • ${reviews.length} review${
                          reviews.length > 1 ? "s" : ""
                        }`
                      : "No ratings yet"}
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold mb-4">
                 🔥 Limited Time Deal</div>
                {/* PRICE */}
                <div className="mb-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-green-600 text-4xl font-bold">
                      ₹{product.price?.toLocaleString("en-IN")}
                    </span>
                    {hasDiscount && (
                      <>
                        <span className="text-gray-400 line-through text-lg">
                          ₹{Number(product.mrp).toLocaleString("en-IN")}
                        </span>
                        <span className="bg-red-100 text-red-600 px-2.5 py-1 rounded-full text-sm font-semibold">
                          {discountPercent}% OFF
                        </span>
                      </>
                    )}
                  </div>
                  {hasDiscount && (
                    <p className="text-green-700 font-semibold mt-1">
                      You save ₹{savings.toLocaleString("en-IN")}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Inclusive of all taxes
                  </p>
                </div>

                {/* TRUST CHIPS */}
                <div className="grid grid-cols-2 gap-3 mt-5">
<div className="bg-green-50 rounded-xl p-3 text-center">
🛡
<p className="text-sm font-semibold">
Buyer Protection
</p>
</div>
<div className="bg-blue-50 rounded-xl p-3 text-center">
🔒
<p className="text-sm font-semibold">
Secure Payment
</p>
</div>
<div className="bg-yellow-50 rounded-xl p-3 text-center">
🚚
<p className="text-sm font-semibold">
Fast Delivery
</p>
</div>
<div className="bg-purple-50 rounded-xl p-3 text-center">
↩
<p className="text-sm font-semibold">
Easy Returns
</p>
</div>
</div>
                <div className="flex flex-wrap gap-2 mb-5">
                  <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                    🚚 Free Delivery
                  </span>
                  <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                    🔒 Secure Payment
                  </span>
                  <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-xs font-medium">
                    ↩️ 7-Day Returns
                  </span>
                </div>

                {/* STOCK */}
                <div
                  className={`rounded-xl p-3 mb-5 ${
                    product.stock > 0 ? "bg-green-50" : "bg-red-50"
                  }`}
                >
                  {product.stock > 0 ? (
                    <p className="text-green-700 font-semibold text-sm">
                      ✓ In stock
                      {product.stock <= 5 ? ` — only ${product.stock} left` : ""}
                    </p>
                  ) : (
                    <p className="text-red-600 font-semibold text-sm">
                      Out of stock
                    </p>
                  )}
                </div>

                {/* SIZE SELECTOR */}
                {sizes.length > 0 && (
                  <div className="mb-5">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-semibold">Select Size</p>
                      <button
                        type="button"
                        onClick={() => setShowSizeChart(true)}
                        className="text-green-600 text-sm font-semibold hover:underline"
                      >
                        Size Chart
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {sizes.map((size: string, index: number) => (
                        <button
                          key={index}
                          onClick={() => setSelectedSize(size)}
                          className={`min-w-12 px-4 py-2 border rounded-xl font-medium transition ${
                            selectedSize === size
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-white border-gray-300 hover:border-green-500"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* COLOR SELECTOR */}
                {colors.length > 0 && (
                  <div className="mb-5">
                    <p className="font-semibold mb-2">Select Color</p>
                    <div className="flex flex-wrap gap-2">
                      {colors.map((color: any) => (
                        <button
                          key={color}
                          onClick={() => setSelectedColor(color)}
                          className={`px-4 py-2 rounded-xl border font-medium transition ${
                            selectedColor === color
                              ? "border-green-600 bg-green-50 text-green-700"
                              : "border-gray-300 hover:border-green-500"
                          }`}
                        >
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* VENDOR */}
                <div className="bg-gray-50 rounded-2xl p-4 mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Sold by</p>
                    <h3 className="font-bold">{product.vendorName}</h3>
                  </div>
                  <Link
                    href={`/store/${product.vendorId}`}
                    className="text-green-600 font-semibold text-sm hover:underline"
                  >
                    Visit Store →
                  </Link>
                </div>

                {/* DELIVERY & SERVICES */}
                <div className="bg-gray-50 rounded-2xl p-4 mb-6">
                  <h3 className="font-bold mb-3">Delivery &amp; Services</h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm text-gray-600">
                    <p>🚚 Free delivery</p>
                    <p>📅 Delivery by Tomorrow</p>
                    <p>📦 3–5 days</p>
                    <p>↩️ 7-day returns</p>
                    <p>💳 COD available</p>
                  </div>
                </div>
                <div className="mb-6">
<p className="font-semibold mb-2">
Quantity
</p>
<select
className="border rounded-xl px-4 py-2"
>
<option>1</option>
<option>2</option>
<option>3</option>
<option>4</option>
</select>
</div>
                {/* ACTION BUTTONS */}
                <div className="flex gap-3 mb-3">
                  <button
                    onClick={addToCart}
                    disabled={product.stock <= 0}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-4 rounded-2xl font-bold transition"
                  >
                    Add to Cart
                  </button>
                  <button
                    onClick={addToWishlist}
                    className="w-14 flex items-center justify-center bg-pink-50 hover:bg-pink-100 text-pink-600 rounded-2xl text-xl transition"
                    title="Add to wishlist"
                  >
                    ❤️
                  </button>
                </div>

                <button
                  onClick={buyNow}
                  disabled={product.stock <= 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-4 rounded-2xl font-bold transition"
                >
                  Buy Now
                </button>

                <div className="flex gap-3 mt-3">
                  <button
                    onClick={startChat}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl font-semibold transition"
                  >
                    💬 Chat with Seller
                  </button>
                  <button
                    onClick={async () => {
                      const url = window.location.href;
                      if (navigator.share) {
                        await navigator.share({
                          title: product.name,
                          text: product.name,
                          url,
                        });
                      } else {
                        navigator.clipboard.writeText(url);
                        alert("Product link copied.");
                      }
                    }}
                    className="w-14 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-lg transition"
                    title="Share"
                  >
                  📤
                  </button>
                </div>

                {/* HIGHLIGHTS */}
                <div className="mt-8">
                  <h2 className="text-lg font-bold mb-3">Highlights</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
                    <div>✔ Premium quality</div>
                    <div>✔ {product.material || "Quality material"}</div>
                    <div>✔ {product.color || "Stylish design"}</div>
                    <div>✔ Made in {product.countryOfOrigin || "India"}</div>
                  </div>
                </div>

                {/* SPECIFICATIONS */}
                <div className="mt-8">
                  <h2 className="text-lg font-bold mb-3">Specifications</h2>
                  <div className="border rounded-2xl overflow-hidden text-sm">
                    {[
                      ["Brand", product.brand],
                      ["Color", product.color],
                      ["Material", product.material],
                      ["Country of Origin", product.countryOfOrigin],
                      ["Category", product.category],
                    ].map(([label, value], i) => (
                      <div
                        key={label as string}
                        className={`grid grid-cols-2 ${
                          i % 2 === 0 ? "bg-gray-50" : "bg-white"
                        }`}
                      >
                        <div className="p-3 font-semibold text-gray-600">
                          {label}
                        </div>
                        <div className="p-3">{value || "-"}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DESCRIPTION */}
                <div className="mt-8">
                  <h2 className="text-lg font-bold mb-3">Product Description</h2>
                  <p className="text-gray-600 leading-7">
                    {product.description || "No description available."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RELATED PRODUCTS */}
          {relatedProducts.length > 0 && (
            <div className="mt-10">
              <h2 className="text-3xl font-bold mb-6">🔥 Related Products</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {relatedProducts.map((item) => (
                  <Link key={item.id} href={`/product/${item.id}`}>
                    <div className="bg-white rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden">
                      <img
                        src={item.image || "/no-image.png"}
                        alt={item.name}
                        className="w-full h-40 object-contain p-2"
                      />
                      <div className="p-3">
                        <h3 className="font-semibold text-sm line-clamp-2 min-h-[40px]">
                          {item.name}
                        </h3>
                        <p className="text-green-600 font-bold mt-1">
                          ₹{item.price?.toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* QUESTIONS */}
          <div className="mt-10 bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-5">❓ Product Questions</h2>
            <div className="flex gap-3 mb-6">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about this product…"
                className="flex-1 border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={askQuestion}
                className="bg-green-600 hover:bg-green-700 text-white px-6 rounded-xl font-semibold transition"
              >
                Ask
              </button>
            </div>
            <div className="space-y-4">
              {questions.length === 0 && (
                <p className="text-gray-400 text-sm">
                  No questions yet. Be the first to ask!
                </p>
              )}
              {questions.map((q: any) => (
                <div key={q.id} className="border-b pb-4">
                  <p className="font-semibold">❓ {q.question}</p>
                  <p className="text-sm text-gray-500">{q.customerName}</p>
                  {q.answer && (
                    <div className="bg-green-50 p-3 rounded-xl mt-3">
                      <p className="font-semibold text-green-700">
                        ✅ Seller Answer
                      </p>
                      <p>{q.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* REVIEWS */}
          <div className="mt-8 bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-5"> ⭐ Reviews &amp; Ratings</h2>

            {avgRating && (
              <div className="flex items-center gap-4 mb-6 pb-6 border-b">
                <div className="text-center">
                  <p className="text-4xl font-bold">{avgRating}</p>
                  <p className="text-yellow-500">
                    {"★".repeat(starCount)}
                    <span className="text-gray-300">
                      {"★".repeat(5 - starCount)}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {reviews.length} review{reviews.length > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="border p-3 rounded-xl outline-none"
              >
                <option value={5}>★★★★★</option>
                <option value={4}>★★★★</option>
                <option value={3}>★★★</option>
                <option value={2}>★★</option>
                <option value={1}>★</option>
              </select>
              <input
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share your experience…"
                className="flex-1 border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={submitReview}
                className="bg-green-600 hover:bg-green-700 text-white px-6 rounded-xl font-semibold transition"
              >
                Submit
              </button>
            </div>

            <div className="space-y-4">
              {reviews.length === 0 && (
                <p className="text-gray-400 text-sm">
                  No reviews yet. Share yours!
                </p>
              )}
              {reviews.map((review: any) => (
                <div key={review.id} className="border-b pb-4">
                  <p className="text-yellow-500">
                    {"★".repeat(review.rating || 0)}
                  </p>
                  <p className="font-semibold">{review.customerName}</p>
                  <p className="text-gray-600">{review.review}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SIZE CHART MODAL */}
      {showSizeChart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl w-80">
            <h2 className="text-xl font-bold mb-4">Size Chart</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-1"><span>S</span><span>36</span></div>
              <div className="flex justify-between border-b pb-1"><span>M</span><span>38</span></div>
              <div className="flex justify-between border-b pb-1"><span>L</span><span>40</span></div>
              <div className="flex justify-between border-b pb-1"><span>XL</span><span>42</span></div>
              <div className="flex justify-between"><span>XXL</span><span>44</span></div>
            </div>
            <button
              onClick={() => setShowSizeChart(false)}
              className="mt-5 w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MOBILE STICKY BAR */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 bg-white border-t p-3 flex gap-2 z-40">
        <button
          onClick={addToCart}
          disabled={product.stock <= 0}
          className="flex-1 bg-green-600 disabled:opacity-50 text-white py-3 rounded-xl font-bold"
        >
         🛒 Add to Cart
        </button>
        <button
          onClick={buyNow}
          disabled={product.stock <= 0}
          className="flex-1 bg-blue-600 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-center"
        >
         ⚡ Buy Now
        </button>
      </div>
    </>
  );
}
