"use client";

import {useEffect, useState, } from "react";

import { collection, addDoc, Timestamp, doc, updateDoc, increment, getDocs, query, where,} from "firebase/firestore";

import { db } from "@/lib/firebase";
import {useRouter } from "next/navigation";

export default function CheckoutPage() {

  const router =
  useRouter();

  const [items, setItems] =
  useState<any[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [name, setName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [address, setAddress] =
    useState("");

    const [coupon,setCoupon] =
  useState("");
  const [shipping,setShipping] =
  useState(0);

const [paymentMethod,
setPaymentMethod] =
  useState("COD");

const [deliveryDate,
setDeliveryDate] =
  useState("");

const [discount,setDiscount] =
  useState(0);

const [couponApplied,
setCouponApplied] =
  useState(false);

  const [rewardDiscount,
setRewardDiscount] =
useState(0);

const [redeemPoints,
setRedeemPoints] =
useState(false);

const [availablePoints, 
setAvailablePoints] =
useState(0);

  useEffect(() => {

    const storedItems =
      JSON.parse(
        localStorage.getItem(
          "checkoutItems"
        ) || "[]"
      );

    setItems(storedItems);

  }, []);
  const applyCoupon =
async ()=>{
  if(couponApplied){alert( "Coupon already applied" );
    return;
  }

  try{ const q = query( collection( db, "coupons" ),

      where("code", "==", coupon .trim()
.toUpperCase() ) );
    const snapshot =
      await getDocs(q);
      if(snapshot.empty){
      alert(
        "Invalid coupon"
      );

      const userData =
  JSON.parse(

    localStorage.getItem(
      "user"
    ) || "{}"

  );

setAvailablePoints(

  Number(
    userData.rewardPoints || 0
  )

);
      return;
    }
    const couponData =
      snapshot.docs[0].data();
  
      if(
      !couponData.active
    ){
      alert(
        "Coupon inactive"
      );
      return;
    }
    const discountAmount =
      total *
      (
        couponData.discount
        / 100
      );

    setDiscount(
      discountAmount
    );

    setCouponApplied(
      true
    );

    alert(
      `${couponData.discount}% discount applied`
    );

  }catch(error){

    console.log(error);

    alert(
      "Coupon check failed"
    );

  }

};
  const total =
  items.reduce(

    (sum,item)=>
      sum +
      item.price *
      item.qty,
    0
  );

const rewardValue =
  redeemPoints
    ? Math.min(
        availablePoints,
        Math.floor(
          total
        )
      )

    : 0;

const finalAmount =
  total - discount;
const grandTotal =
  Math.max(
    0,
    finalAmount +
    shipping -
    rewardValue
  );

const commission =
  Math.round(
    grandTotal * 0.10
  );

const sellerEarning =
  grandTotal - commission;

  const loadRazorpayScript =
()=>{

  return new Promise((resolve)=>{

    const script =
      document.createElement(
        "script"
      );

    script.src =

      "https://checkout.razorpay.com/v1/checkout.js";

    script.onload =
      ()=>{

        resolve(true);

      };

    script.onerror =
      ()=>{

        resolve(false);

      };

    document.body.appendChild(
      script
    );

  });

};

  useEffect(()=>{
    const user =
  localStorage.getItem(
    "user"
  );

  const userData =
  JSON.parse(

    localStorage.getItem(
      "user"
    ) || "{}"

  );

const availablePoints =

  Number(
    userData.rewardPoints || 0
  );

if(!user){

  alert(
    "Please login first"
  );

  router.push("/login");

  return;

}

  /* FREE DELIVERY */

  if(finalAmount > 2000){

    setShipping(0);

  }else{

    setShipping(99);

  }

  /* DELIVERY DATE */

  const today =
    new Date();

  today.setDate(
    today.getDate() + 5
  );

  setDeliveryDate(

    today.toDateString()

  );

},[finalAmount]);

const placeCODOrder =
async()=>{

  if(
  !name ||
  !phone ||
  !address
){

  alert(
    "Fill all checkout fields"
  );

  return;

}

if(
  !/^\d{10}$/.test(phone)
){

  alert(
    "Enter valid 10 digit phone number"
  );

  return;

}

if(items.length === 0){

  alert(
    "Cart is empty"
  );

  return;

}

localStorage.removeItem(
  "checkoutItems"
);

  setLoading(true);

  const rewardPoints =Math.floor(grandTotal / 100 );

  try{const orderRef = await addDoc(collection( db, "orders" ),

    { customerName:name, phone:phone, address:address, userEmail:

  JSON.parse(localStorage.getItem( "user" ) || "{}" ).email,

        items:items,

        total:total,

        status:"Pending",

        paymentMethod:"COD",

        paymentStatus: "Pending",

        shippingCharge: shipping,

        finalTotal: grandTotal,

        deliveryDate: deliveryDate,

          commission: commission,

          sellerEarning: sellerEarning,

          couponCode: couponApplied ? coupon : "",
          discount: discount,

             rewardPoints: rewardPoints,
  
        createdAt: Timestamp.now(), } );

    await addDoc(
  collection(
    db,
    "notifications"
  ),
  {
    title:
      "New Order Received",

    message:
      `${name} placed an order`,

    type:
      "order",

    read:false,

    createdAt:
      new Date(),
  }
);

    for (const item of items) {

  await updateDoc(
    doc(
      db,
      "products",
      item.id
    ),
    {
      sales: increment(
        item.qty
      ),
    }
  );

}

await fetch(
  "/api/send-order-email",
  {
    method:"POST",

    headers:{
      "Content-Type":
      "application/json",
    },

    body:JSON.stringify({

      customerName:name,

      customerEmail:
        JSON.parse(
          localStorage.getItem(
            "user"
          ) || "{}"
        ).email,

      orderId:
        orderRef.id,

      total:
        grandTotal,

    }),
  }
);
const user = JSON.parse(

  localStorage.getItem(
    "user"
  ) || "{}"

);

const currentPoints =

  Number(
    user.rewardPoints || 0
  );

const updatedPoints =

  currentPoints +

  rewardPoints -

  rewardValue;

user.rewardPoints =

  Math.max(
    0,
    updatedPoints
  );

localStorage.setItem(

  "user",

  JSON.stringify(user)

);


    localStorage.removeItem(
      "checkoutItems"
    );

    await fetch(
  "/api/send-order-email",
  {
    method:"POST",

    headers:{
      "Content-Type":
      "application/json",
    },

    body:JSON.stringify({

      customerName:name,

      customerEmail:
        JSON.parse(
          localStorage.getItem(
            "user"
          ) || "{}"
        ).email,

      orderId:
        orderRef.id,

      total:
        grandTotal,

    }),
  }
);
await addDoc(

  collection(
    db,
    "rewardTransactions"
  ),

  {

    userEmail:

      JSON.parse(

        localStorage.getItem(
          "user"
        ) || "{}"

      ).email,

    type:"Earned",

    points:
      rewardPoints,

    orderTotal:
      grandTotal,

    createdAt:
      Timestamp.now(),

  }

);
if(rewardValue > 0){

  await addDoc(

    collection(
      db,
      "rewardTransactions"
    ),

    {

      userEmail:

        JSON.parse(

          localStorage.getItem(
            "user"
          ) || "{}"

        ).email,

      type:"Redeemed",

      points:
        rewardValue,

      createdAt:
        Timestamp.now(),

    }

  );

}
    const notifications =
  JSON.parse(
    localStorage.getItem(
      "notifications"
    ) || "[]"
  );

notifications.unshift({

  id: Date.now(),

  title: "🛒 New Order",

  message:
    `Order placed successfully by ${name}`,

  read: false,

});

localStorage.setItem(

  "notifications",

  JSON.stringify(
    notifications
  )

);

window.dispatchEvent(

  new Event(
    "notificationUpdated"
  )

);

    localStorage.removeItem(
      "cart"
    );

    alert(
      "Order Placed Successfully"
    );

    window.location.href =
      "/orders";

  }catch(error){

    console.log(error);

    alert(
      "Order Failed"
    );

  }

  setLoading(false);

};

const payNow =
async()=>{
  if(
  !name ||
  !phone ||
  !address
){

  alert(
    "Fill all checkout fields"
  );

  return;

}

if(items.length === 0){

  alert(
    "Cart is empty"
  );

  return;

}

  const res:any =

    await loadRazorpayScript();

  if(!res){

    alert(
      "Razorpay failed"
    );

    return;

  }

  const response =
    await fetch(

      "/api/create-order",

      {

        method:"POST",

        headers:{

          "Content-Type":
            "application/json"

        },

        body:JSON.stringify({

          amount:grandTotal

        })

      }

    );

  const data =
    await response.json();

  const options = {

    key:
  process.env
.NEXT_PUBLIC_RAZORPAY_KEY,
    amount:
      data.amount,

    currency:
      data.currency,

    name:
      "Yogi Mart",

    description:
      "Marketplace Payment",

    order_id:
      data.id,

    handler:
      async function(
        response:any
      ){

        const verifyResponse =
          await fetch(

            "/api/verify-payments",

            {

              method:"POST",

              headers:{

                "Content-Type":
                  "application/json"

              },

               body:JSON.stringify({

                razorpay_order_id:
                  response
                  .razorpay_order_id,

                razorpay_payment_id:
                  response
                  .razorpay_payment_id,

                razorpay_signature:
                  response
                  .razorpay_signature

              })

            }

          );
          

        const verifyData =

          await verifyResponse.json();

        if(
          verifyData.success
        ){

          setLoading(true);

          try{

            await addDoc(

              collection(
                db,
                "orders"
              ),

              {

                customerName:name,

                phone:phone,

                address:address,

                items:items,

                total:total,

                status:"Pending",

                paymentMethod:
                  paymentMethod,

                  paymentStatus:
                  "Paid",

                shippingCharge:
                  shipping,

                finalTotal:
                  grandTotal,

                deliveryDate:
                  deliveryDate,

                  commission:
  commission,

sellerEarning:
  sellerEarning,

                  couponCode:
  couponApplied
    ? coupon
    : "",

discount:
  discount,

                  userEmail:

               JSON.parse(

             localStorage.getItem(
              "user"
                ) || "{}"

                 ).email,

                createdAt:
                  Timestamp.now(),

              }

            );

            await addDoc(

  collection(
    db,
    "notifications"
  ),

  {

    title:
      "New Order Received",

    message:
      `${name} placed an order worth ₹${grandTotal}`,

    type:
      "order",

    read:false,

    createdAt:
      Timestamp.now(),

  }

);

            for (const item of items) {

  await updateDoc(
    doc(
      db,
      "products",
      item.id
    ),
    {
      sales: increment(
        item.qty
      ),
    }
  );

}

            localStorage.removeItem(
              "checkoutItems"
            );

            localStorage.removeItem(
              "cart"
            );

            window.location.href =
              "/payment-success";

          }catch(error){

            console.log(error);

            alert(
              "Order save failed"
            );

          }

          setLoading(false);

        }else{

          alert(
            "Payment Verification Failed"
          );

        }

      },

          modal:{

      ondismiss:function(){

        alert(
          "Payment Cancelled"
        );

      }

    },

    theme:{

      color:"#16a34a"

    }

  };

  const paymentObject =

    new (window as any)
    .Razorpay(options);

  paymentObject.open();

};

return (

    <section className="
      py-10
      px-4
    ">

      <div className="
        max-w-6xl
        mx-auto
        grid
        grid-cols-1
        lg:grid-cols-3
        gap-10
      ">

        {/* LEFT */}

        <div className="
          lg:col-span-2
          bg-white
          rounded-3xl
          shadow-md
          p-8
        ">

          <h1 className="
            text-3xl
            font-bold
            mb-8
          ">
            Checkout
          </h1>

          <div className="
            space-y-5
          ">

            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value
                )
              }
              className="
                w-full
                border
                rounded-xl
                px-5
                py-4
                outline-none
              "
            />

            <input
              type="text"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) =>
                setPhone(
                  e.target.value
                )
              }
              className="
                w-full
                border
                rounded-xl
                px-5
                py-4
                outline-none
              "
            />

            <textarea
              placeholder="
                Delivery Address
              "
              value={address}
              onChange={(e) =>
                setAddress(
                  e.target.value
                )
              }
              rows={5}
              className="
                w-full
                border
                rounded-xl
                px-5
                py-4
                outline-none
              "
            />
        

          </div>

        </div>

        {/* RIGHT */}

        <div className="
          bg-white
          rounded-3xl
          shadow-md
          p-8
          h-fit
        ">

          <h2 className="
            text-2xl
            font-bold
            mb-6
          ">
            Order Summary
          </h2>

          <div className="
            space-y-5
          ">

            {items.map((item: any, index) => (

  <div
    key={index}
    className="
      flex
      items-center
      gap-4
    "
  >

    <img
      src={
        item?.image ||
        "/no-image.png"
      }
      alt=""
      className="
        w-20
        h-20
        object-cover
        rounded-xl
      "
    />

    <div className="flex-1">

      <h3 className="
        font-semibold
      ">
        {item?.name}
      </h3>

      <p className="
        text-gray-500
        text-sm
      ">
        Qty:
        {" "}
        {item?.qty}
      </p>

    </div>

    <p className="
      font-bold
    ">
      ₹
      {(item?.price || 0) *
       (item?.qty || 0)}
    </p>

  </div>

))}
          </div>

          <div className="
  border-t
  mt-8
  pt-6
