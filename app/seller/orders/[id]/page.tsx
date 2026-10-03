"use client";

import { lineReturnDays } from "@/lib/returnEligibility";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import {doc,getDoc,updateDoc,collection,serverTimestamp,getDocs,query,where} from "firebase/firestore";
import type { SellerOrderDetail } from "@/lib/sellerOrders/sellerOrderView";
import { timestampLike } from "@/lib/sellerOrders/sellerOrdersClient";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  itemRequestEligibility,
  itemReturnWindowEndsAt,
  statusLabel,
  statusTone,
  type ItemRequestType,
} from "@/lib/itemRequests";
import ShippingLabel from "@/components/ShippingLabel";
import Invoice from "@/components/invoice/Invoice";
import SellerOrderStatement from "@/components/settlement/SellerOrderStatement";
import {
  ITEM_FULFILMENT_STAGES,
  deriveFulfilmentStage,
  fulfilmentActionLabel,
  fulfilmentStageLabel,
  isStageComplete,
  sellerNextItemStage,
  type ItemFulfilmentMap,
} from "@/lib/itemFulfilment";
import { requestItemAdvance } from "@/lib/sellerFulfilmentClient";
import { sellerOrderRecordId } from "@/lib/sellerOrderRecord";
import { formatIst } from "@/lib/orderTiming";
import { useVendor } from "@/hooks/useVendor";
import { mapsSearchUrl } from "@/lib/maps";

import { useRef } from "react";

// Mirrors isLegalOrderStatusTransition in firestore.rules — used here
// only to keep the dropdown from offering a move the rule would reject.
// Order-level statuses a seller may still cancel from. Forward fulfilment is
// per item now and lives in sellerOrders, so this is all that remains of the
// parent-status control.

type FulfilmentLine = {
  itemKey?: string;
  name?: string;
  qty?: number;
  size?: string;
  color?: string;
  /** Return window snapshotted on the line at order creation. */
  returnDays?: number;
};

type SellerFulfilmentRecord = {
  id: string;
  items?: FulfilmentLine[];
  itemFulfilment?: ItemFulfilmentMap;
  deliveryDeadlineAt?: unknown;
  // Actual final PACKED parcel weight (kg) for THIS seller's shipment — product
  // + box + packaging. Seller-entered; NOT derived from product catalog weight.
  shipmentWeightKg?: number;
};


// Badge colours for a customer's return/replace request status, by tone.
const REQUEST_TONE_BADGE: Record<string, string> = {
  ok: "bg-green-100 text-green-700 border-green-300",
  bad: "bg-red-100 text-red-700 border-red-300",
  running: "bg-blue-100 text-blue-700 border-blue-300",
  idle: "bg-amber-100 text-amber-700 border-amber-300",
};

// A customer's return/replace request as the SELLER sees it (read-only).
type SellerVisibleRequest = {
  type: ItemRequestType;
  status: string;
  createdAt?: unknown;
};

// The seller-scoped order view (app/api/seller/orders/[orderId]) mapped onto
// the field names this page and the shared ShippingLabel / Invoice components
// already read. It holds ONLY the view's allow-listed fields — this seller's
// own lines and figures, and the customer's name, phone and delivery address —
// never the shared order document.
function toPageOrder(view: SellerOrderDetail, vendorUid: string) {
  return {
    id: view.orderId,
    orderNumber: view.orderNumber,
    invoiceNumber: view.invoiceNumber,
    createdAt: timestampLike(view.createdAt),
    status: view.orderStatus,
    isSoleSeller: view.isSoleSeller,
    cancellable: view.cancellable,
    customerName: view.customer.name,
    phone: view.customer.phone,
    address: view.customer.address,
    paymentMethod: view.payment.method,
    paymentStatus: view.payment.status,
    shipmentNumber: view.shipmentNumber,
    deliveryCompanyName: view.delivery.companyName,
    deliveryPartnerName: view.delivery.partnerName,
    trackingNumber: view.shipping.trackingNumber,
    courierPartner: view.shipping.courierPartner,
    dispatchDate: view.shipping.dispatchDate,
    expectedDelivery: view.shipping.expectedDelivery,
    sellerNotes: view.shipping.sellerNotes,
    sellerShare: view.sellerShare,
    // This seller's own lines, tagged with their own uid so the existing
    // per-seller filters on this page keep working.
    items: view.items.map((item) => ({ ...item, id: item.productId, vendorId: vendorUid })),
  };
}

