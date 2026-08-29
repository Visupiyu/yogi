"use client";

import { useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import {

 doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,

} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase";
import { deliveryProofPath } from "@/lib/storagePaths";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";
import {

  ref,

  uploadBytes,

  getDownloadURL,

} from "firebase/storage";

import { toast } from "sonner";
import QRCode from "react-qr-code";
import {
  PAY_ON_DELIVERY_UPI,
  getUpiSettings,
  buildUpiPaymentUri,
  type UpiSettings,
} from "@/lib/upiPayment";
import { confirmDeliveryPayment } from "@/lib/deliveryPayment";

// Mirrors isLegalOrderStatusTransition in firestore.rules.
const NEXT_STATUSES: Record<string, string[]> = {
  Shipped: ["Out For Delivery"],
  "Out For Delivery": ["Delivered", "Delivery Failed"],
  "Delivery Failed": ["Out For Delivery"],
  Delivered: [],
};

export default function DeliveryDetailsPage() {

  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [order, setOrder] =
    useState<any>(null);

  const [status, setStatus] =
    useState("Shipped");

  const [deliveryNotes, setDeliveryNotes] =
    useState("");
    const [otp, setOtp] =
  useState("");

const [enteredOtp, setEnteredOtp] =
  useState("");
  const [proofImage, setProofImage] =
  useState<File | null>(null);

const [proofPreview, setProofPreview] =
  useState("");

  const [partnerName, setPartnerName] = useState("");
  const [upiSettings, setUpiSettings] = useState<UpiSettings>({
    upiEnabled: false,
    upiVpa: "",
    upiPayeeName: "YOMICO",
  });
  const [transactionId, setTransactionId] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);


  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, (user) => {

      const sessionRaw = localStorage.getItem("deliveryPartner");

      if (!user || !sessionRaw) {
        router.replace("/delivery-login");
        return;
      }

      const session = JSON.parse(sessionRaw);

      if (session.uid !== user.uid) {
        router.replace("/delivery-login");
        return;
      }

      setPartnerName(session.name || "");
      loadOrder(session.partnerId);
      getUpiSettings().then(setUpiSettings);

    });

    return () => unsubscribe();

  }, [id, router]);

  const loadOrder = async (sessionPartnerId: string) => {

    try {

      const snap = await getDoc(

        doc(db, "orders", id)

      );

      if (snap.exists()) {

       const data: any = {

          id: snap.id,

          ...snap.data(),

        };

        if (data.deliveryPartnerId !== sessionPartnerId) {
          toast.error("This delivery isn't assigned to you.");
          router.replace("/delivery");
          return;
        }

        setOrder(data);

        setStatus(

          data.status || "Shipped"

        );

        setDeliveryNotes(

          data.deliveryNotes || ""

        );
        setOtp(
  data.deliveryOtp || ""
);

      }

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  };

  const saveDelivery = async () => {

    try {

      setSaving(true);

      if (

  status === "Delivered"

  &&

  otp

  &&

  enteredOtp !== otp

){

  toast.error(

    "Invalid delivery OTP."

  );

  setSaving(false);

  return;

}
let proofImageUrl = order.proofImage || "";

if (proofImage) {

  // Uid-scoped so one delivery partner cannot overwrite another's proof
  // photo. The order id is deliberately kept — it was the only link back
  // from a proof image to its delivery, and the old flat path carried it.
  const uploaderUid = auth.currentUser?.uid;

  if (!uploaderUid) {
    alert("Your session expired. Please sign in again.");
    setSaving(false);
    return;
  }

  const storageRef = ref(

    storage,

    deliveryProofPath(uploaderUid, id, proofImage)

  );

  await uploadBytes(

    storageRef,

    proofImage

  );

  proofImageUrl =

    await getDownloadURL(

      storageRef

    );

}

      await updateDoc(

        doc(db, "orders", id),

        {

          status,

          deliveryNotes,
          proofImage:
            proofImageUrl,

          deliveredAt:

            status === "Delivered"

              ? serverTimestamp()

              : null,

          updatedAt:

            serverTimestamp(),

        }

      );
      await addDoc(

  collection(
    db,
    "notifications"
  ),

  {

    title:
      "Delivery Update",

    message:
      `Your order ${id.slice(0,8)} is now ${fulfilmentStageLabel(status)}.`,

    userId:
      order.userId,

    userEmail:
      order.userEmail,

    role:
      "customer",

    type:
      "delivery",

    read:
      false,

    createdAt:
      serverTimestamp(),

  }

);

      toast.success(

        "Delivery updated successfully."

      );

    } catch (error) {

      console.error(error);

      toast.error(

        "Failed to update delivery."

      );

    } finally {

      setSaving(false);

    }

  };

  const submitPayment = async () => {
    if (!transactionId.trim()) {
      toast.error("Enter the UPI transaction/reference ID.");
      return;
    }

    setSubmittingPayment(true);
    try {
      await confirmDeliveryPayment(id, transactionId.trim(), partnerName);
      setOrder({ ...order, paymentStatus: "AwaitingVerification" });
      toast.success("Payment submitted — awaiting admin verification.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit payment. Please try again.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (loading) {

    return (

      <div className="p-10 text-center">

        Loading...

      </div>

    );

  }

  if (!order) {

    return (

      <div className="p-10 text-center">

        Order not found.

      </div>

    );

  }

  return (

    <div className="min-h-screen bg-gray-100 p-6">

      <div className="max-w-5xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">

          <h1 className="text-4xl font-bold">

            🚚 Delivery Details

          </h1>

          <p>

            Order #

            {order.id.slice(0,8)}

          </p>

        </div>

        <div className="bg-white rounded-3xl shadow p-8 space-y-6">

          <div>

            <h2 className="text-2xl font-bold">

              Customer

            </h2>

            <p>{order.customerName}</p>

            <p>{order.phone}</p>

            <p>{order.address}</p>

          </div>

          <div>

            <h2 className="text-xl font-bold mb-3">

              Tracking

            </h2>

            <p>

              Courier:

              {" "}

              {order.courierPartner || "-"}

            </p>

            <p>

              Tracking No:

              {" "}

              {order.trackingNumber || "-"}

            </p>

          </div>

          <div className="mb-8">

  <h2 className="text-xl font-bold mb-5">

    Delivery Progress

  </h2>

  <div className="flex justify-between items-center gap-2">

    {[
      "Packed",
      "Shipped",
      "Out For Delivery",
      "Delivered"
    ].map((step, index) => (

      <div
        key={index}
        className="flex-1 text-center"
      >

        <div
          className={`
            w-10
            h-10
            mx-auto
            rounded-full
            flex
            items-center
            justify-center
            text-white
            font-bold

            ${
              [
                "Packed",
                "Shipped",
                "Out For Delivery",
                "Delivered"
              ].indexOf(status)

              >=

              index

              ? "bg-green-600"

              : "bg-gray-300"
            }
          `}
        >

          {index + 1}

        </div>

        <p className="text-xs mt-2">

          {step}

        </p>

      </div>

    ))}

  </div>

</div>

          {/* Pay on Delivery (UPI Only) — only for this exact payment
              method, and only while there's still something to collect.
              Never shown for ONLINE or historical COD orders. Amount is
              never editable here: it's the server-verified paymentAmount
              set at order creation. */}
          {order.paymentMethod === PAY_ON_DELIVERY_UPI &&
            ["Out For Delivery", "Delivered"].includes(order.status) && (
              <div className="mb-8 border-2 border-green-200 rounded-2xl p-6 bg-green-50">
                <h2 className="text-xl font-bold mb-1">
                  YOMICO Pay on Delivery
                </h2>
                <p className="text-2xl font-bold text-green-700 mb-4">
                  Amount to Pay: ₹{(order.paymentAmount || 0).toLocaleString("en-IN")}
                </p>

                {order.paymentStatus === "Paid" ? (
                  <div className="bg-white rounded-xl p-4 font-semibold text-green-700">
                    ✅ Payment Verified
                  </div>
                ) : order.paymentStatus === "AwaitingVerification" ? (
                  <div className="bg-white rounded-xl p-4">
                    <p className="font-semibold text-orange-600">
                      Payment Submitted — Awaiting Verification
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Reference: {order.paymentTransactionId}
                    </p>
                  </div>
                ) : (
                  <>
                    {upiSettings.upiEnabled && upiSettings.upiVpa ? (
                      <div className="bg-white rounded-xl p-4 flex flex-col items-center mb-4">
                        <QRCode
                          value={buildUpiPaymentUri({
                            vpa: upiSettings.upiVpa,
                            payeeName: upiSettings.upiPayeeName,
                            amount: order.paymentAmount || 0,
                            orderId: order.id,
                          })}
                          size={180}
                        />
                        <p className="text-xs text-gray-500 mt-3">
                          Customer scans with any UPI app
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-orange-600 mb-4">
                        YOMICO's UPI ID isn't configured yet — ask the
                        customer to pay ₹{(order.paymentAmount || 0).toLocaleString("en-IN")} to
                        YOMICO's UPI account, then enter the reference
                        below.
                      </p>
                    )}

                    <label className="font-semibold block mb-1">
                      Transaction / Reference ID
                    </label>
                    <input
                      type="text"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="Enter the UPI transaction ID"
                      className="w-full border rounded-xl p-3 mb-3"
                    />
                    <button
                      onClick={submitPayment}
                      disabled={submittingPayment}
                      className="bg-green-600 text-white px-6 py-3 rounded-xl disabled:opacity-50 w-full font-semibold"
                    >
                      {submittingPayment ? "Submitting..." : "Submit Payment Reference"}
                    </button>
                  </>
                )}
              </div>
            )}

          <div>

            <label className="font-semibold">

              Delivery Status

            </label>
            {status === "Delivered" && (

<div className="mt-6">

  <label className="font-semibold">

    Customer OTP

  </label>

  <input

    type="text"

    value={enteredOtp}

    onChange={(e)=>

      setEnteredOtp(
        e.target.value
      )

    }

    placeholder="Enter customer OTP"

    className="
      w-full
      mt-2
      border
      rounded-xl
      p-3
    "

  />

</div>

)}

            <select

              value={status}

              onChange={(e)=>

                setStatus(

                  e.target.value

                )

              }

              disabled={!(NEXT_STATUSES[order.status]?.length > 0)}

              className="w-full mt-2 border rounded-xl p-3 disabled:bg-gray-100"

            >

              <option value={order.status}>
                {fulfilmentStageLabel(order.status)} (current)
              </option>

              {(NEXT_STATUSES[order.status] || []).map((next) => (
                <option key={next} value={next}>
                  {fulfilmentStageLabel(next)}
                </option>
              ))}

            </select>

          </div>

          <div>

            <label className="font-semibold">

              Delivery Notes

            </label>

            <textarea

              value={deliveryNotes}

              onChange={(e)=>

                setDeliveryNotes(

                  e.target.value

                )

              }

              rows={4}

              className="w-full mt-2 border rounded-xl p-3"

            />

          </div>

          <div className="flex gap-4">

            <a

              href={`tel:${order.phone}`}

              className="bg-blue-600 text-white px-6 py-3 rounded-xl"

            >

              📞 Call Customer

            </a>

            <a

              target="_blank"

              rel="noopener noreferrer"

              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`}

              className="bg-green-600 text-white px-6 py-3 rounded-xl"

            >

              📍 Open Maps

            </a>

          </div>
          <div className="mt-6">

  <label className="font-semibold">

    Proof of Delivery

  </label>

  <input

    type="file"

    accept="image/*"

    onChange={(e)=>{

      const file = e.target.files?.[0];

      if(file){

        setProofImage(file);

        setProofPreview(

          URL.createObjectURL(file)

        );

      }

    }}

    className="mt-2"

  />

  {proofPreview && (

    <img

      src={proofPreview}

      alt="Proof"

      className="
        mt-4
        h-48
        rounded-xl
        object-cover
      "

    />

  )}

</div>

          <button

            onClick={saveDelivery}

            disabled={saving}

            className="bg-indigo-600 text-white px-8 py-3 rounded-xl disabled:opacity-50"

          >

            {

              saving

              ?

              "Saving..."

              :

              "Save Delivery"

            }

          </button>

        </div>

      </div>

    </div>

  );

}