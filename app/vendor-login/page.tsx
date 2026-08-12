"use client";

import { useEffect, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

  const FEATURES = [
    {
      icon: "🧑‍🤝‍🧑",
      title: "Reach more customers",
      description: "Put your products in front of customers shopping on YOMICO.",
    },
    {
      icon: "📦",
      title: "Easy product management",
      description: "Add products, manage inventory and update your catalog easily.",
    },
    {
      icon: "📊",
      title: "Business insights",
      description: "Track orders, sales, earnings and product performance.",
    },
    {
      icon: "💰",
      title: "Seller earnings",
      description: "Manage payouts, wallet balance and seller transactions.",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 rounded-3xl shadow-xl overflow-hidden bg-white">

        {/* LEFT — brand / benefits panel */}
        <div className="relative hidden lg:block overflow-hidden bg-gradient-to-br from-teal-600 via-green-600 to-blue-600 text-white p-10">

          <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute bottom-0 -left-10 h-40 w-40 rounded-full bg-white/5" />

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
              YOMICO Seller Platform
            </p>

            <h2 className="mt-4 font-serif text-4xl font-bold leading-tight">
              Grow your business
              <br />
              with <span className="text-yellow-300">YOMICO</span>
            </h2>

            <p className="mt-4 text-white/90">
              Reach customers, manage your products, track orders and
              grow your online business from one powerful seller platform.
            </p>

            <div className="mt-10 space-y-5">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg">
                    {feature.icon}
                  </div>
                  <div>
                    <p className="font-bold">{feature.title}</p>
                    <p className="text-sm text-white/70">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT — login form */}
        <div className="p-8 md:p-10">

          <h1 className="font-serif text-3xl font-bold">Seller Login</h1>

          <p className="mt-2 text-gray-500">
            Login to your YOMICO seller account and manage your business.
          </p>

          <div className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 bg-blue-50 rounded-xl outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">
                  Password
                </label>

                <Link
                  href="/vendor-forgot-password"
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-4 bg-blue-50 rounded-xl outline-none pr-16"
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
            onClick={loginVendor}
            disabled={loading}
            className={`w-full text-white py-4 rounded-xl mt-8 text-lg font-bold ${
              loading
                ? "bg-gray-400"
                : "bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500"
            }`}
          >
            {loading ? "Authenticating..." : "Login to Seller Account"}
          </button>

          <div className="flex items-center gap-4 my-6">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-semibold text-gray-400">OR</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <Link
            href="/vendor-register"
            className="block w-full text-center border-2 border-blue-600 text-blue-600 py-4 rounded-xl font-bold hover:bg-blue-50"
          >
            Create Seller Account
          </Link>

          <div className="mt-6 flex items-start gap-3 rounded-xl bg-gray-50 p-4">
            <span className="text-lg">🔒</span>
            <div>
              <p className="font-semibold text-gray-800 text-sm">
                Secure Seller Login
              </p>
              <p className="text-sm text-gray-500">
                Your account information is protected using secure authentication.
              </p>
            </div>
          </div>

          <p className="text-center mt-6 text-sm text-gray-500">
            Need help?{" "}
            <Link href="/sell#contact" className="font-semibold text-blue-600 hover:underline">
              Contact Seller Support
            </Link>
          </p>

        </div>

      </div>
    </div>
  );
}
