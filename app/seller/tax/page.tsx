"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { GST_STATUSES, type GstStatus } from "@/lib/sellerTax";

// Seller Tax / GST profile. The seller edits it here; the actual save is
// server-authoritative (/api/seller/tax-profile validates and resets
// verification to PENDING). Verification to VERIFIED is admin-only.

const VERIFY_BADGE: Record<string, string> = {
  VERIFIED: "bg-green-100 text-green-700 border-green-300",
  PENDING: "bg-amber-100 text-amber-700 border-amber-300",
  REJECTED: "bg-red-100 text-red-700 border-red-300",
};

const STATUS_LABEL: Record<GstStatus, string> = {
  REGISTERED: "Registered (Regular)",
  COMPOSITION: "Composition scheme",
  UNREGISTERED: "Unregistered",
};

export default function SellerTaxPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verification, setVerification] = useState<string>("");

  const [gstStatus, setGstStatus] = useState<GstStatus | "">("");
  const [gstin, setGstin] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [pan, setPan] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [gstRegistrationState, setGstRegistrationState] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/vendor-login");
        return;
      }
      try {
        const snap = await getDocs(
          query(collection(db, "vendors"), where("uid", "==", user.uid), limit(1))
        );
        const v = snap.docs[0]?.data() as
          | {
              taxProfile?: Record<string, string>;
              taxVerificationStatus?: string;
              panNumber?: string;
              businessName?: string;
              fullName?: string;
              state?: string;
              gstNumber?: string;
            }
          | undefined;
        const tp = v?.taxProfile || {};
        // Prefill from the structured profile, falling back to the flat
        // registration fields so an existing seller starts from what they gave.
        setGstStatus((tp.gstStatus as GstStatus) || "");
        setGstin(tp.gstin || v?.gstNumber || "");
        setLegalName(tp.legalName || v?.fullName || "");
        setTradeName(tp.tradeName || v?.businessName || "");
        setPan(tp.pan || v?.panNumber || "");
        setBusinessState(tp.businessState || v?.state || "");
        setGstRegistrationState(tp.gstRegistrationState || v?.state || "");
        setVerification(v?.taxVerificationStatus || "");
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const registered = gstStatus === "REGISTERED" || gstStatus === "COMPOSITION";

  const save = async () => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/vendor-login");
      return;
    }
    try {
      setSaving(true);
      const token = await user.getIdToken();
      const res = await fetch("/api/seller/tax-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          gstStatus,
          gstin,
          legalName,
          tradeName,
          pan,
          businessState,
          gstRegistrationState,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Could not save your tax profile.");
        return;
      }
      setVerification("PENDING");
      toast.success("Tax profile saved. It's now pending verification.");
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow p-8 animate-pulse space-y-4">
          <div className="h-7 w-1/3 bg-gray-200 rounded" />
          <div className="h-11 bg-gray-100 rounded" />
          <div className="h-11 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder = ""
  ) => (
    <div>
      <label className="block mb-1 font-semibold text-sm">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border p-3 rounded-xl"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 sm:p-8 rounded-3xl mb-6">
          <h1 className="text-3xl font-bold">Tax & GST Profile</h1>
          <p className="opacity-90">Your GST registration for selling on YOMICO</p>
        </div>

        {verification && (
          <div
            className={`mb-6 inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${
              VERIFY_BADGE[verification] || "bg-gray-100 text-gray-600"
            }`}
          >
            Verification: {verification}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow p-6 sm:p-8 space-y-5">
          <div>
            <label className="block mb-1 font-semibold text-sm">GST Status</label>
            <select
              value={gstStatus}
              onChange={(e) => setGstStatus(e.target.value as GstStatus)}
              className="w-full border p-3 rounded-xl"
            >
              <option value="">Select status</option>
              {GST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          {registered &&
            field("GSTIN", gstin, (v) => setGstin(v.toUpperCase()), "24ABCDE1234F1Z5")}
          {field("Legal Name", legalName, setLegalName)}
          {field("Trade Name", tradeName, setTradeName)}
          {field("PAN", pan, (v) => setPan(v.toUpperCase()), "ABCDE1234F")}
          {field("Business State", businessState, setBusinessState)}
          {registered &&
            field(
              "GST Registration State",
              gstRegistrationState,
              setGstRegistrationState
            )}

          {gstStatus === "UNREGISTERED" && (
            <p className="text-xs text-amber-700">
              Unregistered sellers cannot list products until a GST registration
              (Regular or Composition) is added and verified.
            </p>
          )}

          <button
            onClick={save}
            disabled={saving || !gstStatus}
            className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Tax Profile"}
          </button>
          <p className="text-xs text-gray-400">
            Saving resets verification to Pending; our team re-verifies GST
            details after each change.
          </p>
        </div>
      </div>
    </div>
  );
}
