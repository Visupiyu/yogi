"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import Link from "next/link";
export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const login = async () => {
    if (!email || !password) {
      alert("Please fill all fields");
      return;
    }

    try {
      setLoading(true);

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );

      const firebaseUser = userCredential.user;

      // Clear any previous seller/admin session
      localStorage.removeItem("vendor");
      localStorage.removeItem("admin");

      localStorage.setItem(
        "user",
        JSON.stringify({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || "",
          photoURL: firebaseUser.photoURL || "",
        })
      );

      alert("Sign In Successful");
      router.push("/");
    } catch (err: any) {
      if (err.code === "auth/invalid-credential") {
        alert("Invalid email or password");
      } else if (err.code === "auth/too-many-requests") {
        alert("Too many attempts. Please try again later.");
      } else {
        alert(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="bg-white backdrop-blur-sm border border-gray-100 p-10 rounded-3xl shadow-xl w-full max-w-md">
        <div className="text-center mb-5">
  <img
    src="/logo.png"
    alt="YOMICO"
    className="w-28 mx-auto mb-3"
  />

  <h2 className="text-3xl font-extrabold text-green-700 tracking-wide">
    YOMICO
  </h2>
</div>

        <p className="text-center text-green-600 font-semibold text-sm mb-2">
  YOMICO Customer Portal
</p>

        <h1 className="text-4xl font-bold text-center mb-3">Customer Sign In</h1>

        <p className="text-center text-gray-500 mb-8">
  Sign In to your YOMICO account
</p>

        <div className="space-y-5">
         <input
  type="email"
  placeholder="Email"
  autoComplete="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  className="w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
/>

          <input
  type={showPassword ? "text" : "password"}
  placeholder="Password"
  autoComplete="current-password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") login();
  }}
  className="w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
/>

          <div className="flex items-center justify-between mt-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={() => setShowPassword(!showPassword)}
              />
              <span className="text-sm text-gray-600">Show Password</span>
            </label>

            <Link
  href="/forgot-password"
  className="text-blue-600 font-semibold text-sm"
>
  Forgot Password?
</Link>
          </div>
        </div>

        <div className="space-y-4 mt-8">
          <button
            onClick={login}
            disabled={loading}
            className="w-full text-white py-4 rounded-2xl text-lg font-bold bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Sign In"}
          </button>

          <p className="text-center mt-6">
            Don&apos;t have account?
            <Link
  href="/signup"
  className="text-blue-600 ml-2 font-semibold"
>
  Signup
</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