">

  {/* TOTAL */}

  <div className="
    flex
    justify-between
    text-xl
    font-bold
  ">

    <span>
      Total
    </span>

    <span>
      ₹{total}
    </span>

  </div>

  {/* DISCOUNT */}

  <div className="
    flex
    justify-between
    mt-4
    text-green-600
    font-semibold
  ">

    <span>
      Discount
    </span>

    <span>
      - ₹{discount}
    </span>

  </div>

  <div className="
  flex
  justify-between
  mt-4
  text-blue-600
  font-semibold
">

  <span>
    Shipping
  </span>

  <span>

    {shipping === 0
      ? "FREE"
      : `₹${shipping}`}

  </span>

</div>

<div className="
  flex
  justify-between
  mt-4
  text-gray-600
  text-sm
">

  <span>
    Estimated Delivery
  </span>

  <span>
    {deliveryDate}
  </span>

</div>

<div className="
  mt-4
">

  <label className="
    flex
    items-center
    gap-2
  ">

    <input
      type="checkbox"

      checked={
        redeemPoints
      }

      onChange={()=>

        setRedeemPoints(
          !redeemPoints
        )

      }
    />

    <span>

      Redeem Reward Points

      (
      {availablePoints}
      Available
      )

    </span>

  </label>

</div>

