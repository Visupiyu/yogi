"use client";

import { useEffect, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function VendorLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

 useEffect(() => {
  const vendor = localStorage.getItem("vendor");

  if (vendor && auth.currentUser) {
    router.push("/seller");
  }
}, [router]);

  const loginVendor = async () => {
    if (!email || !password) {
      alert("Fill All Fields");
      return;
    }

    try {
      setLoading(true);

      const userCredential = await signInWithEmailAndPassword(
  auth,
  email.trim().toLowerCase(),
  password.trim()
);

      const vendorQuery = query(
        collection(db, "vendors"),
        where("email", "==", userCredential.user.email)
      );

      const snapshot = await getDocs(vendorQuery);

      if (snapshot.empty) {
        await signOut(auth);
        alert("Vendor Account Not Found");
        return;
      }

      const vendorData = snapshot.docs[0].data();

      const kycStatus =
        vendorData.kycStatus ||
        vendorData.kycstatus ||
        (vendorData.status === "Approved" ? "Approved" : "Pending");

      if (kycStatus === "Pending") {
        await signOut(auth);
        alert("Your KYC is under review.");
        return;
      }

      if (kycStatus === "Rejected") {
        await signOut(auth);
        alert("Your KYC was rejected. Please contact support.");
        return;
      }

      if (vendorData.status === "Pending") {
        await signOut(auth);
        alert("Vendor Approval Pending");
        return;
      }

      if (vendorData.status === "Rejected") {
        await signOut(auth);
        alert("Vendor Account Rejected");
        return;
      }

      if (vendorData.status === "Blocked") {
        await signOut(auth);
        alert("Your vendor account has been blocked. Please contact support.");
        return;
      }

     // Clear previous customer/admin session
localStorage.removeItem("user");
localStorage.removeItem("admin");

// Save seller session
localStorage.setItem(
  "vendor",
  JSON.stringify({
    uid: userCredential.user.uid,
    email: userCredential.user.email,
    vendorId: snapshot.docs[0].id,
    businessName: vendorData.businessName,
    commissionRate: vendorData.commissionRate || 10,
    pendingPayout: vendorData.pendingPayout || 0,
    totalSales: vendorData.totalSales || 0,
    totalOrders: vendorData.totalOrders || 0,
    totalRevenue: vendorData.totalRevenue || 0,
  })
);

      alert("Vendor Login Successful");
     router.replace("/seller");
    } catch (err: any) {
      if (err.code === "auth/invalid-credential") {
        alert("Invalid email or password");
      } else {
        alert("Unable to sign in. Please try again.");
console.error(err);
        alert(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 rounded-3xl shadow-xl overflow-hidden bg-white">

        {/* LEFT — brand / benefits panel */}
        <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-green-600 to-blue-600 text-white p-10">
          <div>
            <Link href="/sell" className="text-sm text-white/80 hover:text-white hover:underline">
              ← Sell on YOMICO
            </Link>

            <h2 className="mt-8 text-3xl font-bold leading-tight">
              Welcome back to your seller dashboard
            </h2>

            <p className="mt-4 text-white/90">
              Manage products, orders, inventory and payouts — all from
              one place.
            </p>
          </div>

          <div className="space-y-4 mt-10">
            <div className="flex items-center gap-3">
              <span className="text-xl">📊</span>
              <span className="text-white/90 text-sm">One dashboard for products, orders and analytics</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl">💰</span>
              <span className="text-white/90 text-sm">Track earnings, commission and payouts clearly</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl">💬</span>
              <span className="text-white/90 text-sm">Answer customer questions directly</span>
            </div>
          </div>

          <p className="text-sm text-white/70 mt-10">
            New to YOMICO?{" "}
            <Link href="/sell" className="font-semibold text-white hover:underline">
              Learn why sellers choose us
            </Link>
          </p>
        </div>

        {/* RIGHT — login form */}
        <div className="p-8 md:p-10">
          <div className="text-center mb-5">
            <Image
              src="/logo.png"
              alt="YOMICO"
              width={180}
              height={180}
              className="h-28 md:h-32 w-auto object-contain mx-auto"
            />
          </div>

          <p className="text-center text-green-600 font-semibold text-sm mb-2">
            YOMICO Seller Portal
          </p>

          <h1 className="text-3xl font-bold text-center mb-3">Vendor Login</h1>

          <p className="text-center text-gray-500 mb-8">
            Manage products, orders and grow your business
          </p>

          <div className="space-y-5">
            <input
              type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off"
              placeholder="Business Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 border rounded-2xl outline-none"
            />

            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 border rounded-2xl outline-none"
            />

            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={() => setShowPassword(!showPassword)}
                />
                <span className="text-sm text-gray-600">
                  Show Password
                </span>
              </label>

              <Link
                href="/vendor-forgot-password"
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                Forgot Password?
              </Link>
            </div>
          </div>

          <button
            onClick={loginVendor}
            disabled={loading}
            className={`w-full text-white py-4 rounded-2xl mt-8 text-lg font-bold ${
              loading
                ? "bg-gray-400"
                : "bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500"
            }`}
          >
            {loading ? "Authenticating..." : "Vendor Login"}
          </button>

          <p className="text-center mt-5">
            New Vendor?
            <Link
              href="/vendor-register"
              className="text-blue-600 font-bold ml-2 hover:underline"
            >
              Register Here
            </Link>
          </p>

          <p className="text-center mt-2 lg:hidden">
            <Link href="/sell" className="text-sm text-gray-500 hover:underline">
              Why sell on YOMICO?
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
