"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Image from "next/image";

export default function DeliveryForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!email.trim()) {
      setError("Please enter your registered email.");
      return;
    }

    try {
      setLoading(true);

      await sendPasswordResetEmail(auth, email.trim().toLowerCase());

      setMessage(
        "If a delivery partner account exists for this email, a password reset link has been sent."
      );
      setEmail("");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      switch (code) {
        // Deliberately not distinguishing "no account found" from success
        // — same enumeration-avoidance reasoning as the other reset flows.
        case "auth/user-not-found":
          setMessage(
            "If a delivery partner account exists for this email, a password reset link has been sent."
          );
          setEmail("");
          break;

        case "auth/invalid-email":
          setError("Please enter a valid email address.");
          break;

        default:
          setError("Unable to send reset email. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
        <div className="max-w-5xl mx-auto px-6 py-12">
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
                YOMICO Delivery Portal
              </p>
              <h1 className="text-3xl md:text-4xl font-bold">Forgot Password</h1>
            </div>
          </div>

          <p className="mt-4 max-w-xl opacity-90">
            Enter your registered email to receive a password reset link.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 -mt-8">
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleReset} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {message && (
              <div className="bg-green-100 border border-green-300 text-green-700 rounded-xl p-3 text-sm">
                {message}
              </div>
            )}

            {error && (
              <div className="bg-red-100 border border-red-300 text-red-700 rounded-xl p-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 rounded-xl text-white font-bold ${
                loading
                  ? "bg-gray-400"
                  : "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500"
              }`}
            >
              {loading ? "Sending Reset Link..." : "Send Reset Link"}
            </button>

            <Link
              href="/delivery-login"
              className="block text-center text-blue-600 hover:underline"
            >
              ← Back to Delivery Login
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
