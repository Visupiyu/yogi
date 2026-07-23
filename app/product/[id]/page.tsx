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

type Product = {
  id: string;
  name: string;
  image?: string;
  images?: string[];
  price: number;
  mrp?: number;
  discountPercent?: number;
  stock: number;
  category?: string;
  description?: string;
  vendorId: string;
  vendorName: string;
  color?: string;
  sizes?: string[];
  material?: string;
  brand?: string;
  countryOfOrigin?: string;
  // Fashion
pattern?: string;
fitType?: string;
sleeveType?: string;
neckType?: string;

// Mobiles
modelNumber?: string;
ram?: string;
storageCapacity?: string;
processor?: string;
displaySize?: string;
battery?: string;
camera?: string;
operatingSystem?: string;
warranty?: string;

// Electronics / Appliances
powerSource?: string;
voltage?: string;
accessories?: string;

// Grocery
weight?: string;
unit?: string;
expiryDate?: string;
fssaiNumber?: string;
organic?: string;

// Beauty
skinType?: string;
hairType?: string;
ingredients?: string;
netQuantity?: string;

// Furniture
dimensions?: string;
weightCapacity?: string;
assemblyRequired?: string;
furnitureWarranty?: string;

// Books
author?: string;
publisher?: string;
language?: string;
isbn?: string;
edition?: string;
pages?: string;
};
type ProductQuestion = {
  id: string;
  question: string;
  answer?: string;
  customerName: string;
};
type ProductReview = {
  id: string;
  customerName: string;
  review: string;
  rating: number;
};
type CartItem = {
  id: string;
  name: string;
  price: number;
  image?: string;
  stock: number;
  qty: number;
  size?: string;
  color?: string;
  vendorId: string;
  vendorName: string;
};

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [showSizeChart, setShowSizeChart] = useState(false);
  const [question, setQuestion] = useState("");
  const [questions, setQuestions] = useState<ProductQuestion[]>([]);
 const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [pinCode, setPinCode] = useState("");
