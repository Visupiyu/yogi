"use client";

// A failed data load, shown instead of an empty list / "not found". Same red
// alert look the search and category pages already use. The message is written
// by the caller (never a raw Firebase error string).
export default function LoadErrorState({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`bg-red-50 border border-red-200 rounded-3xl p-6 text-center ${className}`}
    >
      <p className="text-red-700 font-semibold">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-semibold transition"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
