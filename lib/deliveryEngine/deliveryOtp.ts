// SERVER-ONLY. Delivery Engine — customer delivery-OTP verification boundary.
//
// FUTURE-INTEGRATION SEAM. No customer OTP delivery system exists in the
// codebase yet (decision M3). This module is the SINGLE place a future OTP
// integration plugs in: it will generate an OTP, deliver it to the customer,
// and store the expected value as `job.deliveryOtp`. Generation and sending are
// deliberately NOT implemented here.
//
// Until that integration exists, verification FAILS CLOSED: with no stored
// expected OTP there is nothing to verify against, so final delivery cannot be
// confirmed. This enforces "final delivery requires customer OTP" without
// inventing an OTP delivery mechanism.
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

/**
 * True only when the job carries a stored expected OTP (set by a future
 * integration) and the provided value matches it. Absent expected OTP => false.
 */
export function verifyDeliveryOtp(
  job: DeliveryJob,
  providedOtp: unknown
): boolean {
  const expected = typeof job.deliveryOtp === "string" ? job.deliveryOtp : "";
  const provided = typeof providedOtp === "string" ? providedOtp : "";
  return expected.length > 0 && provided.length > 0 && expected === provided;
}
