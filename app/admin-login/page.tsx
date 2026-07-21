"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

const adminEmails = ["adminyogimart@gmail.com"];

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      alert("Fill all fields");
      return;
    }

    try { setLoading(true);

const result = await signInWithEmailAndPassword( auth, email.trim().toLowerCase(), password);

const userEmail = (result.user.email || "").toLowerCase();

if (!adminEmails.includes(userEmail)) {
  await signOut(auth);
  alert("Not Admin Account");
  return;
}

// 👇 ADD HERE
localStorage.removeItem("user");
localStorage.removeItem("vendor");

localStorage.setItem(
  "admin",
  JSON.stringify({
    uid: result.user.uid,
    email: result.user.email,
    name: "Administrator",
  })
);

alert("Admin Login Successful");

router.push("/admin");

    } catch (error: any) {
      if (error.code === "auth/invalid-credential") {
        alert("Invalid email or password");
      } else {
        alert("Login failed. Please check your credentials and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-blue-50 p-6">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl p-10">
        <div className="flex justify-center mb-6">
       <img src="/logo.png" alt="YOMICO" className="h-20 w-auto" /></div>
        <h1 className="text-4xl font-bold mb-3 text-center">👑 YOMICO Admin</h1>
        <p className="text-gray-500 text-center mb-10">
        YOMICO Administration Portal
        </p>
        <div className="space-y-5">
          <input
            type="email"
            placeholder="Admin Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border p-4 rounded-xl"
          />

          <input
           type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border p-4 rounded-xl"
            onKeyDown={(e) => {if (e.key === "Enter") {handleLogin();}}}
          />
          

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500disabled:opacity-60 text-white p-4 rounded-xl text-lg font-bold"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
