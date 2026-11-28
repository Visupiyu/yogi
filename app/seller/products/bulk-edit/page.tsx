"use client";

// Bulk Product Edit (V1). The seller downloads their products as an Excel
// file, changes prices / stock / GST and a few other operational fields
// offline, uploads the file, reviews every change, and applies. Rules live in
// lib/products/bulkEdit.ts; app/api/seller/bulk-edit-products is the
// enforcement and applies each change with the same logic as the product form.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { MIN_SELLING_PRICE } from "@/lib/products/sellerProductValidation";
import {
  FIELD_LABEL,
  MAX_CHANGED_ROWS,
  MAX_EDIT_ROWS,
  editRowsFromSheet,
  type EditResponse,
  type EditRowResult,
  type EditedRow,
  type ExportRow,
  type FieldChange,
} from "@/lib/products/bulkEdit";

type Phase = "idle" | "checking" | "reviewed" | "applying" | "done";
type RowView = { row: EditedRow; result: EditRowResult };

async function callEdit<T>(body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");
  const token = await user.getIdToken();
  const res = await fetch("/api/seller/bulk-edit-products", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not process the file. Please try again.");
  return data as T;
}

const show = (field: FieldChange["field"], v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  return field === "mrp" || field === "sellingPrice" ? `₹${v}` : String(v);
};

export default function BulkEditPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [rows, setRows] = useState<RowView[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSignedIn(Boolean(user));
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  async function handleExport() {
    setExporting(true);
    setExportNote("");
    try {
      const data = await callEdit<{ rows: ExportRow[] }>({ mode: "export" });
      if (data.rows.length === 0) {
        setExportNote("You have no products yet.");
        return;
      }
      const { downloadEditWorkbook } = await import("@/lib/products/bulkEditTemplate");
      downloadEditWorkbook(data.rows);
      setExportNote(`Downloaded ${data.rows.length} product${data.rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setExportNote((error as Error)?.message || "Could not download your products.");
    } finally {
      setExporting(false);
    }
  }

  // Read and check the uploaded file.
  useEffect(() => {
    let cancelled = false;
    async function review() {
      setFileError("");
      setMessage("");
      setRows([]);
      if (!file) {
        setPhase("idle");
        return;
      }
      setPhase("checking");
      try {
        const { readProductsMatrix } = await import("@/lib/products/bulkTemplate");
        const parsed = editRowsFromSheet(readProductsMatrix(await file.arrayBuffer()));
        if (!parsed.ok) {
          if (!cancelled) { setFileError(parsed.error); setPhase("idle"); }
          return;
        }
        const local = parsed.rows;
        const sendable = local.filter((r) => r.errors.length === 0);
        const server = new Map<number, EditRowResult>();
        if (sendable.length) {
          const res = await callEdit<EditResponse>({
            mode: "check",
            rows: sendable.map((r) => ({ rowNumber: r.rowNumber, productId: r.productId, version: r.version, values: r.values })),
          });
          for (const r of res.results) server.set(r.rowNumber, r);
        }
        if (cancelled) return;
        setRows(local.map((row) => ({
          row,
          result: row.errors.length
            ? { rowNumber: row.rowNumber, productId: row.productId, status: "error", errors: row.errors }
            : server.get(row.rowNumber) || { rowNumber: row.rowNumber, productId: row.productId, status: "error", errors: ["Could not be checked."] },
        })));
        setPhase("reviewed");
      } catch (error) {
        if (!cancelled) {
          setFileError((error as Error)?.message || "Could not read this file. Upload the file you downloaded from this page.");
          setPhase("idle");
        }
      }
    }
    review();
    return () => { cancelled = true; };
  }, [file]);

  const counts = useMemo(() => {
    const c = { ready: 0, updated: 0, unchanged: 0, stale: 0, error: 0, review: 0 };
    for (const { result } of rows) {
      c[result.status]++;
      if ((result.status === "ready" || result.status === "updated") && result.reReview) c.review++;
    }
    return c;
  }, [rows]);

  async function handleApply() {
    if (phase !== "reviewed" || counts.ready === 0) return;
    setPhase("applying");
    setMessage("");
    try {
      const ready = rows.filter((r) => r.result.status === "ready");
      const res = await callEdit<EditResponse>({
        mode: "apply",
        rows: ready.map(({ row }) => ({ rowNumber: row.rowNumber, productId: row.productId, version: row.version, values: row.values })),
      });
      const byRow = new Map(res.results.map((r) => [r.rowNumber, r]));
      setRows((prev) => prev.map((v) => (byRow.has(v.row.rowNumber) ? { ...v, result: byRow.get(v.row.rowNumber)! } : v)));
      const s = res.summary;
      setMessage(
        `${s.updated} product${s.updated === 1 ? "" : "s"} updated.` +
          (s.stale + s.error + s.unchanged > 0 ? ` ${s.stale + s.error + s.unchanged} not changed — see the list below.` : "")
      );
      setPhase("done");
    } catch (error) {
      // Safe to retry: rows already applied come back as "no changes".
      setMessage(`${(error as Error)?.message || "The update did not finish."} You can safely press Apply again — changes already made are not repeated.`);
      setPhase("reviewed");
    }
  }

  function reset() {
    setFile(null);
    setRows([]);
    setFileError("");
    setMessage("");
    setPhase("idle");
    setInputKey((k) => k + 1);
  }

  const busy = phase === "checking" || phase === "applying";

  if (!authReady) return <div className="p-10 text-center text-gray-500">Loading...</div>;
  if (!signedIn) return <div className="p-10 text-center text-gray-500">Please sign in to edit your products.</div>;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Seller Engine</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Bulk Edit Products</h1>
          <p className="mt-1 text-gray-500">Change prices, stock and GST for many products at once in Excel.</p>
        </div>
        <Link href="/seller/products" className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-700 transition hover:bg-gray-50">
          Back to My Products
        </Link>
      </div>

      {/* STEPS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-indigo-600">Step 1</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">Download your products</h2>
          <p className="mt-1 text-sm text-gray-500">
            Edit MRP, Selling Price, Stock, GST Rate, HSN, Return Days, Warranty and Weight. Selling price must stay at least ₹{MIN_SELLING_PRICE}.
            Name, photos, category and variants are changed with Edit.
          </p>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {exporting ? "Preparing…" : "Download My Products (Excel)"}
          </button>
          {exportNote && <p className="mt-2 text-sm text-gray-600">{exportNote}</p>}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-indigo-600">Step 2</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">Upload the edited file</h2>
          <p className="mt-1 text-sm text-gray-500">
            You&apos;ll see every change before it is applied. Up to {MAX_EDIT_ROWS} products per file and {MAX_CHANGED_ROWS} changes per upload.
          </p>
          <input
            key={`file-${inputKey}`}
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mt-4 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:font-semibold file:text-indigo-700"
          />
          {file && <p className="mt-2 truncate text-xs text-gray-500">{file.name}</p>}
        </div>
      </div>

      {fileError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{fileError}</div>}
      {phase === "checking" && <div className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">Checking your changes…</div>}

      {rows.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-3 text-sm">
              {phase === "done" ? (
                <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-700">{counts.updated} updated</span>
              ) : (
                <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-700">{counts.ready} to update</span>
              )}
              {counts.review > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">{counts.review} will go for review</span>}
              <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">{counts.unchanged} no changes</span>
              <span className="rounded-full bg-orange-100 px-3 py-1 font-semibold text-orange-700">{counts.stale} out of date</span>
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
                  onClick={handleApply}
                  disabled={phase !== "reviewed" || counts.ready === 0 || counts.ready > MAX_CHANGED_ROWS}
                  className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {phase === "applying" ? "Applying…" : `Apply ${counts.ready} update${counts.ready === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </div>

          {counts.ready > MAX_CHANGED_ROWS && phase !== "done" && (
            <p className="mt-3 text-sm text-red-700">This file changes {counts.ready} products. Apply at most {MAX_CHANGED_ROWS} at a time — split the file.</p>
          )}
          {counts.stale > 0 && phase !== "done" && (
            <p className="mt-3 text-sm text-gray-500">Out-of-date rows changed after you downloaded the file and are skipped. Download a fresh file to change them.</p>
          )}
          {message && <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800">{message}</p>}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3">Changes</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, result }) => (
                  <tr key={row.rowNumber} className="border-b align-top last:border-0">
                    <td className="py-3 pr-3 text-gray-500">{row.rowNumber}</td>
                    <td className="py-3 pr-3 font-medium text-gray-900">{result.title || row.title || row.productId || "—"}</td>
                    <td className="py-3 pr-3">
                      {result.changes?.length ? (
                        <ul className="space-y-1">
                          {result.changes.map((c) => (
                            <li key={c.field}>
                              <span className="text-gray-500">{FIELD_LABEL[c.field]}:</span> {show(c.field, c.from)} → <span className="font-semibold">{show(c.field, c.to)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      {result.status === "updated" && <span className="font-semibold text-green-700">Updated{result.reReview ? " · sent for review" : ""}</span>}
                      {result.status === "ready" && (
                        <span className="font-semibold text-green-700">Will update{result.reReview ? <span className="text-amber-700"> · goes for review (MRP change)</span> : null}</span>
                      )}
                      {result.status === "unchanged" && <span className="text-gray-600">No changes</span>}
                      {result.status === "stale" && <span className="font-semibold text-orange-700">Out of date — skipped</span>}
                      {result.status === "error" && (
                        <ul className="list-disc space-y-1 pl-4 text-red-700">
                          {(result.errors || []).map((e, i) => <li key={i}>{e}</li>)}
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
    </div>
  );
}
