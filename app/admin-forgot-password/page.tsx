"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Image from "next/image";
import { ADMIN_EMAIL } from "@/lib/adminConfig";

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    setMessage("");
    setError("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Please enter the admin email address.");
      return;
    }

    // The admin account is a single known email — no enumeration risk in
    // confirming it up front, unlike the customer/vendor reset flows.
    if (cleanEmail !== ADMIN_EMAIL) {
      setError("This isn't the registered admin email.");
      return;
    }

    try {
      setLoading(true);

      await sendPasswordResetEmail(auth, cleanEmail);

      setMessage("Password reset link sent. Please check the inbox.");
      setEmail("");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Unable to send reset email. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-blue-50 p-6">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl p-10">
        <div className="flex justify-center mb-6">
          <Image src="/logo.png" alt="YOMICO" width={180} height={180} className="h-36 md:h-40 w-auto object-contain" />
        </div>

        <h1 className="text-3xl font-bold mb-3 text-center">🔒 Admin Password Reset</h1>
        <p className="text-gray-500 text-center mb-8">
          Enter the admin email to receive a password reset link.
        </p>

        <form onSubmit={handleReset} className="space-y-5">
          <input
            type="email"
            placeholder="Admin Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border p-4 rounded-xl"
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
            className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 disabled:opacity-60 text-white p-4 rounded-xl text-lg font-bold"
          >
            {loading ? "Sending…" : "Send Reset Link"}
          </button>

          <Link href="/admin-login" className="block text-center text-blue-600 hover:underline">
            ← Back to Admin Login
          </Link>
        </form>
      </div>
    </div>
  );
}
