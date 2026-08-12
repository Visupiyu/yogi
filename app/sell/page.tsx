"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

const BENEFITS = [
  {
    icon: "🛍️",
    title: "Reach YOMICO Customers",
    description:
      "List your products in front of shoppers already browsing YOMICO — no separate storefront to build or market.",
  },
  {
    icon: "📊",
    title: "One Seller Dashboard",
    description:
      "Manage products, orders, inventory, analytics and payouts from a single workspace built for sellers.",
  },
  {
    icon: "📦",
    title: "Simple Product Listing",
    description:
      "Add products with images, variants and specifications using a listing form that adapts to your category.",
  },
  {
    icon: "💰",
    title: "Clear Earnings & Payouts",
    description:
      "See your revenue, commission and net earnings at a glance, and track every withdrawal from your wallet.",
  },
  {
    icon: "📈",
    title: "Business Insights",
    description:
      "Analytics and reports show what's selling, what's running low, and where to focus next.",
  },
  {
    icon: "💬",
    title: "Direct Buyer Communication",
    description:
      "Answer product questions and chat with customers directly from your seller dashboard.",
  },
];

const STEPS = [
  { title: "Register", description: "Create your seller account with mobile, email and a password." },
  { title: "Business Details", description: "Tell us about your business and where orders will ship from." },
  { title: "KYC & Documents", description: "Submit PAN, address proof and other required verification documents." },
  { title: "Bank Details", description: "Add your bank account so payouts have somewhere to go." },
  { title: "YOMICO Review", description: "Our team reviews your application and documents." },
  { title: "Start Selling", description: "Once approved, list your first product and you're live." },
];

const CATEGORIES = [
  "Fashion",
  "Kids Fashion",
  "Grocery",
  "Beauty",
  "Electronics",
  "Mobiles",
  "Appliances",
  "Furniture",
  "Books",
];

const INQUIRY_TOPICS = [
  "Registration & KYC",
  "Product Listing",
  "Orders & Shipping",
  "Payments & Payouts",
  "Something else",
];

export default function SellOnYomicoPage() {
  const [form, setForm] = useState({
    fullName: "",
    contact: "",
    topic: "",
    message: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submitInquiry = async () => {
    if (!form.fullName.trim() || !form.contact.trim() || !form.message.trim()) {
      alert("Please fill in your name, contact detail and message.");
      return;
    }

    try {
      setSubmitting(true);

      await addDoc(collection(db, "sellerInquiries"), {
        fullName: form.fullName.trim(),
        contact: form.contact.trim(),
        topic: form.topic || "General",
        message: form.message.trim(),
        status: "New",
        createdAt: serverTimestamp(),
      });

      setSubmitted(true);
      setForm({ fullName: "", contact: "", topic: "", message: "" });

    } catch (error) {
      console.error(error);
      alert("Couldn't send your query. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">

      {/* HERO */}
      <section className="bg-gradient-to-r from-green-600 to-blue-600 text-white">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">

          <div className="flex items-center gap-5">
            <Image
              src="/logo.png"
              alt="YOMICO"
              width={90}
              height={90}
              className="h-16 w-16 md:h-20 md:w-20 object-contain rounded-2xl bg-white p-2"
            />

            <div>
              <p className="text-sm uppercase tracking-widest opacity-80">
                YOMICO Seller Portal
              </p>
              <h1 className="text-3xl font-bold md:text-5xl">
                Sell on YOMICO
              </h1>
            </div>
          </div>

          <p className="mt-4 max-w-xl text-lg opacity-90">
            Bring your business online. List your products, reach YOMICO
            customers, and manage your whole store from one seller dashboard.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/vendor-register"
              className="rounded-xl bg-white px-8 py-3 font-semibold text-green-700 hover:bg-gray-100"
            >
              Start Selling
            </Link>

            <Link
              href="/vendor-login"
              className="rounded-xl border border-white px-8 py-3 font-semibold text-white hover:bg-white/10"
            >
              Seller Login
            </Link>
          </div>

        </div>
      </section>

      {/* WHY SELL ON YOMICO */}
      <section className="mx-auto max-w-6xl px-6 py-16">

        <h2 className="text-3xl font-bold text-gray-900">
          Why sell on YOMICO?
        </h2>

        <p className="mt-3 max-w-2xl text-gray-600">
          Everything a growing seller needs, without juggling a dozen
          different tools.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <div
              key={benefit.title}
              className="rounded-2xl border border-gray-200 p-6 transition hover:shadow-md"
            >
              <div className="text-3xl">{benefit.icon}</div>

              <h3 className="mt-4 text-lg font-bold text-gray-900">
                {benefit.title}
              </h3>

              <p className="mt-2 text-sm text-gray-600">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

      </section>

      {/* HOW IT WORKS */}
      <section className="bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-16">

          <h2 className="text-3xl font-bold text-gray-900">
            How to get started
          </h2>

          <p className="mt-3 max-w-2xl text-gray-600">
            From registration to your first sale — here&apos;s what the process
            looks like.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl bg-white border border-gray-200 p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white font-bold">
                  {index + 1}
                </div>

                <h3 className="mt-4 text-lg font-bold text-gray-900">
                  {step.title}
                </h3>

                <p className="mt-2 text-sm text-gray-600">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <Link
              href="/vendor-register"
              className="inline-block rounded-xl bg-gradient-to-r from-green-600 to-blue-600 px-8 py-3 font-semibold text-white hover:from-green-500 hover:to-blue-500"
            >
              Start Selling on YOMICO
            </Link>
          </div>

        </div>
      </section>

      {/* CONTACT / INQUIRY */}
      <section id="contact" className="mx-auto max-w-6xl px-6 py-16">

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">

          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              Have questions before you register?
            </h2>

            <p className="mt-3 text-gray-600">
              Tell us what you&apos;re looking to sell, or ask about
              registration, KYC, payments or anything else — our team will
              get back to you.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">

            {submitted ? (
              <div className="py-10 text-center">
                <p className="text-2xl">✅</p>
                <p className="mt-3 font-semibold text-gray-900">
                  Thanks — we&apos;ve received your query.
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Our team will get back to you soon.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-6 text-sm font-semibold text-green-700 hover:underline"
                >
                  Send another query
                </button>
              </div>
            ) : (
              <div className="space-y-4">

                <input
                  type="text"
                  placeholder="Full Name"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full rounded-xl border p-3"
                />

                <input
                  type="text"
                  placeholder="Mobile Number / Email"
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  className="w-full rounded-xl border p-3"
                />

                <select
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                  className="w-full rounded-xl border p-3 bg-white"
                >
                  <option value="">Select a Topic</option>
                  {INQUIRY_TOPICS.map((topic) => (
                    <option key={topic} value={topic}>{topic}</option>
                  ))}
                </select>

                <textarea
                  rows={4}
                  placeholder="Your message"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full rounded-xl border p-3"
                />

                <button
                  onClick={submitInquiry}
                  disabled={submitting}
                  className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? "Sending..." : "Send Query"}
                </button>

              </div>
            )}

          </div>

        </div>

      </section>

      {/* POPULAR CATEGORIES */}
      <section className="bg-gray-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-14">

          <h2 className="text-2xl font-bold">
            Popular categories to sell on YOMICO
          </h2>

          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            {CATEGORIES.map((category) => (
              <Link
                key={category}
                href={`/category/${encodeURIComponent(category)}`}
                className="text-gray-300 hover:text-white hover:underline"
              >
                Sell {category} Online
              </Link>
            ))}
          </div>

        </div>
      </section>

    </div>
  );
}
