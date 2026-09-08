// SERVER-ONLY. Delivery Engine — customer delivery-OTP crypto + verification.
//
// The customer's delivery OTP is stored ONLY as an HMAC-SHA256 hash
// (job.deliveryOtpHash) keyed by a server-only secret (DELIVERY_OTP_SECRET).
// The plaintext exists transiently in server memory only long enough to notify
// the customer and is NEVER persisted, returned by any API, or logged.
//
// Verification hashes the supplied code and constant-time-compares it to the
// stored hash, enforces a 24h TTL and a 5-attempt cap, and FAILS CLOSED when
// there is no active OTP (or no secret configured — so a missing secret
// degrades to the pre-integration "cannot confirm delivery" behavior rather
// than breaking the OUT_FOR_DELIVERY transition).
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

export const DELIVERY_OTP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DELIVERY_OTP_MAX_ATTEMPTS = 5;

/** True only when the server HMAC secret is configured. */
export function isDeliveryOtpConfigured(): boolean {
  const s = process.env.DELIVERY_OTP_SECRET;
  return typeof s === "string" && s.length > 0;
}

/** Cryptographically secure 6-digit numeric code (000000–999999). */
export function generateDeliveryOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** HMAC-SHA256 hex of the code under the server secret. Throws if unconfigured. */
export function hashDeliveryOtp(code: string): string {
  const secret = process.env.DELIVERY_OTP_SECRET;
  if (!secret) throw new Error("DELIVERY_OTP_SECRET is not configured.");
  return createHmac("sha256", secret).update(code).digest("hex");
}

function toMillis(v: unknown): number | null {
  if (!v) return null;
  if (typeof (v as { toMillis?: unknown }).toMillis === "function") {
    try { return (v as { toMillis: () => number }).toMillis(); } catch { return null; }
  }
  if (typeof (v as { toDate?: unknown }).toDate === "function") {
    try { return (v as { toDate: () => Date }).toDate().getTime(); } catch { return null; }
  }
  if (typeof v === "number") return v;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  return null;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false; // lengths are non-secret (fixed hash width)
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export type OtpVerdict = "ok" | "missing" | "expired" | "locked" | "mismatch";

// Pure classification — NO writes and it NEVER logs the code. Used by the
// DELIVER path to decide pass/fail and whether to count a failed attempt.
// Order matters: locked is checked before expiry so a locked OTP stays locked.
export function classifyDeliveryOtp(job: DeliveryJob, provided: unknown): OtpVerdict {
  const hash = typeof (job as { deliveryOtpHash?: unknown }).deliveryOtpHash === "string"
    ? (job as { deliveryOtpHash: string }).deliveryOtpHash
    : "";
  if (!hash) return "missing";
  if (!isDeliveryOtpConfigured()) return "missing"; // cannot verify → fail closed
  const code = typeof provided === "string" ? provided.trim() : "";
  if (!code) return "missing";
  const attempts = typeof (job as { deliveryOtpAttempts?: unknown }).deliveryOtpAttempts === "number"
    ? (job as { deliveryOtpAttempts: number }).deliveryOtpAttempts
    : 0;
  if (attempts >= DELIVERY_OTP_MAX_ATTEMPTS) return "locked";
  const issued = toMillis((job as { deliveryOtpIssuedAt?: unknown }).deliveryOtpIssuedAt);
  if (issued === null || Date.now() - issued > DELIVERY_OTP_TTL_MS) return "expired";
  let candidate: string;
  try { candidate = hashDeliveryOtp(code); } catch { return "missing"; }
  return constantTimeEqualHex(candidate, hash) ? "ok" : "mismatch";
}

/**
 * Preserved boolean contract used at the DELIVER call site. True only for a
 * present, unexpired, unlocked OTP whose hash matches the supplied code. Fails
 * closed (false) for every other case; reveals nothing about the reason.
 */
export function verifyDeliveryOtp(job: DeliveryJob, otp: unknown): boolean {
  return classifyDeliveryOtp(job, otp) === "ok";
}
