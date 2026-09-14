"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { sendVerificationEmail } from "@/lib/sendVerificationEmail";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const signup = async () => {
    if (!name || !email || !phone || !password) {
      alert("Please fill all fields");
      return;
    }

    if (!agreed) {
      alert("Please agree to the Terms of Use and Privacy Policy");
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      alert("Enter a valid 10 digit mobile number");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
      setLoading(true);

      const result = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      const myReferralCode =
        "YOGI" + Math.floor(100000 + Math.random() * 900000);

      try {
        await setDoc(doc(db, "users", result.user.uid), {
          uid: result.user.uid,
          name,
          email: cleanEmail,
          phone,
          role: "customer",
          rewardPoints: 0,
          referralCode: myReferralCode,
          referredBy: referralCode || "",
          totalReferrals: 0,
          createdAt: new Date(),
        });
      } catch (profileError) {
        // The Auth account exists but has no profile behind it — roll it
        // back so the email is signup-able again, instead of leaving a
        // customer who can log in but has no working account.
        console.error("Failed to create user profile:", profileError);
        await result.user.delete().catch((deleteError) =>
          console.error("Failed to roll back orphaned Auth account:", deleteError)
        );
        alert("Signup couldn't be completed. Please try again.");
        return;
      }

      // Branded YOMICO verification email, sent from the server via Resend —
      // Firebase's own sendEmailVerification() is no longer used, so exactly
      // one email goes out. Runs after the profile document exists so the
      // server can greet the customer by name.
      //
      // Best-effort, as before: a customer who never gets/clicks the email
      // still has a working account (verification is a reminder, not a login
      // gate, for this role), so a mail failure must not fail the signup.
      sendVerificationEmail(result.user).catch((err) =>
        console.error("Failed to send verification email:", err)
      );

      // Referral + welcome bonus are credited SERVER-SIDE.
      //
      // rewardPoints is money (the checkout discount currency AND the refund
      // currency), so firestore.rules now lets no client write it. This
      // browser used to add +100 to the referrer and set its own +50
      // directly, which meant any signed-in user could inflate a balance at
      // will. /api/signup-rewards does both with the Admin SDK, reading the
      // referral code off the profile written above, and is idempotent — the
      // amounts (+100 / +50) and the ledger rows are unchanged.
      //
      // Best-effort, exactly like the block it replaces: a failure here must
      // not fail an otherwise-complete signup.
      if (referralCode) {
        try {
          const idToken = await result.user.getIdToken();
          await fetch("/api/signup-rewards", {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
          });
        } catch (error) {
          console.error("Failed to credit signup rewards:", error);
        }
      }

      localStorage.setItem(
        "user",
        JSON.stringify({
          uid: result.user.uid,
          name,
          email: cleanEmail,
          phone,
          role: "customer",
        })
      );

      alert("Signup Successful");
      router.push("/");
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        alert("Email already registered. Please log in.");
      } else if (error.code === "auth/weak-password") {
        alert("Password must be at least 6 characters");
      } else if (error.code === "auth/invalid-email") {
        alert("Please enter a valid email");
      } else {
        alert(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md">
        <h1 className="text-4xl font-bold text-center mb-8">Signup</h1>

        <div className="space-y-5">
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-4 border rounded-xl outline-none"
          />

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 border rounded-xl outline-none"
          />

          <input
            type="tel"
            placeholder="Mobile Number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full p-4 border rounded-xl outline-none"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 border rounded-xl outline-none"
          />

          <input
            type="text"
            placeholder="Referral Code (Optional)"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            className="w-full p-4 border rounded-xl outline-none"
          />
        </div>

        <label className="mt-6 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          <span className="text-sm text-gray-600 leading-6">
            I agree to YOMICO&apos;s{" "}
            <Link
              href="/terms"
              target="_blank"
              className="font-semibold text-blue-600 hover:underline"
            >
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy-policy"
              target="_blank"
              className="font-semibold text-blue-600 hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <button
          onClick={signup}
          disabled={loading}
          className="w-full bg-green-600 disabled:opacity-60 text-white py-4 rounded-xl mt-6 text-lg font-semibold"
        >
          {loading ? "Creating..." : "Signup"}
        </button>

        <p className="text-center mt-6">
          Already have account?
          <span
            onClick={() => router.push("/login")}
            className="text-blue-600 cursor-pointer ml-2 font-semibold"
          >
            Login
          </span>
        </p>
      </div>
    </div>
  );
}
