"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

export default function CartPage() {

 const [cart, setCart] =
  useState<any[]>([]);

const [coupon,setCoupon] =
  useState("");

const [discount,setDiscount] =
  useState(0);
  
  useEffect(() => {
    
    const storedCart =
      JSON.parse(
        localStorage.getItem("cart") || "[]"
      );

      

    setCart(storedCart);

  }, []);

  /* UPDATE QTY */

  const updateQty = (
  index: number,
  type: string
) => {

    const updatedCart = [...cart];

    if(

  updatedCart[index].qty <

  updatedCart[index].stock

){

  updatedCart[index].qty += 1;

}
    if (
      type === "dec" &&
      updatedCart[index].qty > 1
    ) {

      updatedCart[index].qty -= 1;

    }

    setCart(updatedCart);

    localStorage.setItem(
      "cart",
      JSON.stringify(updatedCart)
    );

  };

  /* REMOVE ITEM */

  const removeItem = (index: number) => {

    const updatedCart =
      cart.filter(
        (_: any, i: number) =>
  i !== index
      );

    setCart(updatedCart);

    localStorage.setItem(
      "cart",
      JSON.stringify(updatedCart)
    );

  };

  /* TOTAL */

  const total =
    cart.reduce(

     (
  sum: number,
  item: any
) =>

        sum +
        item.price * item.qty,

      0

    );

    const shipping =

  total > 999

  ?

  0

  :

  99;

  const grandTotal =

  total +
  shipping -
  discount;
  
  const applyCoupon = ()=>{

  if(
    coupon === "YOGI100"
  ){

    setDiscount(100);

    alert(
      "Coupon Applied"
    );

  }else{

    alert(
      "Invalid Coupon"
    );

  }

};

  /* CHECKOUT */

  const proceedCheckout = () => {

    if(cart.length === 0){

  alert(
    "Cart is empty"
  );

  return;

}

    localStorage.setItem(
      "checkoutItems",
      JSON.stringify(cart)
    );

    window.location.href =
      "/checkout";

  };

  return (

    <section className="
      py-10
      px-4
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        <h1 className="
          text-4xl
          font-bold
          mb-10
        ">
          Shopping Cart
        </h1>

        {cart.length === 0 ? (

          <div className="
            bg-white
            rounded-3xl
            shadow-md
            p-10
            text-center
          ">

            <p className="
              text-gray-500
              text-lg
            ">
              Your cart is empty
            </p>

            <Link href="/">

              <button className="
                mt-6
                bg-green-600
                hover:bg-green-700
                text-white
                px-6
                py-3
                rounded-xl
                font-semibold
              ">
                Continue Shopping
              </button>

            </Link>

          </div>

        ) : (

          <div className="
            grid
            grid-cols-1
            lg:grid-cols-3
            gap-10
          ">

            {/* LEFT */}

            <div className="
              lg:col-span-2
              space-y-6
            ">

              {cart.map((item: any, index: number) => (

                <div
                  key={index}
                  className="
                    bg-white
                    rounded-3xl
                    shadow-md
                    p-5
                    flex
                    flex-col
                    md:flex-row
                    gap-5
                    items-center
                  "
                >

                  <img
                    src={
                      item.image ||
                      "/no-image.png"
                    }
                    alt=""
                    className="
                      w-32
                      h-32
                      object-cover
                      rounded-2xl
                    "
                  />

                  <div className="flex-1">

                    <h2 className="
                      text-xl
                      font-bold
                    ">
                      {item.name}
                    </h2>

                    <p className="
                      text-green-600
                      font-bold
                      text-lg
                      mt-2
                    ">
                      ₹{item.price}
                      <p className="
  mt-2
  text-sm
">

  {

    item.stock > 0

    ? `Stock: ${item.stock}`

    : "Out Of Stock"

  }

</p>
                    </p>

                    <div className="
                      flex
                      items-center
                      gap-4
                      mt-4
                    ">

                      <button
                      
                        onClick={() =>
                          updateQty(
                            index,
                            "dec"
                          )
                        }
                        className="
                          w-10
                          h-10
                          rounded-full
                          bg-gray-200
                          text-xl
                        "
                      >
                        -
                      </button>

                      <span className="
                        text-xl
                        font-bold
                      ">
                        {item.qty}
                      </span>

                      
  <button

  disabled={
    item.qty >= item.stock
  }

  onClick={() =>
    updateQty(
      index,
      "inc"
    )
  }

  className={`
    w-10
    h-10
    rounded-full
    text-xl

    ${
      item.qty >= item.stock

      ? "bg-gray-300 cursor-not-allowed"

      : "bg-gray-200"
    }
  `}
>

  +

</button>

                    </div>

                  </div>

                  {/* RIGHT */}

                  <div className="
                    text-right
                  ">

                    <p className="
                      text-2xl
                      font-bold
                    ">
                      ₹
                      {item.price * item.qty}
                    </p>

                    <button
                      onClick={() =>
                        removeItem(index)
                      }
                      className="
                        mt-4
                        text-red-500
                        font-semibold
                      "
                    >
                      Remove
                    </button>

                  </div>

                </div>

              ))}

            </div>

            {/* SUMMARY */}

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
                <p className="
  text-gray-500
  mt-2
">

  Total Items:
  {" "}

  {cart.reduce(

    (
      sum:number,
      item:any
    ) =>

      sum + item.qty,

    0

  )}

</p>
              </h2>

              <div className="
  flex
  gap-3
  mt-5
">

  <input

    type="text"

    placeholder="Coupon Code"

    value={coupon}

    onChange={(e)=>
      setCoupon(
        e.target.value
      )
    }

    className="
      flex-1
      border
      p-3
      rounded-xl
    "
  />

  <button

    onClick={applyCoupon}

    className="
      bg-black
      text-white
      px-5
      rounded-xl
    "
  >
    Apply
  </button>

</div>

              <div className="
  space-y-4
  mt-6
">

  <div className="
    flex
    justify-between
  ">

    <span>Subtotal</span>

    <span>
      ₹{total}
    </span>

  </div>

  <div className="
    flex
    justify-between
  ">

    <span>Shipping</span>

    <span>

      {

        shipping === 0

        ?

        "FREE"

        :

        `₹${shipping}`

      }

    </span>

  </div>

  <div className="
    flex
    justify-between
    text-green-600
  ">

    <span>Discount</span>

    <span>
      -₹{discount}
    </span>

  </div>

  <div className="
    flex
    justify-between
    text-2xl
    font-bold
    border-t
    pt-4
  ">

    <span>Total</span>

    <span>
      ₹{grandTotal}
    </span>

  </div>

</div>

     

              <button
                onClick={proceedCheckout}
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
                Proceed To Checkout
                <button

  onClick={()=>{

    localStorage.removeItem(
      "cart"
    );

    setCart([]);

  }}

  className="
    w-full
    mt-4
    bg-red-500
    hover:bg-red-600
    text-white
    py-4
    rounded-2xl
    font-bold
    text-lg
  "
>

  Clear Cart

</button>
              </button>

            </div>

          </div>

        )}

      </div>

    </section>

  );

}