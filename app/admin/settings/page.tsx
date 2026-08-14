"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { toast } from "sonner";
import {
  FREE_SHIPPING_THRESHOLD as DEFAULT_FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_CHARGE as DEFAULT_STANDARD_SHIPPING_CHARGE,
} from "@/lib/shipping";
import { logAdminAction } from "@/lib/auditLog";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(
    DEFAULT_FREE_SHIPPING_THRESHOLD
  );
  const [standardShippingCharge, setStandardShippingCharge] = useState(
    DEFAULT_STANDARD_SHIPPING_CHARGE
  );
  // YOMICO's launch policy is zero commission until explicitly turned on —
  // both default to the "off" state until a settings doc says otherwise.
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  // Displayed to the admin as a percentage; stored in Firestore as the
  // 0-1 fraction every commission calculation (lib/vendorEarnings.ts,
  // checkout, seller invoice) already expects. Only takes effect once
  // commissionEnabled is turned on.
  const [commissionRatePercent, setCommissionRatePercent] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "global"));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.freeShippingThreshold === "number") {
            setFreeShippingThreshold(data.freeShippingThreshold);
          }
          if (typeof data.standardShippingCharge === "number") {
            setStandardShippingCharge(data.standardShippingCharge);
          }
          setCommissionEnabled(data.commissionEnabled === true);
          if (
            typeof data.commissionRate === "number" &&
            data.commissionRate >= 0 &&
            data.commissionRate <= 1
          ) {
            setCommissionRatePercent(data.commissionRate * 100);
          }
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const save = async () => {
    if (freeShippingThreshold < 0 || standardShippingCharge < 0) {
      toast.error("Values can't be negative.");
      return;
    }
    if (commissionRatePercent < 0 || commissionRatePercent > 100) {
      toast.error("Commission rate must be between 0% and 100%.");
      return;
    }

    const commissionRate = commissionRatePercent / 100;

    setSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "global"),
        {
          freeShippingThreshold,
          standardShippingCharge,
          commissionEnabled,
          commissionRate,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.email || "",
        },
        { merge: true }
      );
      await logAdminAction("settings_update", "global", {
        freeShippingThreshold,
        standardShippingCharge,
        commissionEnabled,
        commissionRate,
      });
      toast.success("Settings saved.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Store Settings</h1>
          <p className="opacity-90">Storefront-wide configuration</p>
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : (
          <div className="bg-white rounded-3xl shadow p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Shipping</h2>
              <p className="text-sm text-gray-500 mb-4">
                Applies storefront-wide — cart, checkout, the top banner, and
                the price actually charged at payment.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Free shipping threshold (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={freeShippingThreshold}
                    onChange={(e) =>
                      setFreeShippingThreshold(Number(e.target.value))
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Orders above this amount ship free.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Standard shipping charge (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={standardShippingCharge}
                    onChange={(e) =>
                      setStandardShippingCharge(Number(e.target.value))
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Charged when the order is below the threshold above.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h2 className="text-lg font-semibold mb-1">Commission</h2>
              <p className="text-sm text-gray-500 mb-4">
                Applies to new orders only — orders already placed keep the
                rate that was in effect when they were sold, so changing
                this never touches past earnings, payouts, or invoices.
                Currently a <strong>zero-commission launch period</strong> —
                new orders are charged 0% until you turn this on below.
              </p>

              <label className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  checked={commissionEnabled}
                  onChange={(e) => setCommissionEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">
                  Enable commission on new orders
                </span>
              </label>

              <div className="max-w-xs">
                <label className="block text-sm font-medium mb-1">
                  Commission rate (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={commissionRatePercent}
                  disabled={!commissionEnabled}
                  onChange={(e) =>
                    setCommissionRatePercent(Number(e.target.value))
                  }
                  className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Platform's cut of each seller's net sale, e.g. 10 means 10%.
                  Only applies once commission is enabled above.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <button
                onClick={save}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg transition font-semibold"
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
