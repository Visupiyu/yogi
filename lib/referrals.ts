// Referral programme — the business rules, in one place. Pure, so the route
// and the tests share it.
//
//   - A new customer who signed up with a referral code gets WELCOME_BONUS and
//     the code's owner gets REFERRER_BONUS — the amounts are unchanged.
//   - Direct referrals are UNLIMITED and ONE LEVEL only: only the holder of the
//     code is paid, never whoever referred them.
//   - Paid only once the new customer's email is verified, only while neither
//     account is blocked, and only for a genuinely NEW customer: the profile
//     must be created within NEW_CUSTOMER_WINDOW_MS of the Auth account.
//   - Referral codes are issued by the server and never change.
//
// Fraud/abuse protection beyond these rules (referral velocity limits,
// device/phone signals, review queues) is DEFERRED to the fraud-protection
// stage; removing the old monthly cap did not replace it with a new limit.
//
// Each paid referral writes two ledger rows with fixed ids, so the grant is
// idempotent on documents only the server can write:
//   rewardTransactions/referral_{newUid}   the new customer's welcome bonus
//   rewardTransactions/referrer_{newUid}   the referrer's bonus for that customer

export const REFERRER_BONUS = 100;
export const WELCOME_BONUS = 50;

/** A profile created more than this long after its Auth account is not a new customer. */
export const NEW_CUSTOMER_WINDOW_MS = 30 * 60 * 1000;

export function welcomeLedgerId(newUid: string): string {
  return `referral_${newUid}`;
}
export function referrerLedgerId(newUid: string): string {
  return `referrer_${newUid}`;
}
export function isReferrerLedgerId(id: string): boolean {
  return id.startsWith("referrer_");
}

/** Same format the signup page used: "YOGI" + 6 digits. */
export function generateReferralCode(random: () => number = Math.random): string {
  return "YOGI" + Math.floor(100000 + random() * 900000);
}

export function isWellFormedReferralCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z0-9]{4,32}$/.test(code);
}

/**
 * Whether the users/{uid} profile belongs to a genuinely new customer: it was
 * created (server-assigned document createTime) no more than
 * NEW_CUSTOMER_WINDOW_MS after the Firebase Auth account.
 */
export function isNewCustomerProfile(profileCreatedMs: number, authCreatedMs: number): boolean {
  return profileCreatedMs - authCreatedMs <= NEW_CUSTOMER_WINDOW_MS;
}
