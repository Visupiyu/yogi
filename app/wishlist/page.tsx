"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

export default function WishlistPage() {

  const [wishlist, setWishlist] =
    useState<any[]>([]);

  /* LOAD WISHLIST */

  useEffect(() => {

    const storedWishlist =
      JSON.parse(
        localStorage.getItem(
          "wishlist"
        ) || "[]"
      );

    setWishlist(storedWishlist);

  }, []);

  /* REMOVE ITEM */

  const removeItem = (
  index:number
)=>{

  const updatedWishlist =
    wishlist.filter(
      (_,i)=>
        i !== index
    );

  setWishlist(
    updatedWishlist
  );

  localStorage.setItem(
    "wishlist",
    JSON.stringify(
      updatedWishlist
    )
  );

  window.dispatchEvent(
    new Event(
      "wishlistUpdated"
    )
  );

};

  /* MOVE TO CART */

  const moveToCart = (
    item: any
  ) => {

    const cart =
      JSON.parse(
        localStorage.getItem(
          "cart"
        ) || "[]"
      );

    const exists =
      cart.findIndex(
        (cartItem: any) =>
          cartItem.id === item.id
      );

    if (exists > -1) {

      if(

  cart[exists].qty <

  item.stock

){

  cart[exists].qty += 1;

}

    } else {

      cart.push({

        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image || "",
        qty: 1,
        vendorId:
  item.vendorId,

stock:
  item.stock,

      });

    }

    localStorage.setItem(
      "cart",
      JSON.stringify(cart)
    );

    window.dispatchEvent(
      new Event("cartUpdated")
    );

    alert("Added to cart");

const updatedWishlist =
  wishlist.filter(
    (wishlistItem) =>
      wishlistItem.id !== item.id
  );

setWishlist(
  updatedWishlist
);

localStorage.setItem(
  "wishlist",
  JSON.stringify(
    updatedWishlist
  )
);

window.dispatchEvent(
  new Event(
    "wishlistUpdated"
  )
);

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

       <div
  className="
    bg-gradient-to-r
    from-green-600
    to-blue-600
    rounded-3xl
    text-white
    p-8
    mb-8
  "
>
  <h1 className="text-4xl font-bold">
    ❤️ My Wishlist
  </h1>

  <p className="mt-2 text-lg opacity-90">
    Your favourite products in one place
  </p>

  <p className="opacity-80">
    Move products to your cart anytime.
  </p>
</div>

<div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">

  <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
    <p className="text-gray-500 text-sm">
      Wishlist Items
    </p>

    <h2 className="text-3xl font-bold mt-2">
      {wishlist.length}
    </h2>
  </div>

  <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
    <p className="text-gray-500 text-sm">
      In Stock
    </p>

    <h2 className="text-3xl font-bold mt-2">
      {
        wishlist.filter(
          i=>i.stock>0
        ).length
      }
    </h2>
  </div>

  <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
    <p className="text-gray-500 text-sm">
      Total Value
    </p>

    <h2 className="text-3xl font-bold mt-2">
      ₹{
        wishlist.reduce(
          (sum,item)=>
          sum+Number(item.price),
          0
        ).toLocaleString("en-IN")
      }
    </h2>
  </div>

  <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
    <p className="text-gray-500 text-sm">
      Free Delivery
    </p>

    <h2 className="text-3xl mt-2">
      🚚
    </h2>
  </div>

</div>
<div className="flex items-center gap-1 mt-2 text-yellow-500">

★★★★★

<span className="text-gray-500 text-xs">

(4.9)

</span>

</div>

        {wishlist.length === 0 ? (

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
             ❤️ Your Wishlist is Empty
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
            <div className="mt-10">

<p className="font-bold mb-4">

Popular Categories

</p>

<div className="flex justify-center gap-3 flex-wrap">

<span className="bg-white shadow rounded-full px-4 py-2">

📱 Mobiles

</span>

<span className="bg-white shadow rounded-full px-4 py-2">

👗 Fashion

</span>

<span className="bg-white shadow rounded-full px-4 py-2">

💻 Electronics

</span>

<span className="bg-white shadow rounded-full px-4 py-2">

🛒 Grocery

</span>

</div>

</div>

          </div>
          
        ) : (

          <div className="
            grid
            grid-cols-1
            sm:grid-cols-2
            lg:grid-cols-3
            xl:grid-cols-4
            gap-6
          ">

            {wishlist.map(
              (
                item: any,
                index: number
              ) => (

              <div
                key={index}
                className="
                  bg-white
                  rounded-3xl
                  shadow-lg
hover:shadow-2xl
transition
duration-300
                  overflow-hidden
                "
              >

                <Link href={`/product/${item.id}`}>

  <img
    src={
      item.image ||
      "/no-image.png"
    }
    alt={item.name}
   className="
w-full
h-64
object-cover
cursor-pointer
hover:scale-105
transition
duration-500
"
  />

</Link>

                <div className="p-5">

                  <Link href={`/product/${item.id}`}>

  <h2 className="
    text-lg
    font-bold
    line-clamp-2
    min-h-[56px]
    hover:text-green-600
    cursor-pointer
  ">
    {item.name}
  </h2>

</Link>

                  <p className="
                    text-green-600
                    font-bold
                    text-2xl
                    mt-3
                  ">
                    ₹{item.price}
                  </p>

                  {item.stock > 0 ? (

  <p className="
    text-green-600
    font-semibold
    mt-2
  ">
    ✓ In Stock
  </p>
  
) : (

  <p className="
    text-red-500
    font-semibold
    mt-2
  ">
    Out Of Stock
  </p>

)}

<p className="text-sm text-green-600 mt-1">

🚚 Free Delivery

</p>

                  {/* BUTTONS */}

                  <div className="
                    mt-5
                    flex
                    flex-col
                    gap-3
                  ">

                    <button
                   className={`
  py-3
  rounded-xl
  font-semibold
  transition

  ${
    item.stock > 0
      ? "bg-green-600 hover:bg-green-700 text-white"
      : "bg-gray-300 text-gray-500 cursor-not-allowed"
  }
`}
                      onClick={() =>
                        moveToCart(item)
                      }
                     >
                    🛒 Move To Cart
                    </button>

                    <button
                      onClick={() =>
                        removeItem(index)
                      }
                     className="
    bg-red-500
    hover:bg-red-600
    text-white
    py-3
    rounded-xl
    font-semibold
    transition
  "
>

                    🗑 Remove
                    </button>

                  

                  </div>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>
      <div className="text-center py-10 text-gray-400">

Need Help?

<Link
href="/support"
className="text-green-600 ml-2 hover:underline"
>

Contact Support

</Link>

</div>

    </section>

  );

  }