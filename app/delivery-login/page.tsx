"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function DeliveryLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginPartner = async () => {
    if (!email || !password) {
      alert("Fill all fields");
      return;
    }

    try {
      setLoading(true);

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password.trim()
      );

      const partnerQuery = query(
        collection(db, "deliveryPartners"),
        where("email", "==", userCredential.user.email)
      );

      const snapshot = await getDocs(partnerQuery);

      if (snapshot.empty) {
        await signOut(auth);
        alert("Delivery partner account not found");
        return;
      }

      const partnerDoc = snapshot.docs[0];
      const partnerData = partnerDoc.data();

      if (partnerData.uid !== userCredential.user.uid) {
        await signOut(auth);
        alert("Delivery partner account not found");
        return;
      }

      if (partnerData.status !== "Active") {
        await signOut(auth);
        alert("Your account is inactive. Please contact the admin.");
        return;
      }

      // Clear any other role's session sharing this browser
      localStorage.removeItem("user");
      localStorage.removeItem("vendor");
      localStorage.removeItem("admin");

      localStorage.setItem(
        "deliveryPartner",
        JSON.stringify({
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          partnerId: partnerDoc.id,
          name: partnerData.name,
        })
      );

      router.replace("/delivery");
    } catch (err: any) {
      if (err.code === "auth/invalid-credential") {
        alert("Invalid email or password");
      } else {
        alert(err.message || "Unable to sign in. Please try again.");
        console.error(err);
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
              <h1 className="text-3xl md:text-4xl font-bold">
                Delivery Partner Login
              </h1>
            </div>
          </div>

          <p className="mt-4 max-w-xl opacity-90">
            Login with the email and password provided by YOMICO to view and
            update your assigned deliveries.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 -mt-8">
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-8">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 border rounded-xl outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-4 border rounded-xl outline-none pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={loginPartner}
            disabled={loading}
            className={`w-full text-white py-4 rounded-xl mt-8 text-lg font-bold ${
              loading
                ? "bg-gray-400"
                : "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500"
            }`}
          >
            {loading ? "Authenticating..." : "Login to Delivery Portal"}
          </button>

          <p className="text-center mt-6 text-sm text-gray-500">
            Don&apos;t have login details?{" "}
            <Link
              href="/contact"
              className="font-semibold text-blue-600 hover:underline"
            >
              Contact YOMICO
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
