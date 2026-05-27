"use client";

import Link from "next/link";

import {
  ShoppingCart,
  Heart,
  User,
  Search,
} from "lucide-react";

import {
  useState,
  useEffect,
} from "react";

import {
  collection,
  getDocs
} from "firebase/firestore";

import { db }
from "@/lib/firebase";

import {
  signOut
} from "firebase/auth";

import {
  auth
} from "@/lib/firebase";

import {
  useRouter
} from "next/navigation";

export default function Navbar() {

  const router =
    useRouter();

  const [search, setSearch] =
    useState("");
 const [suggestions,setSuggestions] =
  useState<any[]>([]);

  const [showSuggestions,
setShowSuggestions] =
  useState(true);

  const [cartCount, setCartCount] =
    useState(0);
const [wishlistCount, setWishlistCount] =
  useState(0);

  const [user,setUser] =
  useState<any>(null);
  /* SEARCH */

  const handleSearch = () => {

    if (!search.trim()) return;

    router.push(
      `/search?q=${search}`
    );

    setSuggestions([]);

  };

    /* CART COUNT */

  useEffect(() => {

  const updateCart = () => {

    const cart =
      JSON.parse(
        localStorage.getItem("cart")
        || "[]"
      );

    const totalQty =
      cart.reduce(

        (
          sum: number,
          item: any
        ) =>

          sum + item.qty,

        0

      );

    setCartCount(totalQty);

  
    /* WISHLIST COUNT */

    const wishlist =
      JSON.parse(
        localStorage.getItem(
          "wishlist"
        ) || "[]"
      );

    setWishlistCount(
      wishlist.length
    );

  };

  updateCart();

  window.addEventListener(
    "storage",
    updateCart
  );

  window.addEventListener(
    "cartUpdated",
    updateCart as EventListener
  );

  window.addEventListener(
    "wishlistUpdated",
    updateCart as EventListener
  );
  
  return () => {

    window.removeEventListener(
      "storage",
      updateCart
    );

    window.removeEventListener(
      "cartUpdated",
      updateCart as EventListener
    );

    window.removeEventListener(
      "wishlistUpdated",
      updateCart as EventListener
    );

  };

}, []);

const logout =
async()=>{

  await signOut(auth);

  localStorage.removeItem(
    "user"
  );

  setUser(null);

  router.push("/login");

};

useEffect(()=>{
 
 const savedUser =
  localStorage.getItem(
    "user"
  );

if(savedUser){

  setUser(
    JSON.parse(savedUser)
  );

}

  const loadSuggestions =
  async()=>{

    if(search.length < 2){

      setSuggestions([]);

      return;

    }

    const trimmedSearch =

  search.trim();

if(
  trimmedSearch.length < 2
){

  return;

}

    const snapshot =
      await getDocs(

        collection(
          db,
          "products"
        )

      );

    const items:any[] = [];

    snapshot.forEach((doc)=>{

      const data =
        doc.data();

      if(

        data.name
        ?.toLowerCase()
        .includes(
          trimmedSearch.toLowerCase()
        )

      ){

        items.push({

          id:doc.id,

          ...data

        });

      }

    });

    setSuggestions(
      items.slice(0,5)
    );

  };

  loadSuggestions();

},[search]);

    return (
      

    <header className="
      sticky
      top-0
      z-50
      bg-white
      shadow-md
    ">

      <div className="
        max-w-7xl
        mx-auto
        px-4
      ">

        <div className="
          h-16
          flex
          items-center
          justify-between
          gap-4
          flex-wrap
        ">

          {/* LOGO */}

          <Link href="/">

            <h1 className="
              text-3xl
              font-extrabold
              text-green-600
              whitespace-nowrap
            ">
              <img
  src="/logo.png"
  alt="Yogi-Mart"
  className="
    h-18
      md:h-22
    object-contain
  "
/>
            </h1>

          </Link>

          {/* SEARCH */}

          <div className="
            flex-1
            flex
          ">

            <div className="
              w-full
              relative
               max-w-2xl
               mx-auto
            ">

              <input
                type="text"
                placeholder="
                  Search products...
                "
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {

                  if (
                    e.key === "Enter"
                  ) {

                    handleSearch();

                  }

                }}

                onFocus={()=>{

  setShowSuggestions(
    true
  );

}}
                className="
                  w-full
                  border
                  border-gray-300
                  rounded-full
                  py-2.5
                  pl-5
                  pr-14
                  outline-none
                  focus:border-green-500
                  text-sm
                  md:text-base
                "
              />
               {showSuggestions &&
 suggestions.length > 0 && (

  <div className="
    absolute
    top-full
    left-0
    w-full
    bg-white
    shadow-xl
    rounded-2xl
    mt-2
    z-50
    overflow-hidden
  ">

    {suggestions.map(
      (
        item:any,
        index:number
      )=>(

      <Link
  key={index}

  onClick={()=>{

    setSuggestions([]);

    setShowSuggestions(
      false
    );

  }}
        href={`/product/${item.id}`}
      >

        <div className="
          flex
          items-center
          gap-4
          p-4
          hover:bg-gray-100
          transition
        ">

          <img
            src={
              item.image ||
              "/no-image.png"
            }
            alt=""
            className="
              w-14
              h-14
              object-cover
              rounded-xl
            "
          />

          <div>

            <p className="
              font-semibold
            ">
              {item.name}
            </p>

            <p className="
              text-green-600
              font-bold
            ">
              ₹{item.price}
            </p>

          </div>

        </div>

      </Link>

    ))}

  </div>

)}
              <button
                onClick={handleSearch}
                className="
                  absolute
                  right-2
                  top-1/2
                  -translate-y-1/2
                  bg-green-600
                  hover:bg-green-700
                  text-white
                  p-2
                  rounded-full
                "
              >

                <div className="
  flex
  items-center
  gap-2
">

  <Search size={18} />

  <span className="
    hidden
    md:block
  ">

    Search

  </span>

</div>

                
              </button>

            </div>

          </div>

          
          {

  user ? (

    <button

      onClick={logout}

      className="
        bg-red-500
        hover:bg-red-600
        text-white
        px-4
        py-2
        rounded-full
      "
    >

      Logout

    </button>

  ) : null

}


          {/* RIGHT */}

          <div className="
            flex
            items-center
            gap-5
          ">

            {/* WISHLIST */}

            <Link
  href="/wishlist"
  className="relative"
>

  <Heart className="
    w-6
    h-6
    text-gray-700
  " />

  {wishlistCount > 0 && (

    <span className="
      absolute
      -top-2
      -right-2
      bg-red-500
      text-white
      text-xs
      w-5
      h-5
      rounded-full
      flex
      items-center
      justify-center
    ">

      {wishlistCount}

    </span>

  )}

</Link>
            {/* CART */}

            <Link
              href="/cart"
              className="relative"
            >

              <ShoppingCart className="
                w-6
                h-6
                text-gray-700
              " />

              {cartCount > 0 && (

                <span className="
                  absolute
                  -top-2
                  -right-2
                  bg-red-500
                  text-white
                  text-xs
                  w-5
                  h-5
                  rounded-full
                  flex
                  items-center
                  justify-center
                ">

                  {cartCount}

                </span>

              )}

            </Link>
             
            {/* LOGIN */}

            <Link href="/profile">

              <div className="
                flex
                items-center
                gap-2
                bg-green-600
                hover:bg-green-700
                text-white
                px-4
                py-2
                rounded-full
                transition
              ">

                <User size={18} />

                <span className="
                  hidden
                  md:block
                ">
                  Login
                </span>

              </div>

            </Link>

          </div>

        </div>

      </div>

    </header>

  );
}
