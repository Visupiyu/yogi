// SERVER-ONLY (Admin SDK). Loads one customer's account views for
// app/api/account/*. The customer is ALWAYS the verified token — its uid and,
// for records made before they carried a uid, its email. Nothing in the
// request selects whose data is read. Every read is a single-field query on
// the customer's own documents; the shapes returned are lib/account/accountViews.
import type { Firestore, Query } from "firebase-admin/firestore";
import type { VerifiedUser } from "@/lib/serverAuth";
import {
  buildLedger,
  buildLegacyReturnView,
  buildOrderCard,
  buildReferrals,
  buildRefundViews,
  buildReturnRequestView,
  iso,
  newestOrders,
  orderCounts,
  orderNumbersOf,
  pendingPoints,
  rewardBalanceOf,
  WALLET_RULES,
  type AccountReferrals,
  type AccountSummary,
  type Doc,
  type LedgerEntry,
  type LegacyReturnView,
  type PendingOrderPoints,
  type RefundView,
  type ReturnRequestView,
  type Row,
} from "@/lib/account/accountViews";
import { isCustomerNotificationFor } from "@/lib/account/notificationViews";
import { isRewardsEligible } from "@/lib/rewards/eligibility";

export const WALLET_PAGE_SIZE = 50;

async function rows(q: Query): Promise<Row[]> {
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, data: (d.data() || {}) as Doc }));
}

/** Documents owned by uid, plus older ones owned only by the account email. */
async function ownedByUidOrEmail(db: Firestore, collection: string, who: VerifiedUser): Promise<Row[]> {
  const [byUid, byEmail] = await Promise.all([
    rows(db.collection(collection).where("userId", "==", who.uid)),
    who.email ? rows(db.collection(collection).where("userEmail", "==", who.email)) : Promise.resolve([] as Row[]),
  ]);
  const seen = new Map<string, Row>();
  for (const r of [...byUid, ...byEmail]) {
    // An email-matched document that names a DIFFERENT uid is not this
    // customer's, whatever its email says.
    const owner = r.data.userId;
    if (typeof owner === "string" && owner && owner !== who.uid) continue;
    seen.set(r.id, r);
  }
  return [...seen.values()];
}

async function userDoc(db: Firestore, uid: string): Promise<Doc> {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? ((snap.data() || {}) as Doc) : {};
}

const ordersOf = (db: Firestore, uid: string) => rows(db.collection("orders").where("userId", "==", uid));
const itemRequestsOf = (db: Firestore, uid: string) => rows(db.collection("itemRequests").where("userId", "==", uid));

// ---------------------------------------------------------------------------

export async function loadAccountSummary(db: Firestore, who: VerifiedUser, now = new Date()): Promise<AccountSummary> {
  const [user, orders, requests, legacy, notifications, addresses] = await Promise.all([
    userDoc(db, who.uid),
    ordersOf(db, who.uid),
    itemRequestsOf(db, who.uid),
    ownedByUidOrEmail(db, "returns", who),
    rows(db.collection("notifications").where("userId", "==", who.uid)),
    ownedByUidOrEmail(db, "addresses", who),
  ]);
  const orderNumbers = orderNumbersOf(orders);
  const refunds = buildRefundViews(requests, orders, legacy, orderNumbers);
  const name = typeof user.name === "string" && user.name.trim() ? user.name.trim().slice(0, 100) : "";

  return {
    profile: {
      displayName: name || "Customer",
      email: who.email || "",
      emailVerified: who.emailVerified,
      phone: typeof user.phone === "string" && user.phone ? user.phone.slice(0, 20) : null,
      address: typeof user.address === "string" && user.address ? user.address.slice(0, 500) : null,
      memberSince: iso(user.createdAt),
    },
    actions: {
      pickupSlotsToConfirm: requests.filter((r) => r.data.type === "return" && r.data.status === "PICKUP_PROPOSED").length,
      verifyEmail: !who.emailVerified,
      refundsDue: refunds.filter((r) => r.source === "order-cancellation" && r.status !== "completed").length,
    },
    orders: { ...orderCounts(orders), recent: newestOrders(orders, 3).map(buildOrderCard) },
    returns: {
      open: requests.filter((r) => !["REFUNDED", "DELIVERED", "REJECTED", "CANCELLED"].includes(String(r.data.status))).length,
    },
    rewards: {
      balance: rewardBalanceOf(user),
      pendingPoints: pendingPoints(orders, requests, legacy, now).points,
      rewardsEligible: isRewardsEligible(user),
    },
    referrals: {
      code: typeof user.referralCode === "string" && /^[A-Z0-9]{4,32}$/.test(user.referralCode) ? user.referralCode : null,
      paidReferrals: Math.max(0, Math.floor(Number(user.totalReferrals) || 0)),
    },
    notifications: {
      unread: notifications.filter((n) => isCustomerNotificationFor(who.uid, n.data) && n.data.read !== true).length,
    },
    addresses: { saved: addresses.length },
  };
}

