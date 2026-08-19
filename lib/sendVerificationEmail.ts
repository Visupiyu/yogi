import type { User } from "firebase/auth";

// Client-side entry point for the branded YOMICO verification email.
//
// Replaces firebase/auth's sendEmailVerification() everywhere in the app: the
// Firebase console reports "Email template updates are currently unavailable"
// for this project, so its default mail can't be branded or sent from the
// verified yomico.in domain.
//
// Deliberately sends NO body. The server takes the recipient from the verified
// ID token, reads the display name from Firestore and owns the continue URL,
// so nothing here can influence who gets mailed or what the mail says. The
// Firebase Admin SDK and RESEND_API_KEY stay server-side only — this file
// touches neither.
export async function sendVerificationEmail(user: User): Promise<void> {
  const idToken = await user.getIdToken();

  const response = await fetch("/api/auth/send-verification-email", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string; debug?: Record<string, unknown> }
      | null;

    // The server attaches `debug` only outside production, so the real
    // Identity Toolkit status/code/message is visible while developing
    // without ever leaking it to real customers.
    if (data?.debug) {
      console.error("Verification email failed:", data.debug);
    }

    throw new Error(data?.error || "Couldn't send the verification email.");
  }
}
