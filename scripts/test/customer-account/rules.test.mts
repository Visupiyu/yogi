/*
 * LOCAL-ONLY Firestore RULES test (emulator) — Customer Account hardening.
 *   - every exploit found in the audit is now DENIED (referral replay, address
 *     injection, public reviewer emails, notification forgery, pre-filled
 *     "Seller Reply", direct order cancellation, forged chat senders, forged
 *     reward ledger rows, unlimited/unverified reviews, stock-alert emails to
 *     sellers);
 *   - the Customer App's own direct writes still work (self-notification,
 *     uid-owned addresses, delivered-order reviews, product questions, chats,
 *     messages, tickets, wishlist);
 *   - customer A vs customer B isolation across the account collections.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/customer-account/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";

const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
if (!hostPort || !/^(127\.0\.0\.1|localhost):\d+$/.test(hostPort)) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not a local emulator. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const [host, port] = hostPort.split(":");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const env = await initializeTestEnvironment({
  projectId: "demo-yomico-test",
  firestore: { rules: fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8"), host, port: Number(port) },
});

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}  — ${(e as Error).message}`); fail++; }
}

const M = "mallory";   // attacker customer
const A = "alice";     // victim customer
const SV = "sellerV";  // seller of p1
const SX = "sellerX";  // another seller
const ADMIN_EMAIL = "adminyogimart@gmail.com";
const emailOf = (uid: string) => `${uid}@example.com`;
const as = (uid: string, email = emailOf(uid)) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext("adminUid", { email: ADMIN_EMAIL, email_verified: true }).firestore();

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  await setDoc(doc(f, "users", M), { uid: M, role: "customer", email: emailOf(M), rewardPoints: 50, referralCode: "YOGI111111", referredBy: "YOGI222222", signupRewardsGrantedAt: new Date(), name: "Mal" });
  await setDoc(doc(f, "users", A), { uid: A, role: "customer", email: emailOf(A), rewardPoints: 10, referralCode: "YOGI222222", name: "Alice" });
  await setDoc(doc(f, "products", "p1"), { title: "P1", vendorId: SV, stock: 5 });
  await setDoc(doc(f, "products", "p2"), { title: "P2", vendorId: SX, stock: 5 });
  await setDoc(doc(f, "orders", "o_pending"), { userId: M, status: "Pending", items: [{ id: "p1" }], finalTotal: 500 });
  await setDoc(doc(f, "orders", "o_deliv"), { userId: M, status: "Delivered", items: [{ id: "p1" }], finalTotal: 500 });
  await setDoc(doc(f, "orders", "o_alice"), { userId: A, status: "Delivered", items: [{ id: "p1" }], finalTotal: 500 });
  await setDoc(doc(f, "chats", "c1"), { customerId: M, customerEmail: emailOf(M), sellerId: SV, productId: "p1" });
  await setDoc(doc(f, "productReviews", "r_alice"), { productId: "p1", userEmail: emailOf(A), rating: 5, review: "ok", customerName: "Alice" });
  await setDoc(doc(f, "rewardTransactions", "t_alice_uid"), { userId: A, points: 5, type: "Earned" });
  await setDoc(doc(f, "rewardTransactions", "t_mal_email"), { userEmail: emailOf(M), points: 5, type: "Earned" });
  await setDoc(doc(f, "stockNotifications", `p1_${A}`), { productId: "p1", vendorId: SV, userId: A, userEmail: emailOf(A) });
  await setDoc(doc(f, "addresses", "addr_alice"), { userId: A, name: "Alice", mobile: "9999999999", address: "1 Road", city: "c", state: "s", pincode: "111111", isDefault: true });
  await setDoc(doc(f, "addresses", "addr_mal_web"), { userEmail: emailOf(M), fullName: "Mal", phone: "9", addressLine1: "x", city: "c", state: "s", pincode: "1", isDefault: false });
  await setDoc(doc(f, "notifications", "n_alice"), { userId: A, role: "customer", type: "order", title: "t", message: "m", read: false });
  await setDoc(doc(f, "wishlist", "w_alice"), { userId: A, productId: "p1" });
  await setDoc(doc(f, "itemRequests", "ir_alice"), { userId: A, vendorId: SV, orderId: "o_alice", status: "REQUESTED" });
});

const Mdb = as(M);
const Adb = as(A);

// ================= C1 referral state =================
await check("C1a customer can no longer delete signupRewardsGrantedAt (re-arming the bonus)", () =>
  assertFails(updateDoc(doc(Mdb, "users", M), { signupRewardsGrantedAt: deleteField() })));
await check("C1b customer can no longer re-point referredBy", () =>
  assertFails(updateDoc(doc(Mdb, "users", M), { referredBy: "YOGI333333" })));
await check("C1c customer can no longer set their own referralCode (hijack)", () =>
  assertFails(updateDoc(doc(Mdb, "users", M), { referralCode: "YOGI222222" })));
await check("L2  customer can no longer rewrite their profile email", () =>
  assertFails(updateDoc(doc(Mdb, "users", M), { email: "someone-else@example.com" })));
await check("C1d new profile cannot bring its own referralCode or a settled stamp", async () => {
  await assertFails(setDoc(doc(as("newbie1"), "users", "newbie1"), { uid: "newbie1", role: "customer", referralCode: "YOGI999999" }));
  await assertFails(setDoc(doc(as("newbie2"), "users", "newbie2"), { uid: "newbie2", role: "customer", signupRewardsGrantedAt: new Date() }));
});
await check("C1e web signup shape (referredBy, no code) and Customer App shape are still ALLOWED", async () => {
  await assertSucceeds(setDoc(doc(as("newbie3"), "users", "newbie3"), { uid: "newbie3", name: "N", email: emailOf("newbie3"), phone: "9999999999", role: "customer", rewardPoints: 0, referredBy: "YOGI222222", totalReferrals: 0, createdAt: new Date() }));
  await assertSucceeds(setDoc(doc(as("newbie4"), "users", "newbie4"), { uid: "newbie4", name: "N", email: emailOf("newbie4"), mobile: "9999999999", role: "customer", createdAt: serverTimestamp() }));
});
await check("C1f owner may still edit name / phone / mobile / address", () =>
  assertSucceeds(updateDoc(doc(Mdb, "users", M), { name: "Mallory", phone: "8888888888", mobile: "8888888888", address: "street" })));
await check("CTRL rewardPoints / totalReferrals / role stay unwritable by the owner", async () => {
  await assertFails(updateDoc(doc(Mdb, "users", M), { rewardPoints: 99999 }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { totalReferrals: 5 }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { role: "admin" }));
});
await check("ISO customer A cannot read or update customer B's profile", async () => {
  await assertFails(getDoc(doc(Mdb, "users", A)));
  await assertFails(updateDoc(doc(Mdb, "users", A), { name: "x" }));
});

// ================= H1 addresses =================
await check("H1a web-shape address naming ANOTHER account's userId — DENIED", () =>
  assertFails(addDoc(collection(Mdb, "addresses"), { userEmail: emailOf(M), userId: A, fullName: "x", addressLine1: "attacker st", isDefault: true })));
await check("H1b app-shape address naming ANOTHER account's userEmail — DENIED", () =>
  assertFails(addDoc(collection(Mdb, "addresses"), { userId: M, userEmail: emailOf(A), name: "x", mobile: "9", address: "attacker st", city: "c", state: "s", pincode: "1", isDefault: true })));
await check("H1c address with no owner at all, an unknown field, or an oversized value — DENIED", async () => {
  await assertFails(addDoc(collection(Mdb, "addresses"), { fullName: "x" }));
  await assertFails(addDoc(collection(Mdb, "addresses"), { userId: M, name: "x", isAdmin: true }));
  await assertFails(addDoc(collection(Mdb, "addresses"), { userId: M, address: "x".repeat(501) }));
});
await check("H1d Customer App shape, legacy web shape and new web shape (userEmail + userId) — ALLOWED", async () => {
  await assertSucceeds(addDoc(collection(Mdb, "addresses"), { userId: M, name: "Mal", mobile: "9999999999", address: "1 Road", city: "c", state: "s", pincode: "111111", isDefault: false }));
  await assertSucceeds(addDoc(collection(Mdb, "addresses"), { userEmail: emailOf(M), fullName: "Mal", phone: "9", addressLine1: "a", addressLine2: "", landmark: "", city: "c", state: "s", pincode: "1", type: "Home", isDefault: false, createdAt: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(Mdb, "addresses"), { userEmail: emailOf(M), userId: M, fullName: "Mal", phone: "9", addressLine1: "a", city: "c", state: "s", pincode: "1", type: "Home", isDefault: false, createdAt: serverTimestamp() }));
});
await check("H1e owner can edit/default their address but cannot hand it to another account", async () => {
  await assertSucceeds(updateDoc(doc(Mdb, "addresses", "addr_mal_web"), { isDefault: true, city: "new" }));
  await assertFails(updateDoc(doc(Mdb, "addresses", "addr_mal_web"), { userId: A }));
});
await check("ISO customer A cannot read, edit, default or delete customer B's address", async () => {
  await assertFails(getDoc(doc(Mdb, "addresses", "addr_alice")));
  await assertFails(updateDoc(doc(Mdb, "addresses", "addr_alice"), { isDefault: false }));
  const { deleteDoc } = await import("firebase/firestore");
  await assertFails(deleteDoc(doc(Mdb, "addresses", "addr_alice")));
  await assertSucceeds(getDoc(doc(Adb, "addresses", "addr_alice")));
});

// ================= H2 reviews =================
await check("H2a signed-out visitor can no longer read or list web reviews (they carry emails)", async () => {
  await assertFails(getDoc(doc(anon(), "productReviews", "r_alice")));
  await assertFails(getDocs(query(collection(anon(), "productReviews"), where("productId", "==", "p1"))));
});
await check("H2b another signed-in customer cannot read the review either; the author and admin can", async () => {
  await assertFails(getDoc(doc(Mdb, "productReviews", "r_alice")));
  await assertSucceeds(getDoc(doc(Adb, "productReviews", "r_alice")));
  await assertSucceeds(getDocs(query(collection(Adb, "productReviews"), where("userEmail", "==", emailOf(A)))));
  await assertSucceeds(getDoc(doc(admin(), "productReviews", "r_alice")));
});
await check("M3a web reviews can no longer be written from the browser (server route only)", () =>
  assertFails(addDoc(collection(Mdb, "productReviews"), { productId: "p1", userEmail: emailOf(M), rating: 1, review: "bad" })));
await check("M3b Customer App review: ALLOWED for own Delivered order, DENIED for a Pending or someone else's order", async () => {
  const shape = (orderId: string) => ({ productId: "p1", productName: "P1", vendorId: SV, vendorName: "V", orderId, userId: M, rating: 4, review: "good", photos: [] });
  await assertSucceeds(addDoc(collection(Mdb, "reviews"), shape("o_deliv")));
  await assertFails(addDoc(collection(Mdb, "reviews"), shape("o_pending")));
  await assertFails(addDoc(collection(Mdb, "reviews"), shape("o_alice")));
});

// ================= H3 notifications =================
await check("H3a customer can no longer write a notification into ANOTHER user's feed", () =>
  assertFails(addDoc(collection(Mdb, "notifications"), { userId: A, role: "customer", type: "refund", title: "Refund on hold", message: "Call +91 0000000000", read: false, createdAt: serverTimestamp() })));
await check("H3b ...or into a seller's feed, or an admin notification", async () => {
  await assertFails(addDoc(collection(Mdb, "notifications"), { userId: SV, role: "seller", type: "order", title: "t", message: "m", read: false, createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(Mdb, "notifications"), { role: "admin", type: "support", title: "t", message: "m", read: false, createdAt: serverTimestamp() }));
});
await check("H3c Customer App self-notification ('Order Placed') and admin notifications still ALLOWED", async () => {
  await assertSucceeds(addDoc(collection(Mdb, "notifications"), { userId: M, title: "Order Placed", message: "Your order has been placed.", role: "customer", type: "order", read: false, createdAt: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(admin(), "notifications"), { userId: A, role: "customer", type: "order", title: "t", message: "m", read: false, createdAt: serverTimestamp() }));
});
await check("ISO notifications: B cannot read or mark A's; A marks own as read only", async () => {
  await assertFails(getDoc(doc(Mdb, "notifications", "n_alice")));
  await assertFails(updateDoc(doc(Mdb, "notifications", "n_alice"), { read: true }));
  await assertSucceeds(updateDoc(doc(Adb, "notifications", "n_alice"), { read: true }));
  await assertFails(updateDoc(doc(Adb, "notifications", "n_alice"), { userId: M }));
});

// ================= H4 product questions =================
await check("H4a question with a pre-filled answer — DENIED", () =>
  assertFails(addDoc(collection(Mdb, "productQuestions"), { productId: "p1", vendorId: SV, question: "Genuine?", answer: "No - buy elsewhere", status: "Pending" })));
await check("H4b question routed to a seller who does not own the product — DENIED", () =>
  assertFails(addDoc(collection(as(SX), "productQuestions"), { productId: "p1", vendorId: SX, question: "q", answer: "", status: "Pending" })));
await check("H4c Customer App question shape — ALLOWED; with someone else's email/uid — DENIED", async () => {
  const shape = { productId: "p1", productName: "P1", vendorId: SV, vendorName: "V", userId: M, customerName: "Mal", customerEmail: emailOf(M), question: "Size?", answer: "", status: "Pending", createdAt: serverTimestamp() };
  await assertSucceeds(addDoc(collection(Mdb, "productQuestions"), shape));
  await assertFails(addDoc(collection(Mdb, "productQuestions"), { ...shape, customerEmail: emailOf(A) }));
  await assertFails(addDoc(collection(Mdb, "productQuestions"), { ...shape, userId: A }));
});
await check("H4d sellers can no longer answer by writing the document (server route only); admin still can", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "productQuestions", "q1"), { productId: "p1", vendorId: SV, question: "q", answer: "", status: "Pending" });
  });
  await assertFails(updateDoc(doc(as(SV), "productQuestions", "q1"), { answer: "a", status: "Answered" }));
  await assertSucceeds(updateDoc(doc(admin(), "productQuestions", "q1"), { answer: "a", status: "Answered" }));
});

// ================= M1 orders =================
await check("M1  customer can no longer cancel a Pending order by a direct write (app/api/cancel-order only)", () =>
  assertFails(updateDoc(doc(Mdb, "orders", "o_pending"), { status: "Cancelled", updatedAt: serverTimestamp() })));
await check("ISO orders: own order readable; another customer's is not; no money/payment/status writes", async () => {
  await assertSucceeds(getDoc(doc(Mdb, "orders", "o_deliv")));
  await assertFails(getDoc(doc(Mdb, "orders", "o_alice")));
  await assertFails(updateDoc(doc(Mdb, "orders", "o_deliv"), { paymentStatus: "Paid" }));
  await assertFails(updateDoc(doc(Mdb, "orders", "o_deliv"), { finalTotal: 1 }));
  await assertFails(updateDoc(doc(Mdb, "orders", "o_pending"), { status: "Delivered" }));
});

// ================= M2 chats / messages =================
await check("M2a chat with a seller who does not own the product — DENIED; with someone else's identity — DENIED", async () => {
  await assertFails(addDoc(collection(Mdb, "chats"), { customerId: M, customerEmail: emailOf(M), sellerId: SX, productId: "p1" }));
  await assertFails(addDoc(collection(Mdb, "chats"), { customerId: A, sellerId: SV, productId: "p1" }));
  await assertFails(addDoc(collection(Mdb, "chats"), { customerId: M, customerEmail: emailOf(A), sellerId: SV, productId: "p1" }));
});
await check("M2b web and Customer App chat shapes — ALLOWED", async () => {
  await assertSucceeds(addDoc(collection(Mdb, "chats"), { customerId: M, customerEmail: emailOf(M), customerName: "Mal", sellerId: SV, sellerName: "V", sellerImage: "", customerImage: "", productId: "p1", productName: "P1", lastMessage: "", customerUnread: 0, sellerUnread: 0, createdAt: serverTimestamp(), lastMessageAt: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(Mdb, "chats"), { customerId: M, customerEmail: emailOf(M), customerName: "Mal", sellerId: SV, sellerName: "V", productId: "p1", productName: "P1", lastMessage: "", lastSender: "", sellerUnread: 0, customerUnread: 0, lastMessageAt: serverTimestamp() }));
});
await check("M2c customer posting AS the seller (sender / senderRole / senderId) — DENIED", async () => {
  await assertFails(addDoc(collection(Mdb, "messages"), { chatId: "c1", sender: "seller", senderName: "Seller", text: "Refund approved", createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(Mdb, "messages"), { chatId: "c1", senderRole: "seller", senderId: M, text: "x", createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(Mdb, "messages"), { chatId: "c1", senderRole: "customer", senderId: SV, text: "x", createdAt: serverTimestamp() }));
});
await check("M2d seller posting AS the customer — DENIED; oversized text, extra field or outsider — DENIED", async () => {
  await assertFails(addDoc(collection(as(SV), "messages"), { chatId: "c1", sender: "customer", senderName: "Mal", text: "I received it", createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(Mdb, "messages"), { chatId: "c1", sender: "customer", text: "x".repeat(2001), createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(Mdb, "messages"), { chatId: "c1", sender: "customer", text: "x", verified: true, createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(Adb, "messages"), { chatId: "c1", sender: "customer", text: "x", createdAt: serverTimestamp() }));
});
await check("M2e web customer, web seller and Customer App message shapes — ALLOWED", async () => {
  await assertSucceeds(addDoc(collection(Mdb, "messages"), { chatId: "c1", sender: "customer", senderName: "Mal", text: "hi", image: "", createdAt: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(as(SV), "messages"), { chatId: "c1", sender: "seller", senderName: "V", text: "hello", image: "", createdAt: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(Mdb, "messages"), { chatId: "c1", senderId: M, senderRole: "customer", senderName: "Mal", text: "app", createdAt: serverTimestamp() }));
});
await check("ISO chats: an outsider cannot read the chat", () => assertFails(getDoc(doc(Adb, "chats", "c1"))));

// ================= L1 / decision 4 reward ledger =================
await check("L1  customer can no longer create reward ledger rows", () =>
  assertFails(addDoc(collection(Mdb, "rewardTransactions"), { userEmail: emailOf(M), userId: M, points: 100000, type: "Earned" })));
await check("D4  ledger readable by owner uid (new) and owner email (legacy); never by another customer", async () => {
  await assertSucceeds(getDocs(query(collection(Adb, "rewardTransactions"), where("userId", "==", A))));
  await assertSucceeds(getDocs(query(collection(Mdb, "rewardTransactions"), where("userEmail", "==", emailOf(M)))));
  await assertFails(getDoc(doc(Mdb, "rewardTransactions", "t_alice_uid")));
  await assertFails(getDocs(query(collection(Mdb, "rewardTransactions"), where("userId", "==", A))));
});

// ================= M7 stock alerts =================
await check("M7a stock alerts can no longer be written from the browser (server route only)", () =>
  assertFails(addDoc(collection(Mdb, "stockNotifications"), { productId: "p1", userEmail: emailOf(M), vendorId: SV })));
await check("M7b the seller can no longer read waiting customers' requests (emails); the customer can read their own", async () => {
  await assertFails(getDoc(doc(as(SV), "stockNotifications", `p1_${A}`)));
  await assertFails(getDocs(query(collection(as(SV), "stockNotifications"), where("vendorId", "==", SV))));
  await assertSucceeds(getDoc(doc(Adb, "stockNotifications", `p1_${A}`)));
  await assertFails(getDoc(doc(Mdb, "stockNotifications", `p1_${A}`)));
});

// ================= tickets / wishlist / returns isolation =================
await check("D4  tickets: Customer App shape ALLOWED; a ticket naming another uid — DENIED", async () => {
  const t = { userId: M, customerName: "Mal", userEmail: emailOf(M), subject: "Help", category: "Order", message: "msg", status: "Open", adminReply: "", createdAt: serverTimestamp() };
  await assertSucceeds(addDoc(collection(Mdb, "tickets"), t));
  await assertFails(addDoc(collection(Mdb, "tickets"), { ...t, userId: A }));
});
await check("ISO wishlist: B cannot read A's item or create one in A's name", async () => {
  await assertFails(getDoc(doc(Mdb, "wishlist", "w_alice")));
  await assertFails(addDoc(collection(Mdb, "wishlist"), { userId: A, productId: "p2" }));
  await assertSucceeds(addDoc(collection(Mdb, "wishlist"), { userId: M, productId: "p2" }));
});
await check("ISO returns: B cannot read A's item-level return; no customer writes", async () => {
  await assertFails(getDoc(doc(Mdb, "itemRequests", "ir_alice")));
  await assertSucceeds(getDoc(doc(Adb, "itemRequests", "ir_alice")));
  await assertFails(updateDoc(doc(Adb, "itemRequests", "ir_alice"), { status: "REFUNDED" }));
});

await env.clearFirestore();
await env.cleanup();
console.log(`\n${pass}/${pass + fail} customer-account rules checks passed`);
process.exit(fail ? 1 : 0);
