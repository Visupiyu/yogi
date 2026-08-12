import { ReactNode } from "react";

export default function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">

      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p className="text-sm uppercase tracking-widest opacity-80">
            YOMICO
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-bold">{title}</h1>
          <p className="mt-3 opacity-90 text-sm">
            Last updated: {lastUpdated}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 -mt-6 pb-16">

        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 mb-6 shadow-sm">
          <p className="font-semibold text-amber-800">
            ⚠ Draft — not yet legally reviewed
          </p>
          <p className="mt-1 text-sm text-amber-700">
            This page is a starting template, not final legal advice. It
            must be reviewed and approved by a qualified lawyer before
            YOMICO relies on it, enforces it, or represents it as binding.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-8">
          {children}
        </div>

      </div>

    </div>
  );
}
