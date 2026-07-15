"use client";

import { useEffect, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

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
        email.toLowerCase(),
        password
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
      router.push("/seller");
    } catch (err: any) {
      if (err.code === "auth/invalid-credential") {
        alert("Invalid email or password");
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
            alt="Yogi Mart"
            className="w-40 mx-auto mb-3"
          />
        </div>

        <p className="text-center text-green-600 font-semibold text-sm mb-2">
          Yogi Mart Seller Portal
        </p>

        <h1 className="text-4xl font-bold text-center mb-3">Vendor Login</h1>

        <p className="text-center text-gray-500 mb-8">
          Manage products, orders and grow your business
        </p>

        <div className="space-y-5">
          <input
            type="email"
            placeholder="Business Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 border rounded-2xl outline-none"
          />

          <input
            type={showPassword ? "text" : "password"}
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
              <span className="text-sm text-gray-600">Show Password</span>
            </label>

            <a
              href="/vendor-forgot-password"
              className="text-blue-600 font-semibold text-sm"
            >
              Forgot Password?
            </a>
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
          {loading ? "Logging In..." : "Vendor Login"}
        </button>

        <p className="text-center mt-5">
          New Vendor?
          <a
            href="/vendor-register"
            className="text-blue-600 font-bold ml-2"
          >
            Register Here
          </a>
        </p>
      </div>
    </div>
  );
}
