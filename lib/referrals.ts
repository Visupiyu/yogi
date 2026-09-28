// Referral programme — the business rules, in one place. Pure, so the route
// and the tests share it.
//
//   - A new customer who signed up with a referral code gets WELCOME_BONUS and
//     the code's owner gets REFERRER_BONUS — the amounts are unchanged.
//   - Paid only once the new customer's email is verified.
//   - A referrer is paid for at most REFERRAL_MONTHLY_CAP referrals per IST
//     calendar month. A referral over the cap is DEFERRED, not forfeited: it
//     stays eligible and is paid on a later check once the referrer is under
//     the cap in a new month.
//   - Referral codes are issued by the server and never change.
//
// Each paid referral writes two ledger rows with fixed ids, so the grant is
// idempotent on documents only the server can write:
//   rewardTransactions/referral_{newUid}   the new customer's welcome bonus
//   rewardTransactions/referrer_{newUid}   the referrer's bonus for that customer

export const REFERRER_BONUS = 100;
export const WELCOME_BONUS = 50;
export const REFERRAL_MONTHLY_CAP = 10;

const IST_OFFSET_MS = 330 * 60 * 1000;

export function welcomeLedgerId(newUid: string): string {
  return `referral_${newUid}`;
}
export function referrerLedgerId(newUid: string): string {
  return `referrer_${newUid}`;
}
export function isReferrerLedgerId(id: string): boolean {
  return id.startsWith("referrer_");
}

/** Start of the IST calendar month containing `nowMs`, as epoch ms. */
export function istMonthStartMs(nowMs: number): number {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS;
}

/** Same format the signup page used: "YOGI" + 6 digits. */
export function generateReferralCode(random: () => number = Math.random): string {
  return "YOGI" + Math.floor(100000 + random() * 900000);
}

export function isWellFormedReferralCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z0-9]{4,32}$/.test(code);
}

/** How many referrals this referrer has been paid for in the current IST month. */
export function paidReferralsThisMonth(
  referrerRows: { id: string; createdAtMs: number | null }[],
  nowMs: number
): number {
  const start = istMonthStartMs(nowMs);
  return referrerRows.filter(
    (row) => isReferrerLedgerId(row.id) && row.createdAtMs !== null && row.createdAtMs >= start
  ).length;
}