{redeemPoints && (

  <div className="
    flex
    justify-between
    mt-4
    text-purple-600
    font-semibold
  ">

    <span>
      Reward Discount
    </span>

    <span>
      - ₹{rewardValue}
    </span>

  </div>

)}

  {/* FINAL TOTAL */}

  <div className="
    flex
    justify-between
    mt-5
    text-2xl
    font-bold
  ">

    <span>
      Final Total
    </span>

    <span>
      ₹{grandTotal}
      
    </span>

  </div>

  {/* BUTTON */}

  <div className="
  mt-8
">

  <h3 className="
    text-xl
    font-bold
    mb-4
  ">
    Payment Method
  </h3>

  <div className="
    space-y-3
  ">

    <label className="
      flex
      items-center
      gap-3
    ">

      <input
        type="radio"
        value="COD"
        checked={
          paymentMethod === "COD"
        }
        onChange={(e)=>
          setPaymentMethod(
            e.target.value
          )
        }
      />

      Cash On Delivery

    </label>

    <label className="
      flex
      items-center
      gap-3
    ">

      <input
        type="radio"
        value="ONLINE"
        checked={
          paymentMethod ===
          "ONLINE"
        }
        onChange={(e)=>
          setPaymentMethod(
            e.target.value
          )
        }
      />

      Online Payment

    </label>

  </div>

