"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import {collection,   getDocs,   addDoc,   query,   where,   serverTimestamp,} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { computeVendorShare } from "@/lib/vendorEarnings";

export default function SellerWalletPage() {

  const router = useRouter();

  const [walletBalance, setWalletBalance] = useState(0);

  const [pendingAmount, setPendingAmount] = useState(0);

  const [totalWithdrawn, setTotalWithdrawn] = useState(0);

  const [amount, setAmount] = useState("");

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [withdrawals, setWithdrawals] = useState<any[]>([]);

  const [vendorEmail, setVendorEmail] = useState("");

  const [businessName, setBusinessName] = useState("");

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (user) => {

      if (!user) {
        router.push("/vendor-login");
        return;
      }

      setVendorEmail(user.email || "");

      const vendorSnap = await getDocs(
        query(collection(db, "vendors"), where("uid", "==", user.uid))
      );

      if (!vendorSnap.empty) {
        setBusinessName(vendorSnap.docs[0].data().businessName || "");
      }

      loadWallet(user.uid, user.email || "");

    });

    return () => unsubscribe();

  }, [router]);

const loadWallet =
async(vendorUid: string, vendorEmailArg: string)=>{

  try{

    // Live earnings from this seller's orders — vendor.pendingPayout on
    // the vendors doc is never actually written by any admin/order flow,
    // so it can't be trusted as a balance source.
    const ordersSnapshot = await getDocs(

      query(
        collection(db, "orders"),
        where("vendorIds", "array-contains", vendorUid),
        // Sellers must never see a Pending order: it belongs to them only once
        // an admin confirms it. firestore.rules enforces this on the orders
        // read rule, and the rules engine REJECTS this entire query unless it
        // carries a filter proving the constraint - an unfiltered
        // array-contains query returns permission-denied. Load-bearing, not
        // cosmetic. Needs the orders vendorIds+status composite index.
        where("status", "!=", "Pending")
      )

    );

    let totalEarnings = 0;

    ordersSnapshot.forEach((docSnap) => {

      const order:any = docSnap.data();

      // Money becomes withdrawable only once the order is actually
      // fulfilled AND the money has actually arrived. Both conditions are
      // required because the two payment methods reach them in opposite
      // order: a Pay-on-Delivery (UPI Only) order is Delivered before the
      // customer transfers, and only reaches Paid after the delivery
      // partner submits a transaction reference and an admin verifies it
      // against YOMICO's own account; a Razorpay order is Paid at
      // creation and Delivered much later. Checking one alone would pay a
      // vendor for goods not delivered, or for money not received.
      //
      // This also subsumes the previous Cancelled check — a Cancelled
      // order can never satisfy it.
      // An order flagged needsReview was PAID but could not be fulfilled as
      // priced — short stock, a coupon already spent, or a reward balance
      // that moved (see lib/onlineOrder.ts). Its items[] still carry the
      // full requested quantities, so computeVendorShare() would credit the
      // vendor for units that were never in stock. Excluded until an admin
      // resolves the flag; the Delivered + Paid gate alone cannot see it.
      if (
        order.status !== "Delivered" ||
        order.paymentStatus !== "Paid" ||
        order.needsReview === true
      )
        return;

      const share = computeVendorShare(order, vendorUid);
      if (share) {
        totalEarnings += share.vendorEarning;
      }

    });

    const q = query(

      collection(
        db,
        "withdrawals"
      ),

      where(
        "vendorEmail",
        "==",
        vendorEmailArg
      )

    );

    const snapshot =
      await getDocs(q);

    const items:any[] = [];

    snapshot.forEach(
      (docSnap)=>{

        items.push({

          ...docSnap.data(),

          id:docSnap.id,

        });

      }
    );
items.sort(
  (a, b) =>
    (b.createdAt?.seconds || 0) -
    (a.createdAt?.seconds || 0)
);
    setWithdrawals(items);
    const pending =

  items

    .filter(
      (item)=>

        item.status ===
        "Pending" ||
        item.status ===
        "Approved"
    )

    .reduce(

      (sum,item)=>

        sum +
        Number(
          item.amount || 0
        ),

      0

    );

const withdrawnViaRequests =

  items

    .filter(
      (item)=>

        item.status ===
        "Paid"
    )

    .reduce(

      (sum,item)=>

        sum +
        Number(
          item.amount || 0
        ),

      0

    );

// Admin can also settle a seller directly (app/admin/payouts) without
// going through a withdrawal request at all — that ledger is a
// separate collection this page didn't used to check, so money paid
// that way still showed as "available" here and could be requested
// again.
const payoutsSnapshot = await getDocs(
  query(
    collection(db, "vendor_payouts"),
    where("vendorId", "==", vendorUid)
  )
);

let withdrawnViaAdminPayouts = 0;
payoutsSnapshot.forEach((docSnap) => {
  withdrawnViaAdminPayouts += Number(docSnap.data().amount || 0);
});

const withdrawn = withdrawnViaRequests + withdrawnViaAdminPayouts;

setPendingAmount(
  pending
);

setTotalWithdrawn(
  withdrawn
);

// Available balance = earned so far, minus what's already been paid
// out, minus what's already tied up in a pending/approved request —
// so a seller can't request more than what's genuinely left.
setWalletBalance(
  Math.max(
    0,
    totalEarnings - withdrawn - pending
  )
);

  }catch(error){

    console.log(error);

  }finally{


    setLoading(false);

  }

};

