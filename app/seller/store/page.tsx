"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import { vendorStorePath } from "@/lib/storagePaths";
import StorefrontView from "@/components/storefront/StorefrontView";
import { MAX_ABOUT_LENGTH, type PublicStorefront } from "@/lib/storefront/publicStorefront";

// The seller's store hub: public status, link and preview of the public
// storefront, which products customers can see, and the store's logo, banner
// and About text. Everything is read from and saved through
// /api/seller/storefront (verified token — the seller's own store only).

type StoreView = {
  status: { accountStatus: string; isPublic: boolean; message: string };
  publicPath: string | null;
  appearance: { storeLogo: string; storeBanner: string; aboutStore: string };
  preview: PublicStorefront;
  counts: { total: number; visible: number; outOfStock: number; pending: number; rejected: number; blocked: number; archived: number };
};

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("signed-out");
  const token = await user.getIdToken();
  return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` } });
}

export default function SellerStorePage() {
  const [view, setView] = useState<StoreView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"" | "storeLogo" | "storeBanner">("");

  const apply = (data: StoreView) => {
    setView(data);
    setAbout(data.appearance.aboutStore || "");
  };

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await authedFetch("/api/seller/storefront");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not load your store.");
        return;
      }
      apply(data);
    } catch {
      setError("Could not load your store.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) void load();
      else setLoading(false);
    });
    return () => unsubscribe();
  }, [load]);

  const save = async (changes: Record<string, string>) => {
    setSaving(true);
    try {
      const res = await authedFetch("/api/seller/storefront", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Could not save your store.");
        return false;
      }
      apply(data);
      return true;
    } catch {
      alert("Could not save your store.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File, field: "storeLogo" | "storeBanner") => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      alert("Your session expired. Please sign in again.");
      return;
    }
    setUploading(field);
    try {
      // The seller's own vendor-store/{uid}/ folder (storage.rules), which is
      // the only place the server accepts a store image from.
      const storageRef = ref(storage, vendorStorePath(uid, file));
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await save({ [field]: url });
    } catch (e) {
      console.error(e);
      alert("Failed to upload image.");
    } finally {
      setUploading("");
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-100 p-4 md:p-6">Loading...</div>;
  if (error || !view) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 md:p-6">
        <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow p-8 text-red-600">{error || "Could not load your store."}</div>
      </div>
    );
  }

  const { status, counts, appearance } = view;
  const countCards: [string, number, string][] = [
    ["Visible to customers", counts.visible, "text-green-600"],
    ["Out of stock (still visible)", counts.outOfStock, "text-orange-600"],
    ["Pending review", counts.pending, "text-yellow-600"],
    ["Rejected", counts.rejected, "text-red-600"],
    ["Blocked by YOMICO", counts.blocked, "text-gray-600"],
    ["Archived", counts.archived, "text-slate-500"],
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 sm:p-8 rounded-3xl">
          <h1 className="text-3xl sm:text-4xl font-bold">My Store</h1>
          <p className="opacity-90 mt-1">Your public storefront, as customers see it.</p>
        </div>

        {/* Status */}
        <div className="bg-white rounded-3xl shadow p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full ${
                status.isPublic ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}
            >
              {status.isPublic ? "Public" : "Hidden"}
            </span>
            <p className="mt-2 text-gray-700">{status.message}</p>
          </div>
          {view.publicPath && (
            <a
              href={view.publicPath}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-semibold text-center"
            >
              View public storefront
            </a>
          )}
        </div>

        {/* Counts */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {countCards.map(([label, value, cls]) => (
            <div key={label} className="bg-white rounded-2xl shadow p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-600">
          Only approved, active products appear in your store. Manage them in{" "}
          <Link href="/seller/products" className="text-blue-600 hover:underline">Products</Link>.
        </p>

        {/* Appearance */}
        <div className="bg-white rounded-3xl shadow p-6 space-y-5">
          <h2 className="text-xl font-bold">Store appearance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(["storeLogo", "storeBanner"] as const).map((field) => (
              <div key={field}>
                <p className="font-semibold">{field === "storeLogo" ? "Store logo" : "Store banner"}</p>
                <div className="mt-2 flex items-center gap-4">
                  {appearance[field] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={appearance[field]}
                      alt=""
                      className={field === "storeLogo" ? "w-16 h-16 rounded-full object-cover border" : "w-28 h-16 rounded-xl object-cover border"}
                    />
                  ) : (
                    <span className="text-sm text-gray-400">None</span>
                  )}
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl text-sm font-semibold">
                    {uploading === field ? "Uploading..." : "Change"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!!uploading || saving || !status.isPublic}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadImage(file, field);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {appearance[field] && (
                    <button
                      onClick={() => void save({ [field]: "" })}
                      disabled={saving || !status.isPublic}
                      className="text-sm text-red-600 hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div>
            <label className="font-semibold">About your store</label>
            <textarea
              rows={5}
              maxLength={MAX_ABOUT_LENGTH}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              className="w-full mt-2 border rounded-xl p-3"
              disabled={!status.isPublic}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">{about.length}/{MAX_ABOUT_LENGTH}</span>
              <button
                onClick={() => void save({ aboutStore: about })}
                disabled={saving || !status.isPublic || about === appearance.aboutStore}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-xl font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save About"}
              </button>
            </div>
          </div>
          {!status.isPublic && (
            <p className="text-sm text-gray-500">Store changes are available once your seller account is approved.</p>
          )}
        </div>

        {/* Preview */}
        <div className="bg-white rounded-3xl shadow overflow-hidden">
          <StorefrontView storefront={view.preview} preview />
        </div>
      </div>
    </div>
  );
}