</div>

  <button
   onClick={()=>{

  if(
    paymentMethod ===
    "ONLINE"
  ){

    payNow();

  }else{

    placeCODOrder();

  }

}}
    disabled={loading}
    className="
      w-full
      mt-6
      bg-green-600
      hover:bg-green-700
      text-white
      py-4
      rounded-2xl
      font-bold
      text-lg
      transition
    "
  >

    {loading
      ? "Processing..."
      : "Place Order"}

  </button>

    <div className="
  bg-white
  rounded-3xl
  shadow-md
  p-6
  mt-8
">

  <h2 className="
    text-2xl
    font-bold
    mb-5
  ">
    Apply Coupon
  </h2>

  <div className="
    flex
    gap-4
  ">

    <input
      type="text"
      placeholder="Enter coupon code"
      value={coupon}
      onChange={(e)=>
        setCoupon(
          e.target.value
        )
      }
      className="
        flex-1
        border
        rounded-2xl
        px-4
        py-3
      "
    />

    <button
      onClick={applyCoupon}
      className="
        bg-green-600
        hover:bg-green-700
        text-white
        px-6
        rounded-2xl
        font-semibold
      "
    >
      Apply
    </button>

  </div>

    {/* SAMPLE */}

  <div className="
    mt-5
    text-sm
    text-gray-500
    leading-7
  ">

    Try:
    {" "}

    <span className="
      font-bold
    ">
      YOGI10
    </span>

    {" "}or{" "}

    <span className="
      font-bold
    ">
      SAVE500
    </span>

  </div>

</div>

</div>

</div>

</div>

</section>

);

}