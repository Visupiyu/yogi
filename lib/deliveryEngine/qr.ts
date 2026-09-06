// SERVER-ONLY. Delivery Engine — shipment QR/token helpers (Phase 2B-4).
//
// The QR encodes ONLY a compact shipment identity plus an opaque, unguessable
// server-generated token: `${shipmentNumber}.${scanToken}` (e.g.
// "TRCK000123.<32 hex>"). No customer PII, no address, no order id, no vendor id.
//
// The token is a shared secret embedded in the physical label. It is NEVER
// authorization by itself: the scan endpoint uses it only to RESOLVE the job,
// and every mutation still independently authorizes the Firebase actor, the
// assigned person, the leg state and the legal transition. A leaked token
// therefore cannot drive an unauthorized transition.
import { randomBytes } from "crypto";

/** A fresh opaque 128-bit token as 32 lowercase hex chars. */
export function mintScanToken(): string {
  return randomBytes(16).toString("hex");
}

const SHIPMENT_RE = /^TRCK\d{6}$/;
const TOKEN_RE = /^[0-9a-f]{32}$/;

/** Build the QR payload string for a shipment. */
export function buildQrPayload(shipmentNumber: string, scanToken: string): string {
  return `${shipmentNumber}.${scanToken}`;
}

/**
 * Parse a scanned QR payload into its parts, validating shape only (NOT
 * authenticity — that is done server-side by matching the stored token).
 * Returns null for anything that is not a well-formed shipment payload.
 */
export function parseQrPayload(
  qr: unknown
): { shipmentNumber: string; scanToken: string } | null {
  if (typeof qr !== "string") return null;
  const trimmed = qr.trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0) return null;
  const shipmentNumber = trimmed.slice(0, dot);
  const scanToken = trimmed.slice(dot + 1);
  if (!SHIPMENT_RE.test(shipmentNumber) || !TOKEN_RE.test(scanToken)) return null;
  return { shipmentNumber, scanToken };
}
