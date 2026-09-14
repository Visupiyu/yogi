// CLIENT helper for the Delivery Person App (2B-6B-1).
//
// Wraps calls to the EXISTING authoritative delivery APIs. The scan payload
// (shipmentNumber + scanToken) lives only in memory and is passed straight to
// POST /api/delivery/scan — it is never logged, never persisted to
// localStorage/sessionStorage/IndexedDB, and never put in a URL. The server
// remains the sole authority for FSM/custody/OTP validation.
import { auth } from "@/lib/firebase";

// In-memory only. NEVER serialise/persist this.
export type ScanPayload = { shipmentNumber: string; scanToken: string };

export type ScanAction =
  | "PICKUP"
  | "DEPART"
  | "ARRIVE"
  | "OUT_FOR_DELIVERY"
  | "DELIVER"
  | "ATTEMPT_FAILED"
  | "EXCEPTION";

export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const idToken = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

export function newClientEventId(): string {
  // crypto.randomUUID is available in all target browsers (Android Chrome / iOS Safari 15.4+).
  return crypto.randomUUID();
}

// Validate a scanned QR string into its parts WITHOUT importing the server-only
// qr lib (which pulls node:crypto). Shape only — authenticity is verified
// server-side against the stored token.
const SHIPMENT_RE = /^TRCK\d{6}$/;
const TOKEN_RE = /^[0-9a-f]{32}$/;
export function parseScannedPayload(text: unknown): ScanPayload | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  const dot = t.indexOf(".");
  if (dot <= 0) return null;
  const shipmentNumber = t.slice(0, dot);
  const scanToken = t.slice(dot + 1);
  if (!SHIPMENT_RE.test(shipmentNumber) || !TOKEN_RE.test(scanToken)) return null;
  return { shipmentNumber, scanToken };
}

// Supporting evidence only; never blocks an action and is never shown as raw
// coordinates in the UI. Resolves to null on denial/unavailable/timeout.
export async function captureGeo(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: { lat: number; lng: number; accuracy: number } | null) => { if (!settled) { settled = true; resolve(v); } };
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => done(null),
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 30000 }
      );
    } catch { done(null); }
  });
}

export type ScanResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };

// Submit one execution action. Online-first: a NETWORK failure is retried with
// the SAME clientEventId (the server dedups by deterministic event id, so a
// retry can never double-apply). A definitive server rejection is NOT retried.
// Never claims success until the server confirms it.
export async function submitScan(args: {
  payload: ScanPayload;
  action: ScanAction;
  clientEventId?: string;
  otp?: string;
  exceptionCode?: string;
  notes?: string;
}): Promise<ScanResult> {
  const clientEventId = args.clientEventId || newClientEventId();
  const geo = await captureGeo();
  const body: Record<string, unknown> = {
    shipmentNumber: args.payload.shipmentNumber,
    scanToken: args.payload.scanToken, // in-memory → request only; never logged/persisted
    action: args.action,
    clientEventId,
    capturedAt: Date.now(),
  };
  if (geo) { body.geo = { lat: geo.lat, lng: geo.lng }; body.geoAccuracy = geo.accuracy; }
  if (args.otp) body.otp = args.otp;
  if (args.exceptionCode) body.exceptionCode = args.exceptionCode;
  if (args.notes) body.notes = args.notes;

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await authedFetch("/api/delivery/scan", { method: "POST", body: JSON.stringify(body) });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* non-JSON */ }
      if (res.ok) return { ok: true, data };
      // Definitive server response — do not retry (same clientEventId would repeat the rejection).
      return { ok: false, status: res.status, error: typeof data.error === "string" ? data.error : "Action failed." };
    } catch {
      // Network/transport failure — retry with the SAME clientEventId.
      if (attempt === maxAttempts) return { ok: false, status: 0, error: "Network error. Please check your connection and try again." };
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  return { ok: false, status: 0, error: "Action failed." };
}
