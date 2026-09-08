"use client";

// Customer (order-owner) delivery-OTP notice. Shown only while a shipment for
// this order is OUT FOR DELIVERY. It NEVER displays the OTP — the code reaches
// the customer only through the email / in-app notification channels. It offers
// a "Resend delivery code" action (owner-authenticated) and surfaces no internal
// security fields (hash/attempts/issuedAt are never fetched or shown).
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
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

export default function DeliveryOtpNotice({ orderId }: { orderId: string }) {
  const [outForDelivery, setOutForDelivery] = useState(false);
  const [resending, setResending] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/delivery/order/${encodeURIComponent(orderId)}/shipments`);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const any =
        Array.isArray(data.shipments) &&
        data.shipments.some((s: { outForDelivery?: boolean }) => s?.outForDelivery === true);
      setOutForDelivery(!!any);
    } catch {
      /* tracking is best-effort here; stay silent on failure */
    }
  }, [orderId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) void load();
    });
    return () => unsub();
  }, [load]);

  const resend = useCallback(async () => {
    if (resending) return;
    setResending(true);
    setMsg(null);
    try {
      const res = await authedFetch(`/api/delivery/order/${encodeURIComponent(orderId)}/resend-otp`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setMsg({ type: "ok", text: "A new delivery code has been sent to your email and notifications." });
      } else if (res.status === 429) {
        setMsg({ type: "err", text: "Too many requests. Please wait a few minutes and try again." });
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: (d as { error?: string })?.error || "Could not resend the code. Please try again." });
      }
    } catch {
      setMsg({ type: "err", text: "Could not resend the code. Please try again." });
    } finally {
      setResending(false);
    }
  }, [orderId, resending]);

  if (!outForDelivery) return null;

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <p className="text-sm font-medium text-blue-900">🔐 Your delivery is on the way</p>
      <p className="mt-1 text-sm text-blue-800">
        Your delivery code has been sent to your email and notifications. Share it only with the delivery
        person at handover — never before.
      </p>
      <button
        onClick={resend}
        disabled={resending}
        className="mt-3 rounded border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-800 disabled:opacity-50"
      >
        {resending ? "Sending…" : "Resend delivery code"}
      </button>
      {msg && (
        <p className={`mt-2 text-sm ${msg.type === "ok" ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>
      )}
    </div>
  );
}