// ---------------------------------------------------------------------------

export type AccountReturns = {
  requests: ReturnRequestView[];
  legacyReturns: LegacyReturnView[];
  refunds: RefundView[];
};

export async function loadAccountReturns(db: Firestore, who: VerifiedUser): Promise<AccountReturns> {
  const [orders, requests, legacy] = await Promise.all([
    ordersOf(db, who.uid),
    itemRequestsOf(db, who.uid),
    ownedByUidOrEmail(db, "returns", who),
  ]);
  const orderNumbers = orderNumbersOf(orders);
  const byNewest = (a: Row, b: Row) =>
    (iso(b.data.createdAt) || "").localeCompare(iso(a.data.createdAt) || "");
  return {
    requests: [...requests].sort(byNewest).map((r) => buildReturnRequestView(r, orderNumbers)),
    legacyReturns: [...legacy].sort(byNewest).map((r) => buildLegacyReturnView(r, orderNumbers)),
    refunds: buildRefundViews(requests, orders, legacy, orderNumbers),
  };
}

// ---------------------------------------------------------------------------

export type AccountWallet = {
  balance: number;
  pending: { points: number; orders: PendingOrderPoints[] };
  ledger: LedgerEntry[];
  nextCursor: string | null;
  rules: typeof WALLET_RULES;
  /** First qualifying purchase completed (users.rewardsEligibleAt, server-owned). */
  rewardsEligible: boolean;
  rewardsEligibleAt: string | null;
};
export const ACCOUNT_WALLET_KEYS = [
  "balance", "pending", "ledger", "nextCursor", "rules", "rewardsEligible", "rewardsEligibleAt",
] as const;

/** cursor = how many ledger entries the customer has already been shown. */
export function parseWalletCursor(raw: string | null): number | null {
  if (raw === null || raw === "") return 0;
  if (!/^\d{1,6}$/.test(raw)) return null;
  return Number(raw);
}

export async function loadAccountWallet(db: Firestore, who: VerifiedUser, offset: number, now = new Date()): Promise<AccountWallet> {
  const [user, orders, requests, legacy, ledgerRows] = await Promise.all([
    userDoc(db, who.uid),
    ordersOf(db, who.uid),
    itemRequestsOf(db, who.uid),
    ownedByUidOrEmail(db, "returns", who),
    ownedByUidOrEmail(db, "rewardTransactions", who),
  ]);
  const ledger = buildLedger(ledgerRows, orderNumbersOf(orders));
  const page = ledger.slice(offset, offset + WALLET_PAGE_SIZE);
  return {
    // The balance checkout actually spends — never re-derived from history.
    balance: rewardBalanceOf(user),
    pending: pendingPoints(orders, requests, legacy, now),
    ledger: page,
    nextCursor: offset + WALLET_PAGE_SIZE < ledger.length ? String(offset + WALLET_PAGE_SIZE) : null,
    rules: WALLET_RULES,
    // Read from the trusted profile only — never from the request.
    rewardsEligible: isRewardsEligible(user),
    rewardsEligibleAt: isRewardsEligible(user) ? iso(user.rewardsEligibleAt) : null,
  };
}

// ---------------------------------------------------------------------------

export async function loadAccountReferrals(db: Firestore, who: VerifiedUser, now = Date.now()): Promise<AccountReferrals> {
  const [user, ownLedger] = await Promise.all([userDoc(db, who.uid), ownedByUidOrEmail(db, "rewardTransactions", who)]);
  const code = typeof user.referralCode === "string" && /^[A-Z0-9]{4,32}$/.test(user.referralCode) ? user.referralCode : null;
  const friends = code ? await rows(db.collection("users").where("referredBy", "==", code)) : [];
  return buildReferrals({ uid: who.uid, user, ownLedger, friends, now });
}
