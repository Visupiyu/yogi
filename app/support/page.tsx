"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { customerLoginUrl } from "@/lib/authRedirect";

const CATEGORIES = ["Order Issue", "Refund Issue", "Product Issue", "Payment Issue", "Other"];

const FIELD =
  "w-full border border-gray-300 p-4 rounded-xl bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function SupportPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  // Synchronous in-flight guard (state alone can let two quick clicks through).
  const submittingRef = useRef(false);

  // A support ticket needs a signed-in customer (the server writes it under their
  // identity). Signed-out visitors are sent to login on load — not after they have
  // typed a message — and come straight back here.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push(customerLoginUrl());
        return;
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, [router]);

  const createTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      router.push(customerLoginUrl());
      return;
    }
    if (!subject.trim()) {
      setError("Please enter a subject.");
      return;
    }
    if (!message.trim()) {
      setError("Please describe your issue.");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      // The ticket and the admin notification are written by the server
      // (app/api/support/tickets), under the caller's verified identity.
      const idToken = await currentUser.getIdToken();
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ subject, category, message }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result?.error || "We couldn't create your ticket. Please try again.");
        return;
      }
      setSubject("");
      setMessage("");
      setCreated(true);
    } catch (err) {
      console.error("Support ticket failed:", err);
      setError("We couldn't reach the server. Please check your connection and try again — your message is still here.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (!authReady) {
    return <div className="min-h-screen bg-gray-100 p-6 text-center text-gray-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 mb-4"
        >
          ← Back to Profile
        </Link>

        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Support Center</h1>
          <p>Raise a support ticket</p>
          <Link
            href="/profile/tickets"
            className="mt-4 inline-block rounded-xl bg-white px-5 py-2 font-semibold text-blue-700 hover:bg-gray-100"
          >
            View my tickets
          </Link>
        </div>

        {created && (
          <div role="status" className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-800">
            <p className="font-semibold">Ticket created — we&apos;ll get back to you soon.</p>
            <p className="mt-1 text-sm">
              <Link href="/profile/tickets" className="font-semibold underline">
                View my tickets
              </Link>{" "}
              to follow replies, or raise another below.
            </p>
          </div>
        )}

        <form onSubmit={createTicket} className="bg-white rounded-3xl shadow p-8 space-y-4" noValidate>
          <div>
            <label htmlFor="support-subject" className="mb-1 block text-sm font-medium text-gray-700">
              Subject
            </label>
            <input
              id="support-subject"
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              required
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="support-category" className="mb-1 block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="support-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={FIELD}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="support-message" className="mb-1 block text-sm font-medium text-gray-700">
              Describe your issue
            </label>
            <textarea
              id="support-message"
              rows={6}
              placeholder="Describe your issue"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              required
              className={FIELD}
            />
          </div>

          {error && (
            <p role="alert" className="text-red-600 font-semibold">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-8 py-4 rounded-xl"
          >
            {loading ? "Submitting..." : "Submit Ticket"}
          </button>
        </form>
      </div>
    </div>
  );
}
