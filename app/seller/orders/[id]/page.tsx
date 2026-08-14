"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import {doc,getDoc,updateDoc,addDoc,collection,serverTimestamp,increment} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import ShippingLabel from "@/components/ShippingLabel";
import Invoice from "@/components/invoice/Invoice";
import { computeVendorShare } from "@/lib/vendorEarnings";

import { useRef } from "react";

// Mirrors isLegalOrderStatusTransition in firestore.rules — used here
// only to keep the dropdown from offering a move the rule would reject.
const NEXT_STATUSES: Record<string, string[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Packed", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Out For Delivery"],
  "Out For Delivery": ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

export default function SellerOrderDetailsPage(){

  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [loading,setLoading] = useState(true);
  const [order,setOrder] = useState<any>(null);
  const [status,setStatus] =useState("Pending");
  const [trackingNumber,setTrackingNumber] =useState("");
  const [saving, setSaving] =useState(false);
  const [courierPartner,setCourierPartner] =useState("");
  const [dispatchDate,setDispatchDate] =useState("");
  const [expectedDelivery,setExpectedDelivery] =useState("");
  const [sellerNotes,setSellerNotes] = useState("");
  const [vendorUid,setVendorUid] = useState("");
  const invoiceRef = useRef<HTMLDivElement>(null);
const shippingLabelRef = useRef<HTMLDivElement>(null);
   
  useEffect(()=>{

    const unsubscribe = onAuthStateChanged(auth, (user) => {

      if (!user) {
        router.push("/vendor-login");
        return;
      }

      setVendorUid(user.uid);
      loadOrder(user.uid);

    });

    return () => unsubscribe();

  },[router]);

  const loadOrder = async(vendorUid: string)=>{
    try{
      const snap = await getDoc(
        doc(
          db,
          "orders",
          id
        )

      );

      if(snap.exists()){

        const data:any={

          ...snap.data(),

          id:snap.id,

        };

        if (
          data.vendorIds &&
          !data.vendorIds.includes(vendorUid)
        ) {

          toast.error("This order does not belong to your account.");
          router.push("/seller/orders");
          return;

        }

        setOrder(data);

        setStatus(
          data.status || "Pending"
        );

        setTrackingNumber(
          data.trackingNumber || ""
        );

        setCourierPartner(
          data.courierPartner || ""
        );

        setDispatchDate(
          data.dispatchDate || ""
        );

        setExpectedDelivery(
          data.expectedDelivery || ""
        );

        setSellerNotes(
          data.sellerNotes || ""
        );

      }

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };
  

  const saveOrder = async()=>{
    if (

  status === order.status &&

  trackingNumber === order.trackingNumber &&

  courierPartner === order.courierPartner &&

  dispatchDate === order.dispatchDate &&

  expectedDelivery === order.expectedDelivery &&

  sellerNotes === order.sellerNotes

){

  toast.info("No changes found.");

  return;

}

    try{ setSaving(true);

      const payload: any = {

          status,

          trackingNumber,

          courierPartner,

          dispatchDate,

          expectedDelivery,

          sellerNotes,

          updatedAt:
            serverTimestamp()

      };

      // Legacy cash-COD orders collect payment on delivery — mark it paid
      // in the same write, matching what the Firestore rule allows a
      // seller to do. Pay on Delivery (UPI Only) orders are deliberately
      // excluded: those can only move to Paid via the assigned delivery
      // partner's own payment-confirmation write (with a UPI transaction
      // reference), never automatically just because status is Delivered.
      if (
        status === "Delivered" &&
        order.paymentMethod !== "ONLINE" &&
        order.paymentMethod !== "PAY_ON_DELIVERY_UPI" &&
        order.paymentStatus !== "Paid"
      ) {
        payload.paymentStatus = "Paid";
      }

      await updateDoc(

        doc(
          db,
          "orders",
          id
        ),

        payload

      );

      if (status === "Cancelled" && order.status !== "Cancelled") {
        // Restore what checkout decremented — best-effort per item so
        // one deleted product doesn't block the rest.
        for (const item of order.items || []) {
          try {
            await updateDoc(doc(db, "products", item.id), {
              stock: increment(item.qty || 0),
              sales: increment(-(item.qty || 0)),
            });
          } catch (stockError) {
            console.error("Failed to restore stock for", item.id, stockError);
          }
        }
      }

      await addDoc(

        collection(
          db,
          "notifications"
        ),

       {

  title:
    "Order Status Updated",

  message:
    `Your order ${id.slice(0,8)} is now ${status}`,

  userId:
    order.userId,

  userEmail:
    order.userEmail,

  role:
    "customer",

  type:
    "shipping",

  read:false,

  createdAt:
    serverTimestamp(),

}
      );

    toast.success(
  "Order updated successfully."
); 
}

 catch(error){

  console.error(error);

  toast.error(
    "Failed to update order."
  );

}
finally{ setSaving(false);} };
  if(loading){

    return(

      <div className="
        p-10
        text-center
      ">

        Loading...

      </div>

    );

  }

  if(!order){

    return(

      <div className="
        p-10
        text-center
      ">

        Order Not Found

      </div>

    );

  }

  // order.finalTotal/commission/sellerEarning are whole-order figures
  // computed once at checkout — in a multi-vendor order they'd show this
  // seller the full order's total/commission/earnings instead of just
  // their own share. Derive that from this seller's own line items.
  const vendorOrderItems = (order.items || []).filter(
    (item: any) => item.vendorId === vendorUid
  );
  const vendorShare = computeVendorShare(order, vendorUid);
  const vendorOrderSubtotal = vendorShare?.vendorRawSubtotal || 0;
  const vendorOrderCommission = vendorShare?.vendorCommission || 0;
  const vendorOrderEarning = vendorShare?.vendorEarning || 0;

  // The hidden invoice embed below must only show this seller's own
  // items/total, same as app/seller/invoice/[id]/page.tsx already does —
  // the full `order` object holds every vendor's items and one combined
  // whole-order total.
  const sellerInvoiceOrder = {
    ...order,
    items: vendorOrderItems,
    finalTotal: vendorOrderSubtotal,
    commission: vendorOrderCommission,
    sellerEarning: vendorOrderEarning,
    shippingCharge: 0,
    discount: 0,
  };

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-green-600
          to-blue-600
          text-white
          rounded-3xl
          p-8
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">

            Seller Order Details

          </h1>

          <p className="mt-2">

            Order ID :
            {" "}
            {order.id}

          </p>

        </div>
                <div className="
          grid
          lg:grid-cols-3
          gap-8
        ">

          {/* LEFT */}

          <div className="
            lg:col-span-2
            space-y-8
          ">

            {/* Customer */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-5
              ">

                Customer Information

              </h2>

              <div className="
                grid
                md:grid-cols-2
                gap-4
              ">

                <p>

                  <strong>Name :</strong>

                  {" "}

                  {order.customerName}

                </p>

                <p>

                  <strong>Phone :</strong>

                  {" "}

                  {order.phone}

                </p>

                <p>

                  <strong>Email :</strong>

                  {" "}

                  {order.userEmail}

                </p>

                <p>

                  <strong>Payment :</strong>

                  {" "}

                  {order.paymentMethod}

                </p>
                <p>

  <strong>Payment Status :</strong>

  {" "}

  <span
    className={
      order.paymentStatus === "Paid"

      ? "text-green-600"

      : "text-red-600"
    }
  >

    {order.paymentStatus}

  </span>

</p>

              </div>

              <div className="
                mt-6
              ">

                <strong>

                  Shipping Address

                </strong>

                <div className="
                  mt-2
                  bg-gray-100
                  rounded-xl
                  p-4
                ">

                  {order.address}

                </div>

              </div>

            </div>

            {/* Products */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-6
              ">

                Ordered Products

              </h2>

              <div className="
                space-y-5
              ">

                {order.items?.map(

                  (item:any,index:number)=>(

                    <div

                      key={index}

                      className="
                        flex
                        gap-5
                        items-center
                        border-b
                        pb-5
                      "

                    >

                      <img

                        src={
                          item.image
                        }

                        alt=""

                        className="
                          w-24
                          h-24
                          rounded-xl
                          object-cover
                        "

                      />

                      <div className="
                        flex-1
                      ">

                        <h3 className="
                          font-bold
                          text-lg
                        ">

                          {item.name}

                        </h3>

                        <p>

                          Qty :

                          {" "}

                          {item.qty}

                        </p>

                        <p>

                          Price :

                          ₹{item.price}

                        </p>

                      </div>

                      <div className="
                        text-right
                        font-bold
                      ">

                        ₹

                        {item.price * item.qty}

                      </div>

                    </div>

                  )

                )}

              </div>

            </div>

            <div className="
  mt-6
  flex
  flex-wrap
  gap-2
">

  {[

    "Packed",

    "Shipped",

    "Out For Delivery",

    "Delivered"

  ].map((step)=>(

    <span

      key={step}

      className={`

        px-4

        py-2

        rounded-full

        text-sm

        ${

          [

            "Packed",

            "Shipped",

            "Out For Delivery",

            "Delivered"

          ].indexOf(step)

          <=

          [

            "Pending",

            "Confirmed",

            "Packed",

            "Shipped",

            "Out For Delivery",

            "Delivered"

          ].indexOf(status)

          ?

          "bg-green-600 text-white"

          :

          "bg-gray-200"

        }

      `}

    >

      {step}

    </span>

  ))}

</div>

            {/* Timeline */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-6
              ">

                Order Progress

              </h2>

              <div className="
                flex
                flex-wrap
                gap-3
              ">

                {[

                  "Pending",

                  "Confirmed",

                  "Packed",

                  "Shipped",

                  "Out For Delivery",

                  "Delivered"

                ].map((step,index)=>(

                  <div

                    key={index}

                    className={`

                      px-4

                      py-2

                      rounded-full

                      text-sm

                      font-semibold

                      ${

                        [

                          "Pending",

                          "Confirmed",

                          "Packed",

                          "Shipped",

                          "Out For Delivery",

                          "Delivered"

                        ].indexOf(step)

                        <=

                        [

                          "Pending",

                          "Confirmed",

                          "Packed",

                          "Shipped",

                          "Out For Delivery",

                          "Delivered"

                        ].indexOf(status)

                        ?

                        "bg-green-600 text-white"

                        :

                        "bg-gray-200"

                      }

                    `}

                  >

                    {step}

                  </div>

                ))}

              </div>
             </div>

            </div>
                      {/* RIGHT */}

          <div className="
            space-y-8
          ">

            {/* Order Summary */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-6
              ">

                Order Summary

              </h2>

              <div className="
                space-y-4
              ">

                <div className="
                  flex
                  justify-between
                ">

                  <span>

                    Subtotal

                  </span>

                  <span>

                    ₹{order.total || 0}

                  </span>

                </div>

                <div className="
                  flex
                  justify-between
                ">

                  <span>

                    Shipping

                  </span>

                  <span>

                    ₹{order.shippingCharge || 0}

                  </span>

                </div>

                <div className="
                  flex
                  justify-between
                ">

                  <span>

                    Payment

                  </span>

                  <span>

                    {order.paymentMethod}

                  </span>

                </div>

                <div className="
                  border-t
                  pt-4
                  flex
                  justify-between
                  text-xl
                  font-bold
                ">

                  <span>

                    Total

                  </span>

                  <span>

                    ₹

                    {vendorOrderSubtotal}
                     <p>

<strong>Seller Earnings :</strong>

₹{vendorOrderEarning}

</p>
<p>

<strong>Commission :</strong>

₹{vendorOrderCommission}

</p>

                  </span>

                </div>

              </div>

            </div>

            {/* Order Status */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-5
              ">

                Update Status

              </h2>

              <select

                value={status}

                onChange={(e)=>

                  setStatus(

                    e.target.value

                  )

                }

                disabled={(NEXT_STATUSES[order.status] || []).length === 0}

                className="
                  w-full
                  border
                  rounded-xl
                  p-3
                  disabled:bg-gray-100
                  disabled:cursor-not-allowed
                "

              >

                <option value={order.status}>

                  {order.status}

                </option>

                {(NEXT_STATUSES[order.status] || []).map((next) => (

                  <option key={next} value={next}>

                    {next}

                  </option>

                ))}

              </select>

            </div>

            {/* Courier */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-6
              ">

                Courier Details

              </h2>

              <div className="
                space-y-4
              ">

                <input

                  value={courierPartner}

                  onChange={(e)=>

                    setCourierPartner(

                      e.target.value

                    )

                  }

                  placeholder="Courier Partner"

                  className="
                    w-full
                    border
                    rounded-xl
                    p-3
                  "

                />

                <input

                  value={trackingNumber}

                  onChange={(e)=>

                    setTrackingNumber(

                      e.target.value

                    )

                  }

                  placeholder="Tracking Number"

                  className="
                    w-full
                    border
                    rounded-xl
                    p-3
                  "

                />
                {trackingNumber && (

  <button

    type="button"

    onClick={() => {

      navigator.clipboard.writeText(
        trackingNumber
      );

      toast.success("Tracking number copied.");

    }}

    className="
      mt-2
      text-blue-600
      text-sm
      hover:underline
    "

  >

    📋 Copy Tracking Number

  </button>

)}

                <div>

                  <label className="
                    font-semibold
                  ">

                    Dispatch Date

                  </label>

                  <input

                    type="date"

                    value={dispatchDate}

                    onChange={(e)=>

                      setDispatchDate(

                        e.target.value

                      )

                    }

                    className="
                      w-full
                      border
                      rounded-xl
                      p-3
                      mt-2
                    "

                  />

                </div>

                <div>

                  <label className="
                    font-semibold
                  ">

                    Expected Delivery

                  </label>

                  <input

                    type="date"

                    value={expectedDelivery}

                    onChange={(e)=>

                      setExpectedDelivery(

                        e.target.value

                      )

                    }

                    className="
                      w-full
                      border
                      rounded-xl
                      p-3
                      mt-2
                    "

                  />

                </div>

              </div>

            </div>
            <div className="
  bg-blue-50
  rounded-3xl
  p-6
  border
  border-blue-200
">

  <h2 className="
    text-xl
    font-bold
    mb-4
  ">

    Shipping Status

  </h2>

  <p>

    <strong>Courier:</strong>

    {" "}

    {courierPartner || "-"}

  </p>

  <p>

    <strong>Tracking:</strong>

    {" "}

    {trackingNumber || "-"}

  </p>

  <p>

    <strong>Dispatch:</strong>

    {" "}

    {dispatchDate || "-"}

  </p>

  <p>

    <strong>Expected Delivery:</strong>

    {" "}

    {expectedDelivery || "-"}

  </p>

</div>

            {/* Seller Notes */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-5
              ">

                Seller Notes

              </h2>

              <textarea

                rows={6}

                value={sellerNotes}

                onChange={(e)=>

                  setSellerNotes(

                    e.target.value

                  )

                }

                placeholder="Internal notes..."

                className="
                  w-full
                  border
                  rounded-xl
                  p-4
                "

              />

              <button

  onClick={saveOrder}

  disabled={saving}

  className="
    bg-green-600
    text-white
    px-6
    py-3
    rounded-xl

    disabled:opacity-50
    disabled:cursor-not-allowed
  "

>

  {saving ? "Saving..." : "Save Changes"}

</button>

            </div>

          </div>

        </div>
                {/* Quick Actions */}

        <div className="
          mt-8
          bg-white
          rounded-3xl
          shadow
          p-6
        ">

          <h2 className="
            text-2xl
            font-bold
            mb-6
          ">

            Quick Actions

          </h2>

          <div className="
            grid
            md:grid-cols-2
            gap-4
          ">

            <button
  onClick={() =>
    window.open(
      `/seller/invoice/${order.id}`,
      "_blank"
    )
  }
  className="
    bg-blue-600
    text-white
    py-3
    rounded-xl
    font-semibold
  "
>
  🖨 Print Invoice
</button>
            <button

 onClick={() => {

  const printWindow = window.open("", "_blank");

  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>Shipping Label</title>
      </head>
      <body>
        ${shippingLabelRef.current?.innerHTML}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();

}}

  className="
    bg-indigo-600
    text-white
    py-3
    rounded-xl
    font-semibold
  "

>

  📦 Print Shipping Label

</button>

            
            <Link

              href={`/seller/chat`}

              className="
                bg-green-600
                text-white
                py-3
                rounded-xl
                font-semibold
                text-center
              "

            >

              💬 Chat Customer

            </Link>

            <a

              href={`tel:${order.phone}`}

              className="
                bg-orange-500
                text-white
                py-3
                rounded-xl
                font-semibold
                text-center
              "

            >

              📞 Call Customer

            </a>

            <a

              href={`mailto:${order.userEmail}`}

              className="
                bg-red-600
                text-white
                py-3
                rounded-xl
                font-semibold
                text-center
              "

            >

              ✉ Email Customer

            </a>

            <Link

              href="/seller/orders"

              className="
                bg-gray-700
                text-white
                py-3
                rounded-xl
                font-semibold
                text-center
              "

            >

              ← Back To Orders

            </Link>

          </div>

        </div>

      </div>
      <div className="hidden">

  <div ref={invoiceRef}>
    <Invoice
  order={sellerInvoiceOrder}
  type="seller"
/>
  </div>

  <div ref={shippingLabelRef}>
    <ShippingLabel order={order} />
  </div>

</div>

    </div>

  );

}