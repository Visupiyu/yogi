"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Invoice from "@/components/invoice/Invoice";
import LoadErrorState from "@/components/LoadErrorState";
import { customerLoginUrl } from "@/lib/authRedirect";

// Three different reasons there is no invoice to show, each said plainly:
//   notFound — the order does not exist;
//   denied   — it exists but is not this account's (or Firestore refused the
//              read): "unavailable", never a hint about whose it is;
//   error    — the read itself failed (network etc.): temporary, with Retry.
// No raw Firebase error text is ever shown.
type State =
  | { kind: "loading" }
  | { kind: "ready"; order: any }
  | { kind: "notFound" }
  | { kind: "denied" }
  | { kind: "error" };

export default function InvoicePage() {
  const params = useParams();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        alert("Please login first");
        window.location.href = customerLoginUrl();
        return;
      }

      setState({ kind: "loading" });
      try {
        const snap = await getDoc(doc(db, "orders", params.id as string));

        if (!snap.exists()) {
          setState({ kind: "notFound" });
          return;
        }

        const data: any = {
          id: snap.id,
          ...snap.data(),
        };

        // The account's UID owns the order (what the orders list queries and
        // firestore.rules enforce). Comparing userEmail as well wrongly rejected
        // the owner whenever the order's email was empty or differed.
        if (data.userId !== user.uid) {
          setState({ kind: "denied" });
          return;
        }

        setState({ kind: "ready", order: data });
      } catch (error: any) {
        console.error("Invoice load failed:", error);
        setState({ kind: error?.code === "permission-denied" ? "denied" : "error" });
      }
    });

    return () => unsubscribe();
  }, [params.id, reloadKey]);

  if (state.kind === "loading") {
    return <div className="p-10">Loading invoice...</div>;
  }

  if (state.kind === "error") {
    return (
      <div className="mx-auto max-w-md p-6">
        <LoadErrorState
          message="We couldn't load this invoice right now. Please check your connection and try again."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
        <p className="mt-4 text-center">
          <Link href="/orders" className="text-green-700 font-semibold hover:underline">
            ← Back to My Orders
          </Link>
        </p>
      </div>
    );
  }

  if (state.kind !== "ready") {
    return (
      <div className="p-10 text-center text-gray-600">
        <p className="text-lg font-semibold">
          {state.kind === "notFound" ? "Invoice not found." : "This invoice isn't available."}
        </p>
        {state.kind === "denied" && (
          <p className="mt-1 text-sm text-gray-500">
            You can only view invoices for orders placed with your account.
          </p>
        )}
        <Link href="/orders" className="mt-4 inline-block text-green-700 font-semibold hover:underline">
          ← Back to My Orders
        </Link>
      </div>
    );
  }

  return <Invoice order={state.order} type="customer" />;
}
