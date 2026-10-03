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

type Channels = { email: boolean; inApp: boolean } | null;

// Honest wording for where the code actually went (no SMS channel exists).
function sentToText(channels: Channels): string {
  if (!channels) return "Your delivery code is sent to your email and YOMICO notifications.";
  if (channels.email && channels.inApp) return "Your delivery code was sent to your email and your YOMICO notifications.";
  if (channels.inApp) {
    return "We couldn't email your delivery code — it is in your YOMICO notifications (bell icon). Check that the email on your account is correct.";
  }
  if (channels.email) return "Your delivery code was sent to your email.";
  return "We couldn't deliver your delivery code. Please tap “Resend delivery code”.";
}

export default function DeliveryOtpNotice({ orderId }: { orderId: string }) {
  const [outForDelivery, setOutForDelivery] = useState(false);
  const [channels, setChannels] = useState<Channels>(null);
  const [resending, setResending] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/delivery/order/${encodeURIComponent(orderId)}/shipments`);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const out: { outForDelivery?: boolean; deliveryCodeChannels?: Channels }[] = Array.isArray(data.shipments)
        ? data.shipments.filter((s: { outForDelivery?: boolean }) => s?.outForDelivery === true)
        : [];
      setOutForDelivery(out.length > 0);
      // Several shipments: report the weakest outcome so a failed email is never hidden.
      const recorded = out.map((s) => s.deliveryCodeChannels).filter((c): c is NonNullable<Channels> => !!c);
      setChannels(
        recorded.length
          ? { email: recorded.every((c) => c.email), inApp: recorded.every((c) => c.inApp) }
          : null
      );
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
        const d = (await res.json().catch(() => ({}))) as { channels?: { email?: boolean; inApp?: boolean } };
        const sent: Channels = d.channels ? { email: d.channels.email === true, inApp: d.channels.inApp === true } : null;
        setChannels(sent);
        const anySent = !sent || sent.email || sent.inApp;
        setMsg({ type: anySent ? "ok" : "err", text: `New code issued. ${sentToText(sent)}` });
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
        {sentToText(channels)} Share it only with the delivery person at handover — never before. Didn&apos;t get
        it? Resend it below; the delivery person can wait or rearrange the delivery.
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
