"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import {collection,   getDocs,   addDoc,   query,   where,   serverTimestamp,} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

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

    // Authoritative Available Balance from the server — the SAME payable
    // /api/request-withdrawal enforces. It must include active RETURN
    // deductions, which sum over the `returns` collection that
    // firestore.rules make unreadable to a seller, so it cannot be computed
    // in the browser (that omission was exactly why the displayed balance
    // used to run higher than what a withdrawal was allowed). /api/seller/payable
    // recomputes it with the Admin SDK via lib/vendorPayable — the one shared
    // calc the withdrawal + settlement routes use — and returns only this
    // seller's own figure. Identity comes from the verified token, never a
    // vendorId sent from here.
    let available = 0;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (idToken) {
        const res = await fetch("/api/seller/payable", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (res.ok && typeof data?.available === "number") {
          available = data.available;
        }
      }
    } catch (balanceError) {
      console.log(balanceError);
    }

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

// Available balance = the server-authoritative payable fetched above. It
// already nets off admin payouts, every paid/pending/approved withdrawal
// AND active return deductions, so a seller can never be shown (or request)
// more than what the withdrawal API will actually allow.
setWalletBalance(available);

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