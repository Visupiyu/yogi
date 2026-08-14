"use client";

import QRCode from "react-qr-code";
import Barcode from "react-barcode";

interface ShippingLabelProps {
  order: any;
}

export default function ShippingLabel({ order }: ShippingLabelProps) {
  if (!order) return null;

  const date = order.createdAt?.toDate
    ? order.createdAt.toDate().toLocaleDateString()
    : new Date().toLocaleDateString();

  return (
    <div
      id="shipping-label"
      style={{
        width: "120mm",
        height: "150mm",
        padding: "4mm",
        boxSizing: "border-box",
        fontSize: "9px",
        lineHeight: 1.25,
        color: "#000",
      }}
      className="mx-auto bg-white border border-black flex flex-col"
    >
      {/* HEADER */}
      <div className="text-center border-b border-black pb-1 mb-1">
        <h1 className="font-bold" style={{ fontSize: "18px", lineHeight: 1 }}>
          YOMICO
        </h1>
        <p className="font-semibold tracking-widest" style={{ fontSize: "9px" }}>
          SHIPPING LABEL
        </p>
      </div>

      {/* ORDER + DATE */}
      <div className="grid grid-cols-2 gap-2 mb-1">
        <div>
          <p className="font-bold">Order ID</p>
          <p className="break-all">{order.id}</p>
        </div>
        <div className="text-right">
          <p className="font-bold">Date</p>
          <p>{date}</p>
        </div>
      </div>

      {/* SHIP FROM */}
      <div className="border border-black p-1 mb-1">
        <h2 className="font-bold uppercase" style={{ fontSize: "8px" }}>
          Ship From
        </h2>
        <p className="font-bold">{order.vendorName || "YOMICO Seller"}</p>
        <p>{order.vendorPhone || "-"}</p>
        <div className="whitespace-pre-wrap">{order.vendorAddress || "-"}</div>
      </div>

      {/* SHIP TO */}
      <div className="border border-black p-1 mb-1">
        <h2 className="font-bold uppercase" style={{ fontSize: "8px" }}>
          Ship To
        </h2>
        <p className="font-bold" style={{ fontSize: "12px" }}>
          {order.customerName}
        </p>
        <p>{order.phone}</p>
        <p className="break-all">{order.userEmail}</p>
        <div className="whitespace-pre-wrap">{order.address}</div>
      </div>

      {/* COURIER */}
      <div className="grid grid-cols-2 gap-2 border border-black p-1 mb-1">
        <div>
          <p className="font-bold">Courier</p>
          <p>{order.courierPartner || order.courierName || "-"}</p>
        </div>
        <div className="text-right">
          <p className="font-bold">Tracking No.</p>
          <p className="font-mono font-bold tracking-wider">
            {order.trackingNumber || "-"}
          </p>
        </div>
      </div>

      {/* PAYMENT */}
      <div className="border border-black p-1 mb-1">
        <div className="flex justify-between">
          <span>Payment Method</span>
          <strong>{order.paymentMethod || "Pay on Delivery (UPI Only)"}</strong>
        </div>
        <div className="flex justify-between">
          <span>Payment Status</span>
          <strong>{order.paymentStatus || "Pending"}</strong>
        </div>
        <div className="flex justify-between">
          <span>Total Items</span>
          <strong>{order.items?.length || 0}</strong>
        </div>
      </div>

      {/* CONTENTS */}
      <div className="mb-1 flex-1 overflow-hidden">
        <h2 className="font-bold mb-0.5" style={{ fontSize: "9px" }}>
          Package Contents
        </h2>
        <table className="w-full border border-black border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black px-1 text-left">Product</th>
              <th className="border border-black px-1 w-10 text-center">Qty</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((item: any, index: number) => (
              <tr key={index}>
                <td className="border border-black px-1">{item.name}</td>
                <td className="border border-black px-1 text-center">
                  {item.qty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* QR + BARCODE */}
      <div className="grid grid-cols-2 gap-2 items-center border-t border-black pt-1">
        <div className="flex flex-col items-center">
          <QRCode value={order.trackingNumber || order.id} size={54} />
        </div>
        <div className="flex flex-col items-center overflow-hidden">
          <Barcode
            value={order.trackingNumber || order.id}
            width={1}
            height={30}
            fontSize={9}
            margin={0}
            displayValue={true}
          />
        </div>
      </div>

      {/* FOOTER */}
      <div className="text-center border-t border-black pt-0.5 mt-1">
        <p className="font-bold">Handle With Care</p>
        <p className="text-gray-600" style={{ fontSize: "8px" }}>
          Thank you for selling with YOMICO
        </p>
      </div>
    </div>
  );
}
