"use client";

import { useEffect, useState } from "react";

import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  RETURN_WINDOW_DAYS,
  canRequestReturn,
  returnDaysRemaining,
  returnWindowEndsAt,
} from "@/lib/returnEligibility";

export default function ReturnsPage() {

  const router = useRouter();

  const [orderId,setOrderId] =
  useState("");

useEffect(()=>{

  const params =
    new URLSearchParams(
      window.location.search
    );

  setOrderId(
    params.get("orderId") || ""
  );

},[]);

  const [reason,setReason] =
    useState("");

const [comments,setComments] =
  useState("");

  const [loading,setLoading] =
    useState(false);

  // Server error text, shown in the form instead of the old generic
  // "Failed to submit request" alert — every rejection from
  // /api/request-return carries a specific reason worth reading.
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Loaded purely to show the customer what they are about to get and how long
  // they have left. /api/request-return re-reads the order and re-checks all
  // of this server-side; nothing here is trusted.
  const [order, setOrder] = useState<any>(null);
  const [orderLoading, setOrderLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "orders", orderId));
        setOrder(snap.exists() ? snap.data() : null);
      } catch {
        setOrder(null);
      } finally {
        setOrderLoading(false);
      }
    });

    return () => unsub();
  }, [orderId, router]);

  // Derived, never chosen. The form used to ask for a refund method and
  // nothing ever read the answer, which let the customer believe they had
  // picked where their money would go.
  const refundMethodLabel =
    order?.paymentMethod === "ONLINE"
      ? "Original payment method"
      : "UPI / bank transfer, verified by our team";

  const windowEndsAt = order ? returnWindowEndsAt(order) : null;
  const daysLeft = order ? returnDaysRemaining(order) : null;
  const eligible = order ? canRequestReturn(order) : false;

  const submitReturn =
    async()=>{

      setError("");

      if(!reason){

        setError("Please select a reason for the return.");

        return;

      }

      const currentUser = auth.currentUser;

      if (!currentUser) {
        alert("Please login first.");
        router.push("/login");
        return;
      }

      try{

        setLoading(true);

        // Server-authoritative: /api/request-return re-reads the order and
        // verifies ownership, Delivered status, the return window and that no
        // return already exists, then writes the record with the same schema
        // this form used to write directly. The document it produces is
        // indistinguishable downstream, so app/admin/returns,
        // app/admin/refunds, app/profile/refunds and lib/returns.ts' refund
        // state machine are all untouched.
        const idToken = await currentUser.getIdToken();

        const response = await fetch("/api/request-return", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ orderId, reason, comments }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data?.error || "Couldn't submit your return request.");
          return;
        }

        setSubmitted(true);
        setReason("");
        setComments("");
        return;

      }catch(error){

        console.log(error);

        setError("Something went wrong. Please try again.");

      }finally{

        setLoading(false);

      }

    };

  // The admin notification that used to be written here is now written by
  // /api/request-return, alongside the return record itself, so it can also
  // say when a request needs eligibility review.

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-2xl
        mx-auto
        bg-white
        rounded-3xl
        shadow-md
        p-8
      ">

        <h1 className="
          text-3xl
          font-bold
          mb-6
        ">
          Return Request
        </h1>

        {/* Return-window state. The server enforces this independently; this
            is so the customer knows where they stand before typing anything. */}
        {!orderLoading && order && eligible && daysLeft !== null && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
            <p className="font-semibold text-green-800">
              Eligible for return
            </p>
            <p className="text-gray-700 mt-1">
              {daysLeft === 0
                ? "The return window closes today."
                : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
              {windowEndsAt
                ? ` — closes ${windowEndsAt.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}.`
                : "."}
            </p>
          </div>
        )}

        {!orderLoading && order && eligible && daysLeft === null && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-semibold text-amber-800">
              Eligible for return
            </p>
            <p className="text-gray-700 mt-1">
              We don&apos;t have a recorded delivery date for this order, so our
              team will confirm the {RETURN_WINDOW_DAYS}-day window before
              approving.
            </p>
          </div>
        )}

        {!orderLoading && order && !eligible && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
            <p className="font-semibold text-red-700">
              {order.status === "Delivered"
                ? "Return window closed"
                : "Not eligible for return"}
            </p>
            <p className="text-gray-700 mt-1">
              {order.status === "Delivered"
                ? windowEndsAt
                  ? `The ${RETURN_WINDOW_DAYS}-day return window closed on ${windowEndsAt.toLocaleDateString(
                      "en-IN",
                      { day: "numeric", month: "short", year: "numeric" }
                    )}.`
                  : `The ${RETURN_WINDOW_DAYS}-day return window has closed.`
                : "Returns can only be requested for delivered orders."}
            </p>
          </div>
        )}

        {submitted && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
            <p className="font-semibold text-green-800">
              Return request submitted
            </p>
            <p className="text-gray-700 mt-1">
              You can track it under Profile → Refunds.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
            <p className="text-red-700 font-semibold">{error}</p>
          </div>
        )}

        <div className="
          mb-6
        ">

          <label className="
            block
            mb-2
            font-semibold
          ">
            Order ID
          </label>

          <input
            value={orderId}
            readOnly
            className="
              w-full
              border
              p-3
              rounded-xl
              bg-gray-100
            "
          />

        </div>

        <div className="
          mb-6
        ">

          <label className="
            block
            mb-2
            font-semibold
          ">
            Select Reason
          </label>

          <select

            value={reason}

            onChange={(e)=>
              setReason(
                e.target.value
              )
            }
            className="
              w-full
              border
              p-3
              rounded-xl
            "
          >

            <option value="">
              Choose Reason
            </option>

            <option>
              Damaged Product
            </option>

            <option>
              Wrong Item Received
            </option>

            <option>
              Quality Issue
            </option>

            <option>
              Product Not As Expected
            </option>

            <option>
              Other
            </option>

          </select>

        </div>

        <div className="
          mb-6
        ">

          <label className="
            block
            mb-2
            font-semibold
          ">
            Refund Method
          </label>

          {/* Read-only. Derived from how the order was paid for — the customer
              never had a real choice here, and offering one implied otherwise.
              The server derives the same value independently. */}
          <div className="w-full border p-3 rounded-xl bg-gray-100 text-gray-700">
            {refundMethodLabel}
          </div>

        </div>

        <div className="
          mb-6
        ">

          <label className="
            block
            mb-2
            font-semibold
          ">
            Additional Comments
          </label>

          <textarea

            value={comments}

            onChange={(e)=>
              setComments(
                e.target.value
              )
            }

            rows={4}

            placeholder="
            Describe the issue..."

            className="
              w-full
              border
              p-3
              rounded-xl
            "
          />

        </div>

        <button

          onClick={
            submitReturn
          }

          disabled={loading || submitted || (!orderLoading && !eligible)}

          className="
            w-full
            bg-gradient-to-r
            from-green-600
            to-blue-600
            text-white
            py-3
            rounded-xl
            font-semibold
            disabled:opacity-50
          "
        >

          {loading
            ? "Submitting..."
            : submitted
            ? "Request Submitted"
            : "Submit Return Request"}

        </button>

      </div>

    </div>

  );

}
