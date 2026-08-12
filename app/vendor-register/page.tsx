"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword,  signOut, } from "firebase/auth";
import { collection, addDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import Image from "next/image";
import Link from "next/link";

const citiesByState = {
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik"],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur"],
  Delhi: ["New Delhi"],
  Karnataka: ["Bengaluru", "Mysuru", "Hubli"],
};

export default function VendorRegisterPage() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    businessPhone: "",
    businessName: "",
    gstNumber: "",
    businessType: "Sole Proprietorship",
    street: "",
    unit: "",
    zipCode: "",
    city: "",
    state: "",
    accountHolder: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
    panNumber: "",
    aadhaarNumber: "",
    agreed: false,
  });

  // KYC document files
  const [gstDoc, setGstDoc] = useState<File | null>(null);
  const [aadhaarDoc, setAadhaarDoc] = useState<File | null>(null);
  const [chequeDoc, setChequeDoc] = useState<File | null>(null);

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const uploadKyc = async (
    uid: string,
    file: File | null,
    label: string
  ): Promise<string> => {
    if (!file) return "";
    const storageRef = ref(
      storage,
      `vendor-kyc/${uid}/${label}-${Date.now()}-${file.name}`
    );
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const registerVendor = async () => {
    if (
      !formData.fullName ||
      !formData.email ||
      !formData.password ||
      !formData.businessPhone ||
      !formData.businessName ||
      !formData.street ||
      !formData.zipCode ||
      !formData.city ||
      !formData.state ||
      !formData.accountHolder ||
      !formData.bankName ||
      !formData.accountNumber ||
      !formData.ifsc
    ) {
      alert("Please fill all required fields");
      return;
    }

    if (formData.password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

   if (!/^\d{10}$/.test(formData.businessPhone)) {
  alert("Enter valid 10 digit phone number");
  return;
}

// Aadhaar Validation
if (
  formData.aadhaarNumber &&
  !/^\d{12}$/.test(formData.aadhaarNumber)
) {
  alert("Enter a valid 12-digit Aadhaar Number");
  return;
}

// PAN Validation
if (
  formData.panNumber &&
  !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber)
) {
  alert("Invalid PAN Number");
  return;
}

// IFSC Validation
if (
  !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifsc)
) {
  alert("Invalid IFSC Code");
  return;
}

if (!aadhaarDoc || !chequeDoc) {
  alert(
    "Please upload your Aadhaar Card and Cancelled Cheque for KYC verification"
  );
  return;
}

    if (!formData.agreed) {
      alert("Please accept Terms & Conditions");
      return;
    }

    try {
      setLoading(true);

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email.trim().toLowerCase(),
        formData.password.trim()
      );

      const uid = userCredential.user.uid;

      // Upload KYC documents to Storage
      const gstDocUrl = await uploadKyc(uid, gstDoc, "gst");
      const aadhaarDocUrl = await uploadKyc(uid, aadhaarDoc, "aadhaar");
      const chequeDocUrl = await uploadKyc(uid, chequeDoc, "cheque");

      await addDoc(collection(db, "vendors"), {
        uid,
        fullName: formData.fullName,
        email: formData.email.trim().toLowerCase(),
        businessPhone: formData.businessPhone,
        businessName: formData.businessName,
        gstNumber: formData.gstNumber,
        businessType: formData.businessType,
        street: formData.street,
        unit: formData.unit,
        zipCode: formData.zipCode,
        city: formData.city,
        state: formData.state,
        accountHolder: formData.accountHolder,
        bankName: formData.bankName,
        accountNumber: formData.accountNumber,
        ifsc: formData.ifsc,
        panNumber: formData.panNumber,
        aadhaarNumber: formData.aadhaarNumber,

        // KYC document URLs
        gstDocUrl,
        aadhaarDocUrl,
        chequeDocUrl,
        kycStatus: "Pending",

        agreed: formData.agreed,
        storeLogo: "",
        storeBanner: "",
        rating: 0,
        totalProducts: 0,
        status: "Pending",
        commissionRate: 10,
        totalSales: 0,
        totalOrders: 0,
        totalRevenue: 0,
        pendingPayout: 0,
        createdAt: serverTimestamp(),
      });

      // Public-safe mirror for storefront pages — vendors/ holds banking &
      // KYC PII and is locked to owner/admin only, so store/seller pages
      // read from this doc instead.
      await setDoc(doc(db, "vendors_public", uid), {
        uid,
        businessName: formData.businessName,
        fullName: formData.fullName,
        email: formData.email.trim().toLowerCase(),
        businessPhone: formData.businessPhone,
        businessType: formData.businessType,
        city: formData.city,
        state: formData.state,
        storeLogo: "",
        storeBanner: "",
        rating: 0,
        totalOrders: 0,
        totalSales: 0,
        totalRevenue: 0,
        status: "Pending",
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "notifications"), {
        title: "New Vendor Registration",
        message: `${formData.businessName} registered as a vendor`,
        type: "vendor",
        read: false,
        createdAt: serverTimestamp(),
      });

      await signOut(auth);
      alert(
  "Vendor Registration Submitted.\n\nYour account is awaiting admin approval.");
   window.location.replace("/vendor-login");

    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        alert("Email already registered");
      } else {
        alert(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const fileLabel = (file: File | null) =>
    file ? file.name : "No file chosen";

  const sections = [
    {
      label: "Account",
      icon: "👤",
      done: !!(
        formData.fullName &&
        formData.email &&
        formData.password.length >= 6 &&
        /^\d{10}$/.test(formData.businessPhone)
      ),
    },
    {
      label: "Business",
      icon: "🏬",
      done: !!formData.businessName,
    },
    {
      label: "Address",
      icon: "📍",
      done: !!(
        formData.street &&
        formData.zipCode &&
        formData.city &&
        formData.state
      ),
    },
    {
      label: "Bank",
      icon: "🏦",
      done: !!(
        formData.accountHolder &&
        formData.bankName &&
        formData.accountNumber &&
        formData.ifsc
      ),
    },
    {
      label: "Documents",
      icon: "📄",
      done: !!(aadhaarDoc && chequeDoc),
    },
    {
      label: "Review",
      icon: "✅",
      done: formData.agreed,
    },
  ];

  const completedCount = sections.filter((section) => section.done).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-16">

      {/* HERO */}
      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white">
        <div className="max-w-5xl mx-auto px-6 py-12">

          <Link href="/sell" className="text-sm text-white/80 hover:text-white hover:underline">
            ← Sell on YOMICO
          </Link>

          <div className="mt-4 flex items-center gap-5">
            <Image
              src="/logo.png"
              alt="YOMICO"
              width={90}
              height={90}
              className="h-16 w-16 md:h-20 md:w-20 object-contain rounded-2xl bg-white p-2"
            />

            <div>
              <p className="text-sm uppercase tracking-widest opacity-80">
                YOMICO Seller Portal
              </p>
              <h1 className="text-3xl md:text-4xl font-bold">
                Become a Vendor
              </h1>
            </div>
          </div>

          <p className="mt-4 max-w-xl opacity-90">
            Fill in your business, address, bank and KYC details below.
            Your application will be reviewed by the YOMICO team before
            you can start selling.
          </p>

        </div>
      </div>

      {/* PROGRESS STEPPER */}
      <div className="max-w-5xl mx-auto px-6 -mt-8">
        <div className="bg-white rounded-2xl shadow-lg p-5">

          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">
              Application progress
            </span>
            <span className="text-sm font-semibold text-green-600">
              {completedCount} of {sections.length} sections complete
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <span
                key={section.label}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                  section.done
                    ? "bg-green-50 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <span>{section.icon}</span>
                {section.done ? "✓" : "○"} {section.label}
              </span>
            ))}
          </div>

        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 mt-8 space-y-6">

        {/* BASIC */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-lg">
              👤
            </div>
            <h2 className="text-2xl font-bold">Account Details</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <input
              type="text"
              name="fullName"
              placeholder="Full Name"
              value={formData.fullName}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <input
              type="email"
               autoComplete="email"
              name="email"
              placeholder="Business Email"
              value={formData.email}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <input
              type={showPassword ? "text" : "password"}
               autoComplete="new-password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <input
             type="tel"name="businessPhone"
             inputMode="numeric"
             maxLength={10}
             autoComplete="tel"
              placeholder="Business Phone"
              value={formData.businessPhone}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={() => setShowPassword(!showPassword)}
              />
              Show Password
            </label>
          </div>
        </div>

        {/* BUSINESS */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-lg">
              🏬
            </div>
            <h2 className="text-2xl font-bold">Business Details</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <input
              type="text"
              name="businessName"
              placeholder="Business Name"
              value={formData.businessName}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <input
              type="text"
              name="gstNumber"
              placeholder="GST Number (Optional)"
              value={formData.gstNumber}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
           <input
  type="text"
  placeholder="PAN Number"
  name="panNumber"
  value={formData.panNumber}
  onChange={(e) =>
    setFormData({
      ...formData,
      panNumber: e.target.value.toUpperCase(),
    })
  }
  className="w-full border p-4 rounded-2xl"
/>
            <input
              type="text"
              placeholder="Aadhaar Number"
              name="aadhaarNumber"
              value={formData.aadhaarNumber}
              onChange={handleChange}
              className="w-full border p-4 rounded-2xl"
            />
            <select
              name="businessType"
              value={formData.businessType}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            >
              <option>Sole Proprietorship</option>
              <option>Partnership</option>
              <option>Private Limited</option>
              <option>LLP</option>
              <option>Other</option>
            </select>
          </div>
        </div>

        {/* ADDRESS */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-lg">
              📍
            </div>
            <h2 className="text-2xl font-bold">Business Address</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <input
              type="text"
              name="street"
              placeholder="Street Address"
              value={formData.street}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <input
              type="text"
              name="unit"
              placeholder="Unit / Floor"
              value={formData.unit}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <input
              type="text"
              name="zipCode" inputMode="numeric"maxLength={6}autoComplete="postal-code"
              placeholder="ZIP Code"
              value={formData.zipCode}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <select
              name="state"
              value={formData.state}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            >
              <option value="">Select State</option>
              <option value="Gujarat">Gujarat</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Rajasthan">Rajasthan</option>
              <option value="Delhi">Delhi</option>
              <option value="Karnataka">Karnataka</option>
            </select>
            <select
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            >
              <option value="">Select City</option>
              {(
                citiesByState[
                  formData.state as keyof typeof citiesByState
                ] || []
              ).map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* BANK */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-lg">
              🏦
            </div>
            <h2 className="text-2xl font-bold">Bank Details</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <input
              type="text"
              name="accountHolder"
              placeholder="Account Holder"
              value={formData.accountHolder}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <input
              type="text"
              name="bankName"
              placeholder="Bank Name"
              value={formData.bankName}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <input
              type="text"
              name="accountNumber"
              placeholder="Account Number"
              value={formData.accountNumber}
              onChange={handleChange}
              className="p-4 border rounded-2xl"
            />
            <input
              type="text"
              name="ifsc"
              placeholder="IFSC Code"
              value={formData.ifsc}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  ifsc: e.target.value.toUpperCase(),
                })
              }
              className="p-4 border rounded-2xl"
            />
          </div>
        </div>

        {/* KYC DOCUMENTS */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-lg">
              📄
            </div>
            <h2 className="text-2xl font-bold">KYC Documents</h2>
          </div>
          <p className="text-gray-500 mb-6">
            Upload clear images or PDFs. These are reviewed before approval.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* GST Certificate */}
            <div className="border rounded-2xl p-5">
              <label className="block font-semibold mb-2">
                GST Certificate{" "}
                <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setGstDoc(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <p className="text-xs text-gray-500 mt-2 truncate">
                {fileLabel(gstDoc)}
              </p>
            </div>

            {/* Aadhaar Card */}
            <div className="border rounded-2xl p-5">
              <label className="block font-semibold mb-2">
                Aadhaar Card <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setAadhaarDoc(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <p className="text-xs text-gray-500 mt-2 truncate">
                {fileLabel(aadhaarDoc)}
              </p>
            </div>

            {/* Cancelled Cheque */}
            <div className="border rounded-2xl p-5">
              <label className="block font-semibold mb-2">
                Cancelled Cheque <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setChequeDoc(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <p className="text-xs text-gray-500 mt-2 truncate">
                {fileLabel(chequeDoc)}
              </p>
            </div>
          </div>
        </div>

        {/* REVIEW & SUBMIT */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-lg">
              ✅
            </div>
            <h2 className="text-2xl font-bold">Review &amp; Submit</h2>
          </div>

          <div className="bg-gray-50 p-6 rounded-2xl mb-6">
            <label className="flex items-center gap-3 text-lg font-medium">
              <input
                type="checkbox"
                name="agreed"
                checked={formData.agreed}
                onChange={handleChange}
                className="w-5 h-5"
              />
              I agree to the Terms &amp; Conditions
            </label>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6">
            <p className="text-green-700 text-sm">
              Your application will be reviewed by the YOMICO team before approval.
            </p>
          </div>

          <button
            onClick={registerVendor}
            disabled={loading}
            className={`w-full text-white py-5 rounded-2xl text-xl font-bold ${
              loading
                ? "bg-gray-400"
                : "bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500"
            }`}
          >
            {loading ? "Submitting..." : "Register As Vendor"}
          </button>

          <p className="text-center mt-6 text-gray-600">
            Already a seller?{" "}
            <a
              href="/vendor-login"
              className="text-blue-600 font-semibold hover:underline"
            >
              Login here
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