export default function SellerOrderDetailsPage(){

  // Seller's own pickup/business address (vendors/{docId}.street/unit/city/
  // state/zipCode) — the same profile fields set in app/vendor-register and
  // editable in app/seller/settings. Read-only here; never geocoded.
  const { vendor } = useVendor();

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
  // Actual packed parcel weight (kg) for this seller's shipment. Kept as a
  // string for controlled decimal input; persisted to the sellerOrders record.
  const [shipmentWeightKg,setShipmentWeightKg] = useState("");
  const [savingWeight,setSavingWeight] = useState(false);

  // The seller's own fulfilment record for this order. This — not
  // order.status — is what drives every stage shown below.
  const [sellerRecord,setSellerRecord] =
    useState<SellerFulfilmentRecord | null>(null);
  const [busyItemKey,setBusyItemKey] = useState<string | null>(null);

  // Customer return/replace requests on THIS seller's items, keyed by itemKey.
  // Read-only visibility; scoped to this vendor by firestore.rules.
  const [itemRequests, setItemRequests] = useState<
    Record<string, SellerVisibleRequest>
  >({});
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

  // Sync the weight input with the loaded seller fulfilment record (the
  // authoritative store for this seller's packed shipment weight).
  useEffect(() => {
    const w = sellerRecord?.shipmentWeightKg;
    setShipmentWeightKg(typeof w === "number" && w > 0 ? String(w) : "");
  }, [sellerRecord]);

  const loadOrder = async(vendorUid: string)=>{
    try{
      // The seller-scoped view — never the shared orders/{id} document, which
      // firestore.rules no longer let a seller read. An unknown order, one
      // with none of this seller's items, and a Pending order are all 404.
      const currentUser = auth.currentUser;
      const res = currentUser
        ? await fetch(`/api/seller/orders/${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
          })
        : null;
      const payload = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok || !payload?.order) {
        toast.error(payload?.error || "Order not found.");
        router.push("/seller/orders");
        return;
      }

      {

        const data: any = toPageOrder(payload.order as SellerOrderDetail, vendorUid);

        setOrder(data);

        // Fulfilment lives in the seller's own record, addressed by the
        // deterministic (orderId, vendorId) id. firestore.rules restricts it
        // to this vendor, so there is nothing to filter.
        try {
          const recordSnap = await getDoc(
            doc(db, "sellerOrders", sellerOrderRecordId(id, vendorUid))
          );

          if (recordSnap.exists()) {
            setSellerRecord({ id: recordSnap.id, ...recordSnap.data() });
          }
        } catch (recordError) {
          console.error("Fulfilment record unavailable:", recordError);
        }

        // Customer return/replace requests for this seller's items on this
        // order. Query is a plain equality on vendorId — firestore.rules
        // restricts every itemRequests read to the owning vendor, so another
        // seller's requests can never be loaded — then filtered to this order.
        try {
          const requestSnap = await getDocs(
            query(
              collection(db, "itemRequests"),
              where("vendorId", "==", vendorUid)
            )
          );
          const map: Record<string, SellerVisibleRequest> = {};
          requestSnap.forEach((docSnap) => {
            const r = docSnap.data() as {
              orderId?: string;
              itemKey?: string;
              type?: ItemRequestType;
              status?: string;
              createdAt?: unknown;
            };
            if (r.orderId === id && r.itemKey) {
              map[r.itemKey] = {
                type: r.type === "replace" ? "replace" : "return",
                status: r.status || "REQUESTED",
                createdAt: r.createdAt,
              };
            }
          });
          setItemRequests(map);
        } catch (requestError) {
          console.error("Return/replace requests unavailable:", requestError);
        }

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
      toast.error("Couldn't load this page's data. Please check your connection and refresh to try again.");
    }finally{

      setLoading(false);

    }

  };
  

  // Server-side, so the parent order's derived status is recalculated in the
  // same transaction. itemFulfilment is server-only in firestore.rules.
  const advanceItem = async (itemKey: string) => {

    if (!sellerRecord) return;

    const currentStage = String(sellerRecord.itemFulfilment?.[itemKey]?.status);
    if (!sellerNextItemStage(currentStage)) {
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    try {

      setBusyItemKey(itemKey);

      const result = await requestItemAdvance({
        idToken: await user.getIdToken(),
        recordId: sellerRecord.id,
        itemKey,
        fromStatus: currentStage,
      });

      if (!result.ok) {
        toast.error(result.error || "Could not update this product.");
        return;
      }

      setSellerRecord((prev) =>
        prev
          ? {
              ...prev,
              itemFulfilment: {
                ...prev.itemFulfilment,
                [itemKey]: {
                  status: String(result.itemStatus),
                  updatedAt: new Date(),
                },
              },
            }
          : prev
      );

      // Reflect the recalculated parent summary without a refetch.
      if (order && result.parentStatus) {
        setOrder({ ...order, status: result.parentStatus });
      }

      toast.success(
        `Marked ${fulfilmentStageLabel(result.itemStatus)} · order is now ` +
          fulfilmentStageLabel(result.parentStatus)
      );

    } finally {

      setBusyItemKey(null);

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

    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error("Please login first.");
      router.push("/vendor-login");
      return;
    }

    try{ setSaving(true);
      const idToken = await currentUser.getIdToken();

      // Cancellation is server-authoritative — /api/cancel-order does status,
      // stock, reward reversal, coupon release and delivery-job halting in one
      // transaction, and notifies the customer itself.
      if (status === "Cancelled" && order.status !== "Cancelled") {
        const response = await fetch("/api/cancel-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ orderId: id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast.error(data?.error || "Couldn't cancel this order.");
          return;
        }
        toast.success("Order updated successfully.");
        setOrder({ ...order, status, cancellable: false });
        return;
      }

      // Shipping details are saved by the server: on this seller's own
      // record, and — on an order that is entirely theirs and still open —
      // on the order the customer sees. The server also notifies the
      // customer. Sellers never write orders/{id} themselves.
      const response = await fetch(`/api/seller/orders/${encodeURIComponent(id)}/shipping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ trackingNumber, courierPartner, dispatchDate, expectedDelivery, sellerNotes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error || "Failed to update order.");
        return;
      }
      setOrder({ ...order, trackingNumber, courierPartner, dispatchDate, expectedDelivery, sellerNotes });
      toast.success(data?.unchanged ? "No changes found." : "Order updated successfully.");
    }
    catch(error){
      console.error(error);
      toast.error("Failed to update order.");
    }
    finally{ setSaving(false);} };

  // The seller's record-level stage (least-advanced item). Packed parcel weight
  // is editable up to dispatch and frozen once the shipment has left (Shipped /
  // Out For Delivery / Delivered) — using the EXISTING fulfilment stages, not a
  // new lifecycle.
  const sellerStage = deriveFulfilmentStage(sellerRecord?.itemFulfilment || null);
  const weightLocked =
    sellerStage === "Shipped" ||
    sellerStage === "Out For Delivery" ||
    sellerStage === "Delivered";

  // Persist the packed parcel weight to THIS seller's own fulfilment record
  // (sellerOrders/{orderId}_{vendorId}) — never to the parent order, which can
  // hold several vendors' parcels. Validates a positive numeric kg value.
  const saveShipmentWeight = async () => {
    if (!vendorUid || savingWeight) return;
    if (weightLocked) {
      toast.error("Shipment weight is locked once the parcel has been shipped.");
      return;
    }
    const kg = Number(shipmentWeightKg);
    if (!shipmentWeightKg.trim() || !Number.isFinite(kg) || kg <= 0) {
      toast.error("Enter the packed parcel weight in kg (a number greater than 0).");
      return;
    }
    try {
      setSavingWeight(true);
      const recordId = sellerOrderRecordId(id, vendorUid);
      await updateDoc(doc(db, "sellerOrders", recordId), {
        shipmentWeightKg: kg,
        updatedAt: serverTimestamp(),
      });
      setSellerRecord((prev) => (prev ? { ...prev, shipmentWeightKg: kg } : prev));
      toast.success("Shipment weight saved.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save shipment weight.");
    } finally {
      setSavingWeight(false);
    }
  };

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

  // Same plain comma-join the rider-navigation formatter uses
  // (lib/deliveryEngine/taskLocation.ts formatSellerAddress) — no geocoding,
  // no stored coordinates, just whatever address string is on file. null
  // when nothing is on file, so the link below is never rendered for a
  // guessed/blank destination.
  const pickupAddress = [
    vendor?.street,
    vendor?.unit,
    vendor?.city,
    vendor?.state,
    vendor?.zipCode,
  ]
    .filter(Boolean)
    .join(", ") || null;
  const pickupMapsUrl = mapsSearchUrl(pickupAddress);

  // order.finalTotal/commission/sellerEarning are whole-order figures
  // computed once at checkout — in a multi-vendor order they'd show this
  // seller the full order's total/commission/earnings instead of just
  // their own share. Derive that from this seller's own line items.
  const vendorOrderItems = (order.items || []).filter(
    (item: any) => item.vendorId === vendorUid
  );
  // This seller's own item value, computed by the server — the view never
  // carries whole-order figures or other sellers' lines.
  const vendorShare = order.sellerShare
    ? {
        vendorRawSubtotal: order.sellerShare.rawSubtotal,
        vendorCommission: order.sellerShare.commission,
        vendorEarning: order.sellerShare.earning,
      }
    : null;
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
      p-4
      md:p-6
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
          p-5
          md:p-8
          mb-8
        ">

          <h1 className="
            text-3xl
            md:text-4xl
            font-bold
          ">

            Seller Order Details

          </h1>

          <p className="mt-2 break-words">
            Order ID :
            {" "}
            {order.orderNumber || order.id}

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
                grid-cols-1
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
                  break-words
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

                {/* Seller-scoped: render ONLY this authenticated seller's own
                    line items (vendorOrderItems, filtered by vendorUid above),
                    never the full multi-vendor order.items — otherwise a seller
                    would see co-vendors' products on a shared order. */}
                {vendorOrderItems.map(

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
                          shrink-0 rounded-xl
                          object-cover
                        "

                      />

                      <div className="
                        flex-1
                        min-w-0
                      ">

                        <h3 className="
                          font-bold
                          text-lg
                          break-words
                        ">

                          {item.name}

                        </h3>

                        {/* Which variant to pick and pack. The seller order
                            view never showed this at all, so an order for the
                            1.5 L of a product listed in both 1 L and 1.5 L was
                            indistinguishable from the 1 L. Newer orders carry
                            the full attribute map; older ones size/color. */}
                        {item.attributes &&
                        Object.keys(item.attributes).length > 0 ? (
                          <p className="text-sm font-semibold text-gray-800">
                            {Object.entries(item.attributes)
                              .map(([d, v]) => d + ": " + String(v))
                              .join("  •  ")}
                          </p>
                        ) : (
                          (item.color || item.size) && (
                            <p className="text-sm font-semibold text-gray-800">
                              {[
                                item.color ? "Color: " + item.color : "",
                                item.size ? "Size: " + item.size : "",
                              ]
                                .filter(Boolean)
                                .join("  •  ")}
                            </p>
                          )
                        )}

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

            {/* Product Fulfilment — the source of truth.
                Both order-wide progress strips that stood here are gone: with
                per-item fulfilment they were misleading, because three
                products can sit at three different stages. Each row below
                carries its own stage strip and its own button, and advancing
                one never touches another. */}

            <div className="bg-white rounded-3xl shadow p-6 mt-6">

              <h2 className="text-2xl font-bold mb-2">

                Product Fulfilment

              </h2>

              {sellerRecord ? (

                <>

                  <p className="text-gray-600 text-sm mb-5">

                    Each product moves through Confirmed → Accept → Ready for
                    Delivery → Handed Over to Courier → Final Delivery on its
                    own.

                  </p>

                  <div className="space-y-3">

                    {(sellerRecord.items || []).map((line, index) => {

                      const key = line.itemKey || `i${index}`;
                      const stage =
                        sellerRecord.itemFulfilment?.[key]?.status ?? "Confirmed";
                      const next = sellerNextItemStage(String(stage));
                      const busy = busyItemKey === key;

                      return (

                        <div
                          key={key}
                          className="border rounded-2xl p-4"
                        >

                          <div className="flex flex-wrap items-start justify-between gap-3">

                            <div className="min-w-0">

                              <p className="font-semibold">{line.name}</p>

                              <p className="text-sm text-gray-600">

                                Qty {line.qty}
                                {line.size ? ` · ${line.size}` : ""}
                                {line.color ? ` · ${line.color}` : ""}

                              </p>

                            </div>

                            {next ? (

                              <button
                                onClick={() => advanceItem(key)}
                                disabled={busy}
                                className="bg-green-600 hover:bg-green-700 disabled:opacity-60 transition text-white px-4 py-2 rounded-xl text-sm font-semibold"
                              >

                                {busy
                                  ? "Saving..."
                                  : fulfilmentActionLabel(next)}

                              </button>

                            ) : (

                              <span className="text-sm text-gray-400">

                                {stage === "Delivered" ? "Complete" : "With delivery partner"}

                              </span>

                            )}

                          </div>

                          {/* Stage strip for THIS product. Starts at
                              Confirmed — Pending is not a seller stage — and
                              Confirmed stays neutral because the seller has
                              done nothing yet. Packed — shown as "Accept" —
                              is the first green. */}
                          <div className="flex flex-wrap gap-2 mt-3">

                            {ITEM_FULFILMENT_STAGES.map((step) => (

                              <span
                                key={step}
                                className={`px-3 py-1.5 rounded-full text-xs ${
                                  isStageComplete(step, String(stage))
                                    ? "bg-green-600 text-white"
                                    : "bg-gray-200"
                                }`}
                              >

                                {fulfilmentStageLabel(step)}

                              </span>

                            ))}

                          </div>

                          {!!sellerRecord.itemFulfilment?.[key]?.deliveredAt && (

                            <p className="text-xs text-green-700 mt-2">

                              Final Delivery{" "}
                              {formatIst(
                                sellerRecord.itemFulfilment[key].deliveredAt
                              )}

                            </p>

                          )}

                          {/* Customer Return / Replace visibility — READ ONLY.
                              Shown only once THIS item is delivered, so an
                              undelivered line never shows a return window. The
                              seller has no approve/reject controls here;
                              returns are the admin's, replacement fulfilment is
                              handled on the seller Returns page. */}
                          {stage === "Delivered" &&
                            (() => {
                              const req = itemRequests[key];
                              // This line's own window, snapshotted at order creation.
                              const lineDays = lineReturnDays(line);
                              const elig = itemRequestEligibility(
                                { itemFulfilment: sellerRecord.itemFulfilment },
                                key,
                                new Date(),
                                lineDays
                              );
                              const windowEnd = itemReturnWindowEndsAt(
                                { itemFulfilment: sellerRecord.itemFulfilment },
                                key,
                                lineDays
                              );
                              return (
                                <div className="mt-3 border-t pt-3 text-xs space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-gray-500">
                                      {lineDays}-day return / replace window:
                                    </span>
                                    <span
                                      className={
                                        elig.eligible
                                          ? "font-semibold text-green-700"
                                          : "font-semibold text-gray-500"
                                      }
                                    >
                                      {elig.eligible ? "Open" : "Closed"}
                                    </span>
                                    {elig.eligible && windowEnd && (
                                      <span className="text-gray-400">
                                        · closes {formatIst(windowEnd)}
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    {req ? (
                                      <span className="inline-flex flex-wrap items-center gap-2">
                                        <span
                                          className={`inline-block px-2 py-0.5 rounded-full border font-semibold ${
                                            REQUEST_TONE_BADGE[
                                              statusTone(req.status)
                                            ]
                                          }`}
                                        >
                                          {req.type === "replace"
                                            ? "Replace"
                                            : "Return"}
                                          : {statusLabel(req.type, req.status)}
                                        </span>
                                        {req.createdAt ? (
                                          <span className="text-gray-400">
                                            requested {formatIst(req.createdAt)}
                                          </span>
                                        ) : null}
                                      </span>
                                    ) : (
                                      <span className="text-gray-500">
                                        No Return/Replace request
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                        </div>

                      );

                    })}

                  </div>

                  <p className="text-xs text-gray-500 mt-4">

                    Overall (summary only):{" "}
                    {fulfilmentStageLabel(
                      deriveFulfilmentStage(sellerRecord.itemFulfilment)
                    )}
                    {" · Deliver by "}
                    {formatIst(sellerRecord.deliveryDeadlineAt)}

                  </p>

                </>

              ) : (

                <p className="text-gray-500 text-sm">

                  No fulfilment record for this order yet. Records are created
                  when an admin confirms the order.

                </p>

              )}

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

                    ₹{vendorOrderSubtotal}

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

                    —

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
                     <p className="text-sm font-normal text-gray-500">
Your earnings for this order: see the Settlement Statement below.
</p>

                  </span>

                </div>

              </div>

            </div>

            {/* Seller settlement — the authoritative per-order figures */}
            <SellerOrderStatement orderId={id} />

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

                Cancel Order

              </h2>

              <select

                value={status}

                onChange={(e)=>

                  setStatus(

                    e.target.value

                  )

                }

                disabled={!order.cancellable === true}

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

                  {fulfilmentStageLabel(order.status)}

                </option>

                {order.cancellable === true && (

                  <option value="Cancelled">Cancelled</option>

                )}

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

              {/* When YOMICO Admin has assigned a Delivery Company + Person,
                  that assignment (shown above) is authoritative. The inputs
                  below are the seller's own legacy/optional fields, kept
                  functional but clarified so the blank fields aren't misread
                  as required. Only shown when an assignment exists. */}
              {(order.deliveryCompanyName ||
                order.deliveryPartnerName ||
                order.shipmentNumber) && (
                <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm">
                  <p>
                    <strong>Delivery assigned by YOMICO:</strong>{" "}
                    {[order.deliveryCompanyName, order.deliveryPartnerName]
                      .filter(Boolean)
                      .join(" · ") || "Assigned"}
                    {order.shipmentNumber
                      ? ` · Tracking ${order.shipmentNumber}`
                      : ""}
                    .
                  </p>
                  <p className="text-gray-500">
                    The fields below are legacy/optional.
                  </p>
                </div>
              )}

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

                {/* Shipment Weight (kg) — ACTUAL packed parcel weight, stored on
                    this seller's own fulfilment record (sellerOrders). */}
                <div>

                  <label className="font-semibold">
                    Shipment Weight (kg)
                  </label>

                  <div className="mt-2 flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={shipmentWeightKg}
                      disabled={weightLocked || savingWeight}
                      onChange={(e) => setShipmentWeightKg(e.target.value)}
                      placeholder="e.g. 3.20"
                      className="w-full border rounded-xl p-3 disabled:bg-gray-100 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={saveShipmentWeight}
                      disabled={weightLocked || savingWeight}
                      className="shrink-0 rounded-xl bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savingWeight ? "Saving…" : "Save weight"}
                    </button>
                  </div>

                  <p className="mt-1 text-xs text-gray-500">
                    Actual packed parcel weight, including product and packaging.
                    {weightLocked ? " Locked — the shipment has already been shipped." : ""}
                  </p>

                </div>

              </div>

            </div>

            {/* Pickup Location — this seller's own business/pickup address
                (vendors/{docId}), the same one set at registration and
                editable in Settings. Read-only navigation link only: no
                geocoding, no coordinates, no map component. Hidden entirely
                when the address is blank rather than linking to nowhere. */}
            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-4
              ">

                Pickup Location

              </h2>

              {pickupAddress ? (
                <>
                  <p className="text-gray-700">{pickupAddress}</p>

                  <a
                    href={pickupMapsUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-blue-600 font-semibold hover:underline"
                  >
                    Open in Maps ↗
                  </a>
                </>
              ) : (
                <p className="text-gray-500 text-sm">
                  No pickup address on file. Add one in Settings.
                </p>
              )}

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

  {/* Real delivery assignment made by YOMICO Admin (Delivery Company ->
      Delivery Person -> Order). Read straight off the parent order this
      seller is already authorized to load — order-level fields only, so no
      other seller's items/earnings/customer data are exposed. Rendered only
      when present, so legacy orders without these fields are unaffected. The
      seller's own Courier/Tracking fields below are left untouched. */}
  {(order.deliveryCompanyName ||
    order.deliveryPartnerName ||
    order.shipmentNumber) && (
    <div className="mb-4 pb-4 border-b border-blue-200">
      <p className="font-semibold mb-2">YOMICO Delivery Assignment</p>
      {order.deliveryCompanyName && (
        <p>
          <strong>Delivery Company:</strong> {order.deliveryCompanyName}
        </p>
      )}
      {order.deliveryPartnerName && (
        <p>
          <strong>Delivery Person:</strong> {order.deliveryPartnerName}
        </p>
      )}
      {order.shipmentNumber && (
        <p>
          <strong>Tracking Number:</strong> {order.shipmentNumber}
        </p>
      )}
      <p>
        <strong>Status:</strong> {fulfilmentStageLabel(order.status)}
      </p>
    </div>
  )}

  <p>

    <strong>Courier:</strong>

    {" "}

    {/* Prefer the authoritative YOMICO delivery-person assignment; fall back
        to the seller's legacy free-text courier only when unassigned. */}
    {order.deliveryPartnerName || courierPartner || "-"}

  </p>

  <p>

    <strong>Tracking:</strong>

    {" "}

    {/* Authoritative YOMICO tracking number (shipmentNumber) when present;
        legacy free-text tracking otherwise. */}
    {order.shipmentNumber || trackingNumber || "-"}

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
            grid-cols-1
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

  const labelHtml = shippingLabelRef.current?.innerHTML;

  if (!labelHtml) {
    alert("Shipping label isn't ready yet. Please try again.");
    return;
  }

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Please allow pop-ups for this site to print the shipping label.");
    return;
  }

  // Reuse the page's own compiled stylesheets so the label's Tailwind
  // classes (border/flex/grid/etc.) actually render in the new window —
  // a blank window.open("", ...) document has no stylesheet of its own.
  const styleTags = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style')
  )
    .map((el) => el.outerHTML)
    .join("\n");

  printWindow.document.open();

  printWindow.document.write(`<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Shipping Label</title>
        ${styleTags}
        <style>
          body { margin: 0; padding: 16px; }
        </style>
      </head>
      <body>
        ${labelHtml}
      </body>
    </html>
  `);

  printWindow.document.close();

  // Wait for the new window (styles/images/barcode+QR SVGs) to actually
  // finish loading before printing — calling print() immediately after
  // write() can fire before layout/paint completes, and closing right
  // after print() can kill the dialog before the browser has even shown
  // it. Closing is deferred to afterprint, once the user has actually
  // finished interacting with the print dialog (printed or cancelled).
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  printWindow.onafterprint = () => {
    printWindow.close();
  };

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