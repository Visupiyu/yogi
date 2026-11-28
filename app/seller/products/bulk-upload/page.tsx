"use client";

// Bulk Product Upload (V1). The seller downloads the Excel template, fills one
// product per row, selects the sheet and the product photos, reviews what will
// be added, and imports. Rules live in lib/products/bulkUpload.ts (shared with
// the server); app/api/seller/bulk-create-products is the enforcement:
// it re-checks every row, refuses ineligible sellers, and never creates the
// same SKU twice.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { sellerListingBlockReason } from "@/lib/sellerTax";
import { productImagePath } from "@/lib/storagePaths";
import { MIN_SELLING_PRICE } from "@/lib/products/sellerProductValidation";
import {
  MAX_BULK_ROWS,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PRODUCT,
  draftFromRow,
  markDuplicateSkus,
  rowsFromSheet,
  withImages,
  type BulkResponse,
  type BulkRowDraft,
  type BulkRowResult,
} from "@/lib/products/bulkUpload";

type Phase = "idle" | "checking" | "reviewed" | "importing" | "done";
type RowView = {
  draft: BulkRowDraft;
  status: "ready" | "duplicate" | "error" | "created";
  errors: string[];
  productNumber?: string;
};

const photoKey = (name: string) => name.trim().toLowerCase();

async function callBulk(mode: "check" | "import", rows: { rowNumber: number; product: Record<string, unknown> }[]): Promise<BulkResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");
  const token = await user.getIdToken();
  const res = await fetch("/api/seller/bulk-create-products", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mode, rows }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not process the upload. Please try again.");
  return data as BulkResponse;
}

export default function BulkUploadPage() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [sheetError, setSheetError] = useState("");
  const [rows, setRows] = useState<RowView[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [inputKey, setInputKey] = useState(0);
  // Photos already uploaded in this visit, so a retry never uploads them again.
  const uploaded = useRef(new Map<string, string>());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthReady(true);
        return;
      }
      setUid(user.uid);
      try {
        const snap = await getDocs(query(collection(db, "vendors"), where("uid", "==", user.uid)));
        if (snap.empty) {
          setBlockReason("Complete your GST / tax profile to start selling.");
        } else {
          const data = snap.docs[0].data();
          setBlockReason(
            sellerListingBlockReason({
              gstStatus: data.taxProfile?.gstStatus,
              gstin: data.taxProfile?.gstin,
              taxVerificationStatus: data.taxVerificationStatus,
            })
          );
        }
      } catch (error) {
        // Display only — the server enforces eligibility on every upload.
        console.error("Could not load seller profile:", error);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  const photoByName = useMemo(() => {
    const map = new Map<string, File>();
    for (const file of photos) map.set(photoKey(file.name), file);
    return map;
  }, [photos]);

  // Read and check the sheet whenever the sheet or the photo selection changes.
  useEffect(() => {
    let cancelled = false;
    async function review() {
      setSheetError("");
      setMessage("");
      setRows([]);
      if (!sheetFile) {
        setPhase("idle");
        return;
      }
      setPhase("checking");
      try {
        const { readProductsMatrix } = await import("@/lib/products/bulkTemplate");
        const parsed = rowsFromSheet(readProductsMatrix(await sheetFile.arrayBuffer()));
        if (!parsed.ok) {
          if (!cancelled) { setSheetError(parsed.error); setPhase("idle"); }
          return;
        }
        const drafts = markDuplicateSkus(parsed.rows.map(draftFromRow)).map((d) => {
          const photoErrors: string[] = [];
          for (const name of d.imageNames) {
            const file = photoByName.get(photoKey(name));
            if (!file) photoErrors.push(`Photo "${name}" is not among the selected photos.`);
            else if (!file.type.startsWith("image/")) photoErrors.push(`"${name}" is not an image.`);
            else if (file.size >= MAX_IMAGE_BYTES) photoErrors.push(`"${name}" is larger than 5 MB.`);
          }
          return { ...d, errors: [...d.errors, ...photoErrors] };
        });
        // The server's own check (seller eligibility, SKUs already in your
        // products) for every row that passed here — before any photo upload.
        const okDrafts = drafts.filter((d) => d.errors.length === 0);
        const server = new Map<number, BulkRowResult>();
        if (okDrafts.length) {
          const res = await callBulk("check", okDrafts.map((d) => ({ rowNumber: d.rowNumber, product: d.product })));
          for (const r of res.results) server.set(r.rowNumber, r);
        }
        if (cancelled) return;
        setRows(
          drafts.map((draft) => {
            if (draft.errors.length) return { draft, status: "error", errors: draft.errors };
            const r = server.get(draft.rowNumber);
            if (!r || r.status === "error") return { draft, status: "error", errors: r?.errors || ["Could not be checked."] };
            return { draft, status: r.status === "duplicate" ? "duplicate" : "ready", errors: [] };
          })
        );
        setPhase("reviewed");
      } catch (error) {
        if (!cancelled) {
          setSheetError((error as Error)?.message || "Could not read this file. Use the YOMICO template (.xlsx).");
          setPhase("idle");
        }
      }
    }
    review();
    return () => { cancelled = true; };
  }, [sheetFile, photoByName]);

  const counts = useMemo(() => ({
    ready: rows.filter((r) => r.status === "ready").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    error: rows.filter((r) => r.status === "error").length,
    created: rows.filter((r) => r.status === "created").length,
  }), [rows]);

  async function handleDownloadTemplate() {
    const { downloadTemplate } = await import("@/lib/products/bulkTemplate");
    downloadTemplate();
  }

  async function handleImport() {
    if (phase !== "reviewed" || counts.ready === 0) return;
    const user = auth.currentUser;
    if (!user || user.uid !== uid) {
      setMessage("Your session expired. Please sign in again.");
      return;
    }
    setPhase("importing");
    setMessage("");
    try {
      const ready = rows.filter((r) => r.status === "ready");
      const totalPhotos = ready.reduce((n, r) => n + r.draft.imageNames.length, 0);
      let done = 0;
      const payload: { rowNumber: number; product: Record<string, unknown> }[] = [];
      for (const row of ready) {
        const urls: string[] = [];
        for (const name of row.draft.imageNames) {
          const file = photoByName.get(photoKey(name))!;
          // Keyed by the file itself, so a different photo with the same name
          // picked later is uploaded, while a retry reuses what is done.
          const fileKey = `${photoKey(file.name)}|${file.size}|${file.lastModified}`;
          let url = uploaded.current.get(fileKey);
          if (!url) {
            const storageRef = ref(storage, productImagePath(user.uid, file));
            await uploadBytes(storageRef, file);
            url = await getDownloadURL(storageRef);
            uploaded.current.set(fileKey, url);
          }
          urls.push(url);
          setProgress(`Uploading photos… ${++done} of ${totalPhotos}`);
        }
        payload.push({ rowNumber: row.draft.rowNumber, product: withImages(row.draft.product, urls) });
      }
      setProgress(`Adding ${payload.length} product${payload.length === 1 ? "" : "s"}…`);
      const res = await callBulk("import", payload);
      const byRow = new Map(res.results.map((r) => [r.rowNumber, r]));
      setRows((prev) =>
        prev.map((row) => {
          const r = byRow.get(row.draft.rowNumber);
          if (!r) return row;
          if (r.status === "created") return { ...row, status: "created", errors: [], productNumber: r.productNumber };
          if (r.status === "duplicate") return { ...row, status: "duplicate", errors: [] };
          return { ...row, status: "error", errors: r.errors || ["Could not be added."] };
        })
      );
      setMessage(
        `${res.summary.created} product${res.summary.created === 1 ? "" : "s"} added and sent to YOMICO for review.` +
          (res.summary.error ? ` ${res.summary.error} could not be added — see the list below.` : "")
      );
      setPhase("done");
    } catch (error) {
      // Nothing is lost: photos already uploaded are reused, and products
      // already created are recognised by SKU if the seller tries again.
      setMessage(`${(error as Error)?.message || "The upload did not finish."} You can safely press Import again — products already added are not duplicated.`);
      setPhase("reviewed");
    } finally {
      setProgress("");
    }
  }

  function reset() {
    setSheetFile(null);
    setPhotos([]);
    setRows([]);
    setSheetError("");
    setMessage("");
    setPhase("idle");
    setInputKey((k) => k + 1);
  }

  const busy = phase === "checking" || phase === "importing";

  if (!authReady) {
    return <div className="p-10 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Seller Engine</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Bulk Upload Products</h1>
          <p className="mt-1 text-gray-500">Add up to {MAX_BULK_ROWS} products at once from an Excel sheet.</p>
        </div>
        <Link href="/seller/products" className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-700 transition hover:bg-gray-50">
          Back to My Products
        </Link>
      </div>

      {blockReason ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-800">You can&apos;t list products yet</h2>
          <p className="mt-2 text-gray-700">{blockReason}</p>
          <Link href="/seller/tax?next=/seller/products/bulk-upload" className="mt-4 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">
            Go to Tax &amp; GST Profile
          </Link>
        </div>
      ) : (
        <>
          {/* STEPS */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-indigo-600">Step 1</p>
              <h2 className="mt-1 text-lg font-bold text-gray-900">Download the template</h2>
              <p className="mt-1 text-sm text-gray-500">
                Fill one product per row. The Instructions and Categories sheets explain every column.
                Selling price must be at least ₹{MIN_SELLING_PRICE}.
              </p>
              <button type="button" onClick={handleDownloadTemplate} className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700">
                Download Excel Template
              </button>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-indigo-600">Step 2</p>
              <h2 className="mt-1 text-lg font-bold text-gray-900">Select your filled sheet</h2>
              <p className="mt-1 text-sm text-gray-500">.xlsx, .xls or .csv, up to {MAX_BULK_ROWS} products.</p>
              <input
                key={`sheet-${inputKey}`}
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={busy}
                onChange={(e) => setSheetFile(e.target.files?.[0] || null)}
                className="mt-4 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:font-semibold file:text-indigo-700"
              />
              {sheetFile && <p className="mt-2 truncate text-xs text-gray-500">{sheetFile.name}</p>}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-indigo-600">Step 3</p>
              <h2 className="mt-1 text-lg font-bold text-gray-900">Select the product photos</h2>
              <p className="mt-1 text-sm text-gray-500">
                The photos named in the sheet&apos;s Image Files column (1–{MAX_IMAGES_PER_PRODUCT} per product, under 5 MB each).
              </p>
              <input
                key={`photos-${inputKey}`}
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                onChange={(e) => setPhotos(Array.from(e.target.files || []))}
                className="mt-4 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:font-semibold file:text-indigo-700"
              />
              {photos.length > 0 && <p className="mt-2 text-xs text-gray-500">{photos.length} photo{photos.length === 1 ? "" : "s"} selected</p>}
            </div>
          </div>

          {sheetError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{sheetError}</div>
          )}

          {phase === "checking" && (
            <div className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">Checking your sheet…</div>
          )}

          {rows.length > 0 && (
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-3 text-sm">
                  {phase === "done" ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-700">{counts.created} added</span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-700">{counts.ready} ready</span>
                  )}
                  <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">{counts.duplicate} already in your products</span>
                  <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">{counts.error} need fixing</span>
                </div>
                <div className="flex gap-3">
                  {phase === "done" ? (
                    <>
                      <button type="button" onClick={reset} className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50">
                        Upload another file
                      </button>
                      <button type="button" onClick={() => router.push("/seller/products")} className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">
                        View My Products
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={phase !== "reviewed" || counts.ready === 0}
                      className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {phase === "importing" ? "Importing…" : `Import ${counts.ready} product${counts.ready === 1 ? "" : "s"}`}
                    </button>
                  )}
                </div>
              </div>

              {counts.error > 0 && phase !== "done" && (
                <p className="mt-3 text-sm text-gray-500">
                  Rows that need fixing are skipped. Fix them in your sheet and upload it again — products already added will not be duplicated.
                </p>
              )}
              {progress && <p className="mt-3 text-sm font-medium text-indigo-700">{progress}</p>}
              {message && <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800">{message}</p>}

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="py-2 pr-3">Row</th>
                      <th className="py-2 pr-3">SKU</th>
                      <th className="py-2 pr-3">Product</th>
                      <th className="py-2 pr-3">Price</th>
                      <th className="py-2 pr-3">Stock</th>
                      <th className="py-2 pr-3">Photos</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.draft.rowNumber} className="border-b align-top last:border-0">
                        <td className="py-3 pr-3 text-gray-500">{row.draft.rowNumber}</td>
                        <td className="py-3 pr-3 font-mono text-xs">{row.draft.sku || "—"}</td>
                        <td className="py-3 pr-3 font-medium text-gray-900">{row.draft.title || "—"}</td>
                        <td className="py-3 pr-3">
                          {typeof row.draft.product.sellingPrice === "number" ? `₹${row.draft.product.sellingPrice}` : "—"}
                        </td>
                        <td className="py-3 pr-3">{typeof row.draft.product.stock === "number" ? String(row.draft.product.stock) : "—"}</td>
                        <td className="py-3 pr-3">{row.draft.imageNames.length}</td>
                        <td className="py-3">
                          {row.status === "created" && (
                            <span className="font-semibold text-green-700">Added{row.productNumber ? ` · ${row.productNumber}` : ""} · Pending review</span>
                          )}
                          {row.status === "ready" && <span className="font-semibold text-green-700">Ready</span>}
                          {row.status === "duplicate" && <span className="font-semibold text-gray-600">Already in your products — skipped</span>}
                          {row.status === "error" && (
                            <ul className="list-disc space-y-1 pl-4 text-red-700">
                              {row.errors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