const requestWithdrawal =
async()=>{
  try{ setSubmitting(true);

    if(

      Number(amount) <= 0

    ){

      alert(
        "Enter amount"
      );

      return;

    }

    if(

      Number(amount) >

      walletBalance

    ){

      alert(
        "Insufficient balance"
      );

      return;

    }
    // The request goes to the server, which recomputes what is actually
    // payable and refuses anything larger. The balance check above stays as a
    // courtesy so the seller gets told immediately, but it is no longer the
    // control: this used to addDoc() straight into the collection, so a seller
    // writing through the SDK skipped it entirely and could reserve any figure.
    //
    // The idempotency key makes a double-submitted form reserve once.
    const currentUser = auth.currentUser;

    if (!currentUser) {
      alert("Please sign in again.");
      return;
    }

    const idToken = await currentUser.getIdToken();

    const response = await fetch("/api/request-withdrawal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        amount: Number(amount),
        idempotencyKey:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()) + "-" + Math.random(),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result?.error || "Could not submit your withdrawal request.");
      return;
    }

    // notifications requires `role` (and userId for non-admin roles) or
    // the write is rejected by Firestore rules — this was missing both,
    // so it threw here and silently skipped everything below it (the
    // success alert, clearing the form, and reloading the wallet).
    await addDoc(

  collection(
    db,
    "notifications"
  ),

  {

    title:
      "Withdrawal Request",

    message:
      `${businessName}
       requested ₹${amount}`,

    role:
      "admin",

    type:
      "withdrawal",

    read:false,

    createdAt:
      serverTimestamp(),

  }

);

    alert(
      "Withdrawal Request Submitted"
    );

    setAmount("");

    if (auth.currentUser) {
      loadWallet(auth.currentUser.uid, vendorEmail);
    }

 }catch(error){

  console.log(error);

}finally{

  setSubmitting(false);

}

};
  return (
    <div className=" min-h-screen bg-gray-100 p-6 ">

      <div className=" max-w-6xl mx-auto ">

        <div className="
          bg-gradient-to-r
          from-green-600
          to-emerald-600
          text-white
          p-8
          rounded-3xl
          mb-8
        ">
            <div className="
  grid
  md:grid-cols-2
  gap-6
">

  <div className="
    bg-white
    p-6
    rounded-3xl
    shadow
  ">

    <p className="
      text-gray-500
    ">
      Available Balance
    </p>

    <h2 className="
      text-4xl
      font-bold
      text-green-600
      mt-3
    ">
      ₹
      {walletBalance.toLocaleString()}
    </h2>

  </div>
  <div className="
  grid
  md:grid-cols-2
  gap-6
  mt-6
">

  <div className="
    bg-white
    p-6
    rounded-3xl
    shadow
  ">

    <p className="
      text-gray-500
    ">
      Pending Withdrawals
    </p>

    <h2 className="
      text-3xl
      font-bold
      text-orange-600
      mt-2
    ">
      ₹
      {pendingAmount.toLocaleString()}
    </h2>

  </div>

  <div className="
    bg-white
    p-6
    rounded-3xl
    shadow
  ">

    <p className="
      text-gray-500
    ">
      Total Withdrawn
    </p>

    <h2 className="
      text-3xl
      font-bold
      text-blue-600
      mt-2
    ">
      ₹
      {totalWithdrawn.toLocaleString()}
    </h2>

  </div>

</div>

  <div className="
    bg-white
    p-6
    rounded-3xl
    shadow
  ">

    <input

      type="number"

      placeholder="
        Withdrawal Amount
      "

      value={amount}

      onChange={(e)=>

        setAmount(
          e.target.value
        )

      }

      className="
        w-full
        border
        p-4
        rounded-xl
        mb-4
      "

    />

    <button
  onClick={requestWithdrawal}
  disabled={submitting}

      className="
        bg-green-600
        text-white
        px-6
        py-3
        rounded-xl
      "
    >

      Request Withdrawal

    </button>

  </div>

</div>

          <h1 className="
            text-4xl
            font-bold
          ">
            Seller Wallet
          </h1>

          <p>
            Manage withdrawals and earnings
          </p>

        </div>

      </div>
      <div className="
  bg-white
  rounded-3xl
  shadow
  p-6
  mt-8
">

  <h2 className="
    text-2xl
    font-bold
    mb-6
  ">
    Withdrawal History
  </h2>

  {withdrawals.length === 0 ? (

    <p className="
      text-gray-500
    ">
      No withdrawals yet
    </p>

  ) : (

    <div className="
      overflow-x-auto
    ">

      <table className="
        w-full
      ">

        <thead>

          <tr className="
            border-b
          ">

            <th className="
              text-left
              py-3
            ">
              Amount
            </th>

            <th>
              Status
            </th>

          </tr>

        </thead>

        <tbody>

          {withdrawals.map(
            (item)=>(

            <tr
              key={item.id}
              className="
                border-b
              "
            >

              <td className="
                py-3
              ">
                ₹{item.amount}
              </td>

              <td>
                {item.status}
              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  )}

</div>

    </div>

  );

}