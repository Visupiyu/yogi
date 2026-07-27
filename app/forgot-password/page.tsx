"use client";

import { useState } from "react";
import Link from "next/link";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function ForgotPasswordPage() {

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);

      await sendPasswordResetEmail(auth, email);

      setMessage(
        "Password reset email sent successfully. Please check your inbox."
      );

      setEmail("");
    } catch (err: any) {
      switch (err.code) {
        case "auth/user-not-found":
          setError("No account found with this email.");
          break;

        case "auth/invalid-email":
          setError("Please enter a valid email address.");
          break;

        default:
          setError(err.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border">

        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔒</div>

          <h1 className="text-3xl font-bold text-gray-800">
            Forgot Password
          </h1>

          <p className="text-gray-500 mt-2">
            Enter your registered email address to receive a password reset link.
          </p>
        </div>

        <form onSubmit={handleReset} className="space-y-5">

          <div>
            <label className="block text-sm font-semibold mb-2">
              Email Address
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {message && (
            <div className="bg-green-100 text-green-700 border border-green-300 rounded-xl p-3 text-sm">
              {message}
            </div>
          )}

          {error && (
            <div className="bg-red-100 text-red-700 border border-red-300 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white py-3 rounded-xl font-semibold transition disabled:opacity-60"
          >
            {loading ? "Sending Reset Link..." : "Send Reset Link"}
          </button>

          <Link
            href="/login"
            className="block text-center text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Login
          </Link>

        </form>
      </div>
    </main>
  );
}