"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import {
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import { auth, db, storage } from "@/lib/firebase";

const citiesByState = {
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik"],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur"],
  Delhi: ["New Delhi"],
  Karnataka: ["Bengaluru", "Mysuru", "Hubli"],
};

type FormDataType = {
  fullName: string;
  email: string;
  password: string;
  businessPhone: string;
  businessName: string;
  gstNumber: string;
  businessType: string;
  street: string;
  unit: string;
  zipCode: string;
  city: string;
  state: string;
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  panNumber: string;
  aadhaarNumber: string;
  agreed: boolean;
};

type StepStatus = "completed" | "current" | "pending";

export default function VendorRegisterPage() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState<FormDataType>({
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

  const [gstDoc, setGstDoc] = useState<File | null>(null);
  const [aadhaarDoc, setAadhaarDoc] = useState<File | null>(null);
  const [chequeDoc, setChequeDoc] = useState<File | null>(null);

  const handleChange = (
    e: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;

    const checked =
      type === "checkbox" &&
      (e.target as HTMLInputElement).checked;

    setFormData((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
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

  const progress = useMemo(() => {
    let completed = 0;

    if (
      formData.fullName &&
      formData.email &&
      formData.password &&
      formData.businessPhone
    ) {
      completed += 1;
    }

    if (
      formData.businessName &&
      formData.businessType &&
      formData.panNumber
    ) {
      completed += 1;
    }

    if (
      formData.street &&
      formData.zipCode &&
      formData.state &&
      formData.city
    ) {
      completed += 1;
    }

    if (
      formData.accountHolder &&
      formData.bankName &&
      formData.accountNumber &&
      formData.ifsc
    ) {
      completed += 1;
    }

    if (aadhaarDoc && chequeDoc) {
      completed += 1;
    }

    if (formData.agreed) {
      completed += 1;
    }

    return Math.round((completed / 6) * 100);
  }, [formData, aadhaarDoc, chequeDoc]);

  const getStepStatus = (
    index: number
  ): StepStatus => {
    const statuses: StepStatus[] = [
      formData.fullName &&
      formData.email &&
      formData.password &&
      formData.businessPhone
        ? "completed"
        : "current",

      formData.businessName &&
      formData.businessType &&
      formData.panNumber
        ? "completed"
        : "pending",

      formData.street &&
      formData.zipCode &&
      formData.state &&
      formData.city
        ? "completed"
        : "pending",

      formData.accountHolder &&
      formData.bankName &&
      formData.accountNumber &&
      formData.ifsc
        ? "completed"
        : "pending",

      aadhaarDoc && chequeDoc
        ? "completed"
        : "pending",

      formData.agreed
        ? "completed"
        : "pending",
    ];

    if (
      statuses[index] === "completed"
    ) {
      return "completed";
    }

    const firstPending = statuses.findIndex(
      (item) => item !== "completed"
    );

    if (index === firstPending) {
      return "current";
    }

    return "pending";
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
      alert(
        "Please complete all required seller details."
      );
      return;
    }

    if (formData.password.length < 6) {
      alert(
        "Password must be at least 6 characters."
      );
      return;
    }

    if (
      !/^\d{10}$/.test(
        formData.businessPhone
      )
    ) {
      alert(
        "Enter a valid 10 digit phone number."
      );
      return;
    }

    if (
      formData.zipCode &&
      !/^\d{6}$/.test(formData.zipCode)
    ) {
      alert(
        "Enter a valid 6 digit PIN code."
      );
      return;
    }

    if (
      formData.aadhaarNumber &&
      !/^\d{12}$/.test(
        formData.aadhaarNumber
      )
    ) {
      alert(
        "Enter a valid 12 digit Aadhaar number."
      );
      return;
    }

    if (
      formData.panNumber &&
      !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(
        formData.panNumber
      )
    ) {
      alert("Enter a valid PAN number.");
      return;
    }

    if (
      !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
        formData.ifsc
      )
    ) {
      alert("Enter a valid IFSC code.");
      return;
    }

    if (!aadhaarDoc || !chequeDoc) {
      alert(
        "Please upload your Aadhaar Card and Cancelled Cheque for KYC verification."
      );
      return;
    }

    if (!formData.agreed) {
      alert(
        "Please accept the YOMICO Seller Agreement and Terms."
      );
      return;
    }

    try {
      setLoading(true);

      const userCredential =
        await createUserWithEmailAndPassword(
          auth,
          formData.email.trim().toLowerCase(),
          formData.password.trim()
        );

      const uid = userCredential.user.uid;

      const gstDocUrl = await uploadKyc(
        uid,
        gstDoc,
        "gst"
      );

      const aadhaarDocUrl =
        await uploadKyc(
          uid,
          aadhaarDoc,
          "aadhaar"
        );

      const chequeDocUrl =
        await uploadKyc(
          uid,
          chequeDoc,
          "cheque"
        );

      await addDoc(
        collection(db, "vendors"),
        {
          uid,

          fullName:
            formData.fullName,

          email:
            formData.email
              .trim()
              .toLowerCase(),

          businessPhone:
            formData.businessPhone,

          businessName:
            formData.businessName,

          gstNumber:
            formData.gstNumber,

          businessType:
            formData.businessType,

          street:
            formData.street,

          unit:
            formData.unit,

          zipCode:
            formData.zipCode,

          city:
            formData.city,

          state:
            formData.state,

          accountHolder:
            formData.accountHolder,

          bankName:
            formData.bankName,

          accountNumber:
            formData.accountNumber,

          ifsc:
            formData.ifsc,

          panNumber:
            formData.panNumber,

          aadhaarNumber:
            formData.aadhaarNumber,

          gstDocUrl,
          aadhaarDocUrl,
          chequeDocUrl,

          kycStatus: "Pending",

          agreed:
            formData.agreed,

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

          createdAt:
            serverTimestamp(),
        }
      );

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

      await addDoc(
        collection(db, "notifications"),
        {
          title:
            "New Vendor Registration",

          message:
            `${formData.businessName} registered as a vendor`,

          role: "admin",

          type: "vendor",

          read: false,

          createdAt:
            serverTimestamp(),
        }
      );

      await signOut(auth);

      alert(
        "Vendor Registration Submitted.\n\nYour account is awaiting YOMICO admin approval."
      );

      window.location.replace(
        "/vendor-login"
      );
    } catch (err: any) {
      console.error(
        "Vendor registration error:",
        err
      );

      if (
        err.code ===
        "auth/email-already-in-use"
      ) {
        alert(
          "This email is already registered."
        );
      } else {
        alert(
          err.message ||
            "Unable to complete registration."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const stateCities =
    formData.state
      ? citiesByState[
          formData.state as keyof typeof citiesByState
        ] || []
      : [];

  const stepItems = [
    {
      title: "Account Details",
      subtitle:
        "Mobile, email & password",
    },
    {
      title: "Business Verification",
      subtitle:
        "Business, PAN & GST",
    },
    {
      title: "Store & Pickup",
      subtitle:
        "Address & location",
    },
    {
      title: "Bank & Payout",
      subtitle:
        "Settlement details",
    },
    {
      title: "KYC Documents",
      subtitle:
        "Identity & bank proof",
    },
    {
      title: "Agreement",
      subtitle:
        "Terms & submission",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">

      {/* =====================================================
          TOP SAFFRON HEADER
      ====================================================== */}

      <header className="bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 text-white">

        <div className="max-w-7xl mx-auto px-5 sm:px-8">

          <div className="h-20 flex items-center justify-between">

            <Link
              href="/"
              className="font-extrabold tracking-wide text-lg"
            >
              YOMICO
            </Link>

            <div className="flex items-center gap-5">

              <Link
                href="/sell"
                target="_blank"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/30 hover:bg-white/25 transition"
              >
                📘 Seller Kit
              </Link>

              <Link
                href="/"
                className="font-semibold hover:underline"
              >
                ← Back to YOMICO
              </Link>

            </div>

          </div>

        </div>

      </header>

      {/* =====================================================
          SELLER HERO
      ====================================================== */}

      <section className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 text-white">

        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-24 -left-20 w-80 h-80 rounded-full bg-white blur-3xl" />
          <div className="absolute -bottom-40 right-0 w-96 h-96 rounded-full bg-blue-300 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-12">

          <div className="max-w-4xl">

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/20 text-sm font-semibold mb-5">
              YOMICO SELLER PORTAL
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tight">
              Become a YOMICO Seller
            </h1>

            <p className="mt-4 text-lg md:text-xl text-white/85 max-w-2xl">
              Build your online business, reach customers,
              manage products and grow with YOMICO.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">

              <Link
                href="/sell"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-xl bg-white text-blue-700 px-5 py-3 font-bold shadow-lg hover:-translate-y-0.5 transition"
              >
                📘 Open YOMICO Seller Kit
              </Link>

              <Link
                href="/vendor-login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 py-3 font-bold hover:bg-white/20 transition"
              >
                Already a Seller? Login
              </Link>

            </div>

          </div>

        </div>

      </section>

      {/* =====================================================
          MAIN ONBOARDING AREA
      ====================================================== */}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-8">

          {/* =================================================
              LEFT PROGRESS PANEL
          ================================================== */}

          <aside className="lg:sticky lg:top-6 self-start">

            <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">

              <div className="p-5 bg-gradient-to-br from-orange-50 to-amber-50 border-b border-orange-100">

                <div className="flex items-center justify-between mb-3">

                  <span className="text-sm font-bold text-slate-800">
                    Your onboarding
                  </span>

                  <span className="text-sm font-black text-orange-600">
                    {progress}%
                  </span>

                </div>

                <div className="h-2.5 rounded-full bg-white border border-orange-200 overflow-hidden">

                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
                    style={{
                      width: `${progress}%`,
                    }}
                  />

                </div>

                <p className="text-xs text-slate-500 mt-3">
                  Complete your seller profile to submit
                  your application.
                </p>

              </div>

              <div className="p-4">

                <div className="space-y-1">

                  {stepItems.map(
                    (step, index) => {

                      const status =
                        getStepStatus(index);

                      return (
                        <a
                          key={step.title}
                          href={`#step-${index + 1}`}
                          className={`group flex gap-3 p-3 rounded-2xl transition ${
                            status === "current"
                              ? "bg-blue-50"
                              : "hover:bg-slate-50"
                          }`}
                        >

                          <div
                            className={`mt-0.5 w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-black ${
                              status ===
                              "completed"
                                ? "bg-emerald-100 text-emerald-700"
                                : status ===
                                  "current"
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {status ===
                            "completed"
                              ? "✓"
                              : index + 1}
                          </div>

                          <div className="min-w-0">

                            <p
                              className={`text-sm font-bold ${
                                status ===
                                "current"
                                  ? "text-blue-700"
                                  : "text-slate-800"
                              }`}
                            >
                              {step.title}
                            </p>

                            <p className="text-xs text-slate-400 mt-0.5">
                              {step.subtitle}
                            </p>

                          </div>

                        </a>
                      );
                    }
                  )}

                </div>

                <div className="mt-5 pt-5 border-t border-slate-100">

                  <Link
                    href="/sell"
                    target="_blank"
                    className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 hover:bg-blue-100 transition"
                  >

                    <div>
                      <p className="text-sm font-bold text-blue-800">
                        📘 YOMICO Seller Kit
                      </p>

                      <p className="text-xs text-blue-600 mt-1">
                        Read before registering
                      </p>
                    </div>

                    <span className="text-blue-600">
                      ↗
                    </span>

                  </Link>

                </div>

              </div>

            </div>

          </aside>

          {/* =================================================
              FORM
          ================================================== */}

          <div className="space-y-7">

            {/* =============================================
                STEP 1
            ============================================== */}

            <section
              id="step-1"
              className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 scroll-mt-6"
            >

              <SectionHeader
                number="01"
                title="Account Details"
                description="Create the account you will use to manage your YOMICO seller business."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <InputField
                  label="Full Name"
                  required
                  name="fullName"
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChange={handleChange}
                />

                <InputField
                  label="Business Email"
                  required
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="Enter business email"
                  value={formData.email}
                  onChange={handleChange}
                />

                <div>

                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Password <span className="text-red-500">*</span>
                  </label>

                  <div className="relative">

                    <input
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      name="password"
                      autoComplete="new-password"
                      placeholder="Create a password"
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 pr-24 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          (value) => !value
                        )
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-600"
                    >
                      {showPassword
                        ? "Hide"
                        : "Show"}
                    </button>

                  </div>

                  <p className="text-xs text-slate-400 mt-2">
                    Minimum 6 characters.
                  </p>

                </div>

                <InputField
                  label="Business Phone"
                  required
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="tel"
                  name="businessPhone"
                  placeholder="10 digit mobile number"
                  value={formData.businessPhone}
                  onChange={handleChange}
                />

              </div>

              <InfoBox>
                Your mobile number and email will be used
                for important account communication and
                seller updates.
              </InfoBox>

            </section>

            {/* =============================================
                STEP 2
            ============================================== */}

            <section
              id="step-2"
              className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 scroll-mt-6"
            >

              <SectionHeader
                number="02"
                title="Business Verification"
                description="Tell us about the business you want to operate on YOMICO."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <InputField
                  label="Business / Trade Name"
                  required
                  name="businessName"
                  placeholder="Enter business name"
                  value={formData.businessName}
                  onChange={handleChange}
                />

                <SelectField
                  label="Business Type"
                  name="businessType"
                  value={formData.businessType}
                  onChange={handleChange}
                  options={[
                    "Sole Proprietorship",
                    "Partnership",
                    "Private Limited",
                    "LLP",
                    "Other",
                  ]}
                />

                <InputField
                  label="PAN Number"
                  name="panNumber"
                  placeholder="ABCDE1234F"
                  value={formData.panNumber}
                  onChange={(e) =>
                    setFormData(
                      (previous) => ({
                        ...previous,
                        panNumber:
                          e.target.value.toUpperCase(),
                      })
                    )
                  }
                />

                <InputField
                  label="GSTIN"
                  name="gstNumber"
                  placeholder="GST number where applicable"
                  value={formData.gstNumber}
                  onChange={(e) =>
                    setFormData(
                      (previous) => ({
                        ...previous,
                        gstNumber:
                          e.target.value.toUpperCase(),
                      })
                    )
                  }
                />

                <InputField
                  label="Aadhaar Number"
                  name="aadhaarNumber"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="12 digit Aadhaar number"
                  value={formData.aadhaarNumber}
                  onChange={handleChange}
                />

              </div>

              <InfoBox>
                Enter your legal/business information
                exactly as it appears on your supporting
                documents.
              </InfoBox>

            </section>

            {/* =============================================
                STEP 3
            ============================================== */}

            <section
              id="step-3"
              className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 scroll-mt-6"
            >

              <SectionHeader
                number="03"
                title="Store & Pickup Details"
                description="Tell YOMICO where your business operates and where orders will be prepared for pickup."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <InputField
                  label="Street Address"
                  required
                  name="street"
                  placeholder="House / building / street"
                  value={formData.street}
                  onChange={handleChange}
                />

                <InputField
                  label="Unit / Floor"
                  name="unit"
                  placeholder="Unit, shop or floor"
                  value={formData.unit}
                  onChange={handleChange}
                />

                <InputField
                  label="PIN Code"
                  required
                  name="zipCode"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="postal-code"
                  placeholder="6 digit PIN code"
                  value={formData.zipCode}
                  onChange={handleChange}
                />

                <SelectField
                  label="State"
                  required
                  name="state"
                  value={formData.state}
                  onChange={(e) => {
                    setFormData(
                      (previous) => ({
                        ...previous,
                        state:
                          e.target.value,
                        city: "",
                      })
                    );
                  }}
                  options={[
                    "Gujarat",
                    "Maharashtra",
                    "Rajasthan",
                    "Delhi",
                    "Karnataka",
                  ]}
                  placeholder="Select State"
                />

                <SelectField
                  label="City"
                  required
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  disabled={!formData.state}
                  options={stateCities}
                  placeholder={
                    formData.state
                      ? "Select City"
                      : "Select State First"
                  }
                />

              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">

                <p className="font-bold text-slate-800">
                  📍 Pickup Address
                </p>

                <p className="text-sm text-slate-500 mt-1">
                  This address will be used as your
                  business/pickup location during seller
                  operations.
                </p>

                {formData.street &&
                  formData.city &&
                  formData.state && (
                    <div className="mt-4 rounded-xl bg-white border border-slate-200 p-4 text-sm">
                      <span className="font-semibold">
                        Current address:
                      </span>{" "}
                      {formData.street},{" "}
                      {formData.unit
                        ? `${formData.unit}, `
                        : ""}
                      {formData.city},{" "}
                      {formData.state} -{" "}
                      {formData.zipCode}
                    </div>
                  )}

              </div>

            </section>

            {/* =============================================
                STEP 4
            ============================================== */}

            <section
              id="step-4"
              className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 scroll-mt-6"
            >

              <SectionHeader
                number="04"
                title="Bank & Payout Details"
                description="Provide the account where eligible seller settlements and withdrawals can be processed."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <InputField
                  label="Account Holder Name"
                  required
                  name="accountHolder"
                  placeholder="Name as per bank account"
                  value={formData.accountHolder}
                  onChange={handleChange}
                />

                <InputField
                  label="Bank Name"
                  required
                  name="bankName"
                  placeholder="Enter bank name"
                  value={formData.bankName}
                  onChange={handleChange}
                />

                <InputField
                  label="Account Number"
                  required
                  name="accountNumber"
                  inputMode="numeric"
                  placeholder="Enter account number"
                  value={formData.accountNumber}
                  onChange={handleChange}
                />

                <InputField
                  label="IFSC Code"
                  required
                  name="ifsc"
                  placeholder="ABCD0123456"
                  value={formData.ifsc}
                  onChange={(e) =>
                    setFormData(
                      (previous) => ({
                        ...previous,
                        ifsc:
                          e.target.value.toUpperCase(),
                      })
                    )
                  }
                />

              </div>

              <div className="mt-6 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5">

                <span className="text-xl">
                  🔐
                </span>

                <div>
                  <p className="font-bold text-blue-900">
                    Your banking information is sensitive
                  </p>

                  <p className="text-sm text-blue-700 mt-1">
                    Make sure the account holder name
                    matches your supporting bank document.
                  </p>
                </div>

              </div>

            </section>

            {/* =============================================
                STEP 5
            ============================================== */}

            <section
              id="step-5"
              className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 scroll-mt-6"
            >

              <SectionHeader
                number="05"
                title="KYC Documents"
                description="Upload clear and readable supporting documents for verification."
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                <FileUploadCard
                  title="GST Certificate"
                  optional
                  file={gstDoc}
                  onChange={(file) =>
                    setGstDoc(file)
                  }
                />

                <FileUploadCard
                  title="Aadhaar Card"
                  required
                  file={aadhaarDoc}
                  onChange={(file) =>
                    setAadhaarDoc(file)
                  }
                />

                <FileUploadCard
                  title="Cancelled Cheque"
                  required
                  file={chequeDoc}
                  onChange={(file) =>
                    setChequeDoc(file)
                  }
                />

              </div>

              <InfoBox>
                Accepted formats: JPG, PNG and PDF.
                Upload clear documents. Verification may
                fail if details do not match.
              </InfoBox>

            </section>

            {/* =============================================
                STEP 6
            ============================================== */}

            <section
              id="step-6"
              className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 scroll-mt-6"
            >

              <SectionHeader
                number="06"
                title="Agreement & Submission"
                description="Review the seller information and accept the YOMICO seller terms before submitting."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">

                <Link
                  href="/sell"
                  target="_blank"
                  className="group rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 hover:-translate-y-1 hover:shadow-md transition"
                >

                  <div className="flex items-start justify-between">

                    <div>
                      <div className="text-2xl mb-2">
                        📘
                      </div>

                      <h3 className="font-black text-blue-900">
                        YOMICO Seller Kit
                      </h3>

                      <p className="text-sm text-blue-700 mt-1">
                        Read the seller onboarding guide
                        before submitting.
                      </p>
                    </div>

                    <span className="text-blue-600">
                      ↗
                    </span>

                  </div>

                </Link>

                <Link
                  href="/seller-agreement"
                  target="_blank"
                  className="group rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 hover:-translate-y-1 hover:shadow-md transition"
                >

                  <div className="flex items-start justify-between">

                    <div>
                      <div className="text-2xl mb-2">
                        📄
                      </div>

                      <h3 className="font-black text-emerald-900">
                        Seller Agreement
                      </h3>

                      <p className="text-sm text-emerald-700 mt-1">
                        Review the current seller agreement.
                      </p>
                    </div>

                    <span className="text-emerald-600">
                      ↗
                    </span>

                  </div>

                </Link>

              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">

                <label className="flex items-start gap-3 cursor-pointer">

                  <input
                    type="checkbox"
                    name="agreed"
                    checked={formData.agreed}
                    onChange={handleChange}
                    className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />

                  <span className="text-sm text-slate-700 leading-6">
                    I confirm that the information provided
                    by me is accurate and I agree to the
                    applicable YOMICO Seller Agreement,
                    Terms & Conditions and seller policies.
                  </span>

                </label>

              </div>

              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">

                <div className="flex gap-3">

                  <span className="text-xl">
                    ⚡
                  </span>

                  <div>

                    <p className="font-bold text-amber-900">
                      What happens after submission?
                    </p>

                    <p className="text-sm text-amber-800 mt-1 leading-6">
                      Your seller account and submitted
                      KYC information will enter the YOMICO
                      verification process. Your account
                      remains pending until the required
                      approval is completed.
                    </p>

                  </div>

                </div>

              </div>

              <button
                type="button"
                onClick={registerVendor}
                disabled={loading}
                className={`mt-7 w-full rounded-2xl py-4 text-lg font-black text-white shadow-lg transition ${
                  loading
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:-translate-y-0.5 hover:shadow-xl"
                }`}
              >
                {loading
                  ? "Submitting Seller Application..."
                  : "Submit Seller Application →"}
              </button>

              <p className="text-center text-sm text-slate-500 mt-5">

                Already a YOMICO seller?{" "}

                <Link
                  href="/vendor-login"
                  className="font-bold text-blue-600 hover:underline"
                >
                  Login to Seller Portal
                </Link>

              </p>

            </section>

          </div>

        </div>

      </section>

      {/* =====================================================
          FOOTER
      ====================================================== */}

      <footer className="border-t border-slate-200 bg-white">

        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">

          <div className="flex flex-col md:flex-row items-center justify-between gap-4">

            <div>

              <p className="font-black text-slate-900">
                YOMICO Seller Portal
              </p>

              <p className="text-sm text-slate-500 mt-1">
                Build your business. Sell with confidence.
              </p>

            </div>

            <div className="flex gap-5 text-sm">

              <Link
                href="/sell"
                target="_blank"
                className="text-blue-600 font-semibold hover:underline"
              >
                Seller Kit
              </Link>

              <Link
                href="/seller-agreement"
                className="text-slate-600 hover:text-blue-600"
              >
                Seller Agreement
              </Link>

              <Link
                href="/vendor-login"
                className="text-slate-600 hover:text-blue-600"
              >
                Seller Login
              </Link>

            </div>

          </div>

        </div>

      </footer>

    </main>
  );
}

/* ============================================================
   REUSABLE COMPONENTS
============================================================ */

function SectionHeader({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">

      <div className="flex items-start gap-4">

        <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-white flex items-center justify-center font-black shadow-md">
          {number}
        </div>

        <div>

          <h2 className="text-2xl md:text-3xl font-black text-slate-900">
            {title}
          </h2>

          <p className="text-sm md:text-base text-slate-500 mt-1 max-w-2xl">
            {description}
          </p>

        </div>

      </div>

      <div className="mt-6 h-px bg-slate-100" />

    </div>
  );
}

function InputField({
  label,
  required,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  maxLength,
  autoComplete,
}: {
  label: string;
  required?: boolean;
  name: string;
  value: string;
  onChange: (
    e: ChangeEvent<HTMLInputElement>
  ) => void;
  placeholder?: string;
  type?: string;
  inputMode?:
    | "none"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "numeric"
    | "decimal"
    | "search";
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <div>

      <label className="block text-sm font-bold text-slate-700 mb-2">
        {label}{" "}
        {required && (
          <span className="text-red-500">
            *
          </span>
        )}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />

    </div>
  );
}

function SelectField({
  label,
  required,
  name,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  required?: boolean;
  name: string;
  value: string;
  onChange: (
    e: ChangeEvent<HTMLSelectElement>
  ) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>

      <label className="block text-sm font-bold text-slate-700 mb-2">
        {label}{" "}
        {required && (
          <span className="text-red-500">
            *
          </span>
        )}
      </label>

      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
      >

        {placeholder && (
          <option value="">
            {placeholder}
          </option>
        )}

        {options.map((option) => (
          <option
            key={option}
            value={option}
          >
            {option}
          </option>
        ))}

      </select>

    </div>
  );
}

function FileUploadCard({
  title,
  required,
  optional,
  file,
  onChange,
}: {
  title: string;
  required?: boolean;
  optional?: boolean;
  file: File | null;
  onChange: (
    file: File | null
  ) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 hover:border-blue-200 transition">

      <div className="flex items-start justify-between gap-3 mb-4">

        <div>

          <h3 className="font-bold text-slate-800">
            {title}
          </h3>

          {required && (
            <p className="text-xs text-red-500 mt-1">
              Required
            </p>
          )}

          {optional && (
            <p className="text-xs text-slate-400 mt-1">
              Optional
            </p>
          )}

        </div>

        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
          📄
        </div>

      </div>

      <label className="flex items-center justify-center w-full min-h-28 rounded-xl border-2 border-dashed border-slate-300 bg-white cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">

        <div className="text-center px-4">

          <div className="text-2xl">
            ⬆
          </div>

          <p className="text-sm font-bold text-slate-700 mt-1">
            Choose document
          </p>

          <p className="text-xs text-slate-400 mt-1">
            JPG, PNG or PDF
          </p>

        </div>

        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) =>
            onChange(
              e.target.files?.[0] ||
                null
            )
          }
        />

      </label>

      <div className="mt-3 rounded-lg bg-white border border-slate-200 px-3 py-2">

        <p className="text-xs text-slate-500 truncate">
          {file
            ? `✓ ${file.name}`
            : "No file chosen"}
        </p>

      </div>

    </div>
  );
}

function InfoBox({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4">

      <div className="flex gap-3">

        <span className="text-blue-600">
          ℹ
        </span>

        <p className="text-sm text-blue-800 leading-6">
          {children}
        </p>

      </div>

    </div>
  );
}