const [deliveryMessage, setDeliveryMessage] = useState("");

  useEffect(() => {
    async function loadProduct() {
      try {
        const snap = await getDoc(
          doc(db, "products", params.id as string)
        );

        if (snap.exists()) {
          const productData = snap.data();
          const fullProduct: Product = {
  id: snap.id,
  ...(productData as Omit<Product, "id">),
};
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
          const related: Product[] = [];

relatedSnap.forEach((d) => {
  const data = d.data() as Omit<Product, "id">;

  if (d.id !== snap.id) {
    related.push({
      id: d.id,
      ...data,
    });
  }
});
          setRelatedProducts(related.slice(0, 4));

          const questionSnap = await getDocs(
            query(
              collection(db, "productQuestions"),
              where("productId", "==", snap.id)
            )
          );
          const questionData: ProductQuestion[] = [];

questionSnap.forEach((d) => {
  const data = d.data() as Omit<ProductQuestion, "id">;

  questionData.push({
    id: d.id,
    ...data,
  });
});
          setQuestions(questionData);

          const reviewSnap = await getDocs(
            query(
              collection(db, "productReviews"),
              where("productId", "==", snap.id)
            )
          );
         const reviewData: ProductReview[] = [];

reviewSnap.forEach((d) => {
  const data = d.data() as Omit<ProductReview, "id">;

  reviewData.push({
    id: d.id,
    ...data,
  });
});
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
  const addItemToCart = (): boolean => { if (!product) return false;
    if (sizes.length > 0 && !selectedSize) {
      alert("Please select a size");
      return false;
    }
    if (colors.length > 0 && !selectedColor) {
      alert("Please select a color");
      return false;
    }

    const cart: CartItem[] = JSON.parse(
  localStorage.getItem("cart") || "[]"
);
    const index = cart.findIndex(
      (item) =>
        item.id === product.id &&
        item.size === selectedSize &&
        item.color === selectedColor
    );

    if (index > -1) {
      cart[index].qty = Math.min(cart[index].qty + 1, product.stock);
    } else {
      cart.push({
  id: product.id,
  name: product.name ?? "",
  price: product.price ?? 0,
  image: product.image,
  stock: product.stock ?? 0,
  qty: 1,
  size: selectedSize,
  color: selectedColor,
  vendorId: product.vendorId ?? "",
  vendorName: product.vendorName ?? "",
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
  if (!addItemToCart()) return;
  const cart = JSON.parse(localStorage.getItem("cart") || "[]");
  localStorage.setItem("checkoutItems", JSON.stringify(cart));
  router.push("/checkout");
};

  const addToWishlist = () => {if (!product) return;
    const wishlist: Product[] = JSON.parse(
  localStorage.getItem("wishlist") || "[]"
);
    const exists = wishlist.find((item) => item.id === product.id);
    if (exists) {
      alert("Already In Wishlist");
      return;
    }
    wishlist.push(product);
    localStorage.setItem("wishlist", JSON.stringify(wishlist));
    window.dispatchEvent(new Event("wishlistUpdated"));
    alert("Added To Wishlist");
  };

  const askQuestion = async () => {if (!product) return;
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

  const submitReview = async () => {if (!product) return;
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

  const startChat = async () => { if (!product) return;
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
      sellerId: product.vendorId ?? "",
      sellerName: product.vendorName ?? "",
      sellerImage: "",
      customerImage: "",
     productId: product.id,
    productName: product.name ?? "",
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

  const mrp = product.mrp ?? 0;
const price = product.price ?? 0;

const hasDiscount = mrp > price;

const discountPercent =
  hasDiscount
    ? product.discountPercent ??
      Math.round(((mrp - price) / mrp) * 100)
    : 0;

const savings = hasDiscount ? mrp - price : 0;

  const avgRating = reviews.length
    ? (
        reviews.reduce((s, r) => s + (r.rating || 0), 0) /
        reviews.length
      ).toFixed(1)
    : null;
  const starCount = avgRating ? Math.round(Number(avgRating)) : 0;
  const specifications: [string, string | undefined][] = [
  ["Brand", product.brand],
  ["Category", product.category],
  ["Country of Origin", product.countryOfOrigin],
];

if (
  product.category === "Men Fashion" ||
  product.category === "Women Fashion" ||
  product.category === "Kids Fashion"
) {
  specifications.push(
    ["Material", product.material],
    ["Color", product.color],
    ["Pattern", product.pattern],
    ["Fit Type", product.fitType],
    ["Sleeve Type", product.sleeveType],
    ["Neck Type", product.neckType],
    ["Sizes", product.sizes?.join(", ")]
  );
}

if (product.category === "Mobiles") {
  specifications.push(
    ["Model Number", product.modelNumber],
    ["RAM", product.ram],
    ["Storage", product.storageCapacity],
    ["Processor", product.processor],
    ["Display", product.displaySize],
    ["Battery", product.battery],
    ["Camera", product.camera],
    ["Operating System", product.operatingSystem],
    ["Warranty", product.warranty]
  );
}

if (
  product.category === "Electronics" ||
  product.category === "Appliances"
) {
  specifications.push(
    ["Model Number", product.modelNumber],
    ["Power Source", product.powerSource],
    ["Voltage", product.voltage],
    ["Accessories", product.accessories],
    ["Warranty", product.warranty]
  );
}

if (product.category === "Grocery") {
  specifications.push(
    ["Weight", product.weight],
    ["Unit", product.unit],
    ["Expiry Date", product.expiryDate],
    ["Organic", product.organic],
    ["FSSAI Number", product.fssaiNumber]
  );
}

if (product.category === "Beauty") {
  specifications.push(
    ["Skin Type", product.skinType],
    ["Hair Type", product.hairType],
    ["Ingredients", product.ingredients],
    ["Net Quantity", product.netQuantity]
  );
}

if (product.category === "Furniture") {
  specifications.push(
    ["Dimensions", product.dimensions],
    ["Weight Capacity", product.weightCapacity],
    ["Assembly Required", product.assemblyRequired],
    ["Warranty", product.furnitureWarranty]
  );
}

if (product.category === "Books") {
  specifications.push(
    ["Author", product.author],
    ["Publisher", product.publisher],
    ["Language", product.language],
    ["ISBN", product.isbn],
    ["Edition", product.edition],
    ["Pages", product.pages]
  );
}
const badges: string[] = [];

if ((product.discountPercent ?? 0) >= 40) {
  badges.push("🔥 Best Deal");
}

if (product.stock <= 5 && product.stock > 0) {
  badges.push("⚡ Limited Stock");
}

if (product.category === "Beauty" && product.organic === "Yes") {
  badges.push("🌿 Organic");
}

if (reviews.length >= 10 && Number(avgRating) >= 4.5) {
  badges.push("⭐ Top Rated");
}

if (product.stock > 20) {
  badges.push("🚚 Ready to Ship");
}
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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
              {/* IMAGE GALLERY */}
              <div className="md:sticky md:top-24 self-start">
               <div className="flex flex-col md:flex-row gap-4">

  {/* Thumbnails */}

  <div className="order-2 md:order-1 flex md:flex-col gap-3 overflow-x-auto md:overflow-visible">

    {(product.images ?? [product.image])
      .filter((img): img is string => Boolean(img))
      .map((img, index) => (
        <img
          key={index}
          src={img}
          alt={product.name}
          onClick={() => setSelectedImage(img)}
          className={`w-16 h-16 md:w-20 md:h-20 object-cover rounded-2xl border-2 cursor-pointer transition flex-shrink-0 ${
            selectedImage === img
              ? "border-green-600"
              : "border-gray-200 hover:border-green-400"
          }`}
        />
      ))}

  </div>

  {/* Main Image */}

  <div className="order-1 md:order-2 flex-1 bg-gray-50 rounded-3xl p-4 overflow-hidden">

    <img
      src={selectedImage}
      alt={product.name}
      className="w-full h-[320px] sm:h-[420px] md:h-[520px] object-contain rounded-2xl transition-transform duration-300 hover:scale-110 cursor-zoom-in"
    />

  </div>

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
                {badges.length > 0 && (

  <div className="flex flex-wrap gap-2 mb-5">

    {badges.map((badge) => (

      <span
        key={badge}
        className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-semibold"
      >
        {badge}
      </span>

    ))}

  </div>

)}

                {/* TRUST CHIPS */}
                <div className="grid grid-cols-2 gap-3 mt-5">
<div className="bg-green-50 rounded-2xl p-3 text-center">
🛡
<p className="text-sm font-semibold">
Buyer Protection
</p>
</div>
<div className="bg-blue-50 rounded-2xl p-3 text-center">
🔒
<p className="text-sm font-semibold">
Secure Payment
</p>
</div>
<div className="bg-yellow-50 rounded-2xl p-3 text-center">
🚚
<p className="text-sm font-semibold">
Fast Delivery
</p>
</div>
<div className="bg-purple-50 rounded-2xl p-3 text-center">
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
                  className={`rounded-2xl p-3 mb-5 ${
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
                          className={`min-w-12 px-4 py-2 border rounded-2xl font-medium transition ${
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
                      {colors.map((color: string) => (
                        <button
                          key={color}
                          onClick={() => setSelectedColor(color)}
                          className={`px-4 py-2 rounded-2xl border font-medium transition ${
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
                <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-5 mb-5 border border-green-100">

  <div className="flex justify-between items-start">

    <div>

      <p className="text-xs text-gray-500 uppercase tracking-wide">
        Sold By
      </p>

      <h3 className="text-xl font-bold text-gray-800 mt-1">
        🏪 {product.vendorName}
      </h3>

      <div className="flex items-center gap-2 mt-2">

        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
          ⭐ Trusted Seller
        </span>

        <span className="text-sm text-gray-500">
          Secure Marketplace
        </span>

      </div>

      <p className="text-sm text-gray-600 mt-3">
        Genuine products from this seller.
      </p>

    </div>

    <Link
      href={`/store/${product.vendorId}`}
      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-2xl font-semibold transition"
    >
      Visit Store
    </Link>

  </div>

</div>

{/* DELIVERY & SERVICES */}
<div className="bg-gray-50 rounded-2xl p-4 mb-6">

  <h3 className="font-bold mb-4">
    🚚 Delivery & Services
  </h3>

  <div className="flex gap-2 mb-4">

    <input
      type="text"
      maxLength={6}
      value={pinCode}
      onChange={(e) => setPinCode(e.target.value)}
      placeholder="Enter PIN Code"
      className="flex-1 border rounded-2xl px-4 py-3"
    />

    <button
      onClick={() => {

        if (pinCode.length !== 6) {
          setDeliveryMessage("Please enter a valid 6-digit PIN code.");
          return;
        }

        setDeliveryMessage(
          `Delivery available to ${pinCode}. Estimated delivery: 2–5 business days.`
        );

      }}
      className="bg-green-600 hover:bg-green-700 text-white px-5 rounded-2xl"
    >
      Check
    </button>

  </div>

  {deliveryMessage && (

    <div className="bg-green-50 text-green-700 rounded-2xl p-3 mb-4">

      {deliveryMessage}

    </div>

  )}

  <div className="grid grid-cols-2 gap-y-2 text-sm text-gray-600">

    <p>🚚 Free Delivery</p>

    <p>📅 2–5 Business Days</p>

    <p>💳 Pay on Delivery (UPI Only)</p>

    <p>↩️ 7-Day Returns</p>

  </div>

</div>
<div className="mb-6">
<p className="font-semibold mb-2">
Quantity
</p>
<select
className="border rounded-2xl px-4 py-2"
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
                    className="w-14 flex items-center justify-center bg-pink-50 hover:bg-pink-100 text-pink-600 py-4 rounded-2xl font-bold transition"
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
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold transition"
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
                    className="w-14 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition"
                    title="Share"
                  >
                  📤
                  </button>
                </div>

                {/* HIGHLIGHTS */}
                <div className="mt-8">
  <h2 className="text-2xl font-bold mb-5">Highlights</h2>

  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">

    {/* Fashion */}
    {(product.category === "Men Fashion" ||
      product.category === "Women Fashion" ||
      product.category === "Kids Fashion") && (
      <>
        {product.material && <div>✔ {product.material} Fabric</div>}
        {product.pattern && <div>✔ {product.pattern}</div>}
        {product.fitType && <div>✔ {product.fitType} Fit</div>}
        {product.sleeveType && <div>✔ {product.sleeveType}</div>}
        {product.neckType && <div>✔ {product.neckType}</div>}
        {product.countryOfOrigin && (
          <div>✔ Made in {product.countryOfOrigin}</div>
        )}
      </>
    )}

    {/* Mobiles */}
    {product.category === "Mobiles" && (
      <>
        {product.ram && <div>✔ {product.ram} RAM</div>}
        {product.storageCapacity && (
          <div>✔ {product.storageCapacity} Storage</div>
        )}
        {product.processor && <div>✔ {product.processor}</div>}
        {product.battery && <div>✔ {product.battery}</div>}
        {product.camera && <div>✔ {product.camera}</div>}
      </>
    )}

    {/* Electronics / Appliances */}
    {(product.category === "Electronics" ||
      product.category === "Appliances") && (
      <>
        {product.modelNumber && <div>✔ {product.modelNumber}</div>}
        {product.powerSource && <div>✔ {product.powerSource}</div>}
        {product.voltage && <div>✔ {product.voltage}</div>}
        {product.warranty && <div>✔ {product.warranty} Warranty</div>}
      </>
    )}

    {/* Grocery */}
    {product.category === "Grocery" && (
      <>
        {product.weight && (
          <div>
            ✔ {product.weight} {product.unit}
          </div>
        )}
        {product.organic && <div>✔ {product.organic}</div>}
        {product.expiryDate && (
          <div>✔ Expires: {product.expiryDate}</div>
        )}
      </>
    )}

    {/* Beauty */}
    {product.category === "Beauty" && (
      <>
        {product.skinType && <div>✔ {product.skinType} Skin</div>}
        {product.hairType && <div>✔ {product.hairType} Hair</div>}
        {product.netQuantity && <div>✔ {product.netQuantity}</div>}
      </>
    )}

    {/* Furniture */}
    {product.category === "Furniture" && (
      <>
        {product.dimensions && <div>✔ {product.dimensions}</div>}
        {product.weightCapacity && (
          <div>✔ {product.weightCapacity}</div>
        )}
        {product.assemblyRequired && (
          <div>✔ Assembly: {product.assemblyRequired}</div>
        )}
      </>
    )}

    {/* Books */}
    {product.category === "Books" && (
      <>
        {product.author && <div>✔ {product.author}</div>}
        {product.publisher && <div>✔ {product.publisher}</div>}
        {product.language && <div>✔ {product.language}</div>}
        {product.pages && <div>✔ {product.pages} Pages</div>}
      </>
    )}

  </div>
</div>

                {/* SPECIFICATIONS */}
                <div className="mt-8">
                  <h2 className="text-2xl font-bold mb-5">Specifications</h2>
                  <div className="border rounded-2xl overflow-hidden text-sm">
                    {specifications
  .filter(([, value]) => value)
  .map(([label, value], i) => (
    <div
      key={label}
      className={`grid grid-cols-2 ${
        i % 2 === 0 ? "bg-gray-50" : "bg-white"
      }`}
    >
      <div className="p-3 font-semibold text-gray-600">
        {label}
      </div>

      <div className="p-3">
        {value}
      </div>
    </div>
))}
                  </div>
                </div>

                {/* DESCRIPTION */}
                <div className="mt-8">
                  <h2 className="text-2xl font-bold mb-5">Product Description</h2>
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
                className="flex-1 border p-3 rounded-2xl outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={askQuestion}
                className="bg-green-600 hover:bg-green-700 text-white px-6 rounded-2xl font-semibold transition"
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
              {questions.map((q) => (
                <div
  key={q.id}
  className="border rounded-2xl p-5 shadow-sm bg-white"
>

  <div className="flex items-start justify-between">

    <div>

      <h3 className="font-bold text-gray-800">
        ❓ {q.question}
      </h3>

      <p className="text-sm text-gray-500 mt-1">
        Asked by {q.customerName}
      </p>

    </div>

  </div>

  {q.answer ? (

    <div className="bg-green-50 border border-green-100 rounded-2xl p-4 mt-4">

      <p className="font-semibold text-green-700 mb-2">
        ✅ Seller Reply
      </p>

      <p className="text-gray-700">
        {q.answer}
      </p>

    </div>

  ) : (

    <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 mt-4">

      <p className="text-yellow-700 font-medium">
        ⏳ Awaiting seller response
      </p>

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
                className="border p-3 rounded-2xl outline-none"
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
                className="flex-1 border p-3 rounded-2xl outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={submitReview}
                className="bg-green-600 hover:bg-green-700 text-white px-6 rounded-2xl font-semibold transition"
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
              {reviews.map((review) => (
                <div
  key={review.id}
  className="border rounded-2xl p-5 shadow-sm bg-white"
>

  <div className="flex justify-between items-start">

    <div>

      <div className="text-yellow-500 text-lg">
        {"★".repeat(review.rating || 0)}
        <span className="text-gray-300">
          {"★".repeat(5 - (review.rating || 0))}
        </span>
      </div>

      <h3 className="font-bold mt-2">
        {review.customerName}
      </h3>

      <span className="inline-block mt-1 bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
        ✔ Verified Purchase
      </span>

    </div>

  </div>

  <p className="text-gray-700 mt-4 leading-7">
    {review.review}
  </p>

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
              className="mt-5 w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-2xl font-semibold transition"
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
          className="flex-1 bg-green-600 disabled:opacity-50 text-white py-3 rounded-2xl font-bold"
        >
         🛒 Add to Cart
        </button>
        <button
          onClick={buyNow}
          disabled={product.stock <= 0}
          className="flex-1 bg-blue-600 disabled:opacity-50 text-white py-3 rounded-2xl font-bold text-center"
        >
         ⚡ Buy Now
        </button>
      </div>
    </>
  );
}
