"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Image from "next/image";

export default function VendorForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!email.trim()) {
      setError("Please enter your registered vendor email.");
      return;
    }

    try {
      setLoading(true);

      await sendPasswordResetEmail(auth, email.trim().toLowerCase());

      setMessage(
        "Password reset email sent successfully. Please check your inbox."
      );

      setEmail("");
    } catch (err: any) {
      switch (err.code) {
        case "auth/user-not-found":
          setError("No vendor account found with this email.");
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
    <main className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 border">

        <div className="text-center mb-8">
          <Image
  src="/logo.png"
  alt="YOMICO"
  width={180}
  height={180}
  className="h-36 md:h-40 w-auto object-contain"
/>

          <h1 className="text-3xl font-bold">
            Vendor Forgot Password
          </h1>

          <p className="text-gray-500 mt-2">
            Enter your registered vendor email to receive a password reset link.
          </p>
        </div>

        <form onSubmit={handleReset} className="space-y-5">

          <input
            type="email"
            placeholder="Business Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 border rounded-2xl outline-none focus:ring-2 focus:ring-green-500"
          />

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
            className={`w-full py-4 rounded-2xl text-white font-bold ${
              loading
                ? "bg-gray-400"
                : "bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500"
            }`}
          >
            {loading ? "Sending Reset Link..." : "Send Reset Link"}
          </button>

          <Link
            href="/vendor-login"
            className="block text-center text-blue-600 hover:underline"
          >
            ← Back to Vendor Login
          </Link>

        </form>
      </div>
    </main>
  );
}