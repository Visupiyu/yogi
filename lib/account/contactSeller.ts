// "Contact Seller" for an order (client only) — the one place that calls
// /api/contact-seller, shared by the orders list and the order detail page.
//
// The API verifies from the ID token that the caller OWNS the order and then
// finds or creates the chat server-side, returning its id. Nothing is written to
// the order and no chat id is invented here. For an order with several sellers
// the API (called without a vendorId) opens the chat with the FIRST seller on the
// order — that existing behaviour is unchanged.
import { auth } from "@/lib/firebase";

export type SellerChatResult =
  | { ok: true; chatId: string }
  | { ok: false; loginRequired: boolean; message: string };

export async function requestSellerChat(orderId: string): Promise<SellerChatResult> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, loginRequired: true, message: "Please login first." };
  }
  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/contact-seller", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.chatId) {
      return {
        ok: false,
        loginRequired: false,
        message: data?.error || "Could not open the chat. Please try again.",
      };
    }
    return { ok: true, chatId: String(data.chatId) };
  } catch (error) {
    console.error("Chat Error:", error);
    return { ok: false, loginRequired: false, message: "Could not open the chat. Please try again." };
  }
}
