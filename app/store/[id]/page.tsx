"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import Link from "next/link";

import {
  collection,
  getDocs,
  query,
  where,
 } from "firebase/firestore";

import { db }
from "@/lib/firebase";

export default function StorePage() {

  const params =
    useParams();

  const [products, setProducts] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [vendorName,setVendorName] =
  useState("");

const [vendorInfo,setVendorInfo] =
  useState<any>(null);

    const [search, setSearch] =
  useState("");

    const [totalProducts, setTotalProducts] =
  useState(0);

const [totalStock, setTotalStock] =
  useState(0);

    useEffect(() => {

    const fetchStore =
    async () => {

      try {

        const q = query(

          collection(
            db,
            "products"
          ),

          where(
            "vendorId",
            "==",
            params.id)

        );

        const snapshot =
          await getDocs(q);

        const items:any[] = [];

        snapshot.forEach((doc) => {

          const data =
            doc.data();

          items.push({

            id: doc.id,

            ...data,

          });

        });

        setProducts(items);

        const vendorQuery =
  query(
    collection(db,"vendors"),
    where(
      "uid",
      "==",
      params.id
    )
  );

const vendorSnap =
  await getDocs(
    vendorQuery
  );

if(
  !vendorSnap.empty
){

  setVendorInfo(
    vendorSnap.docs[0].data()
  );

}

        setTotalProducts(
  items.length
);

setTotalStock(
  items.reduce(
    (sum, item) =>
      sum + (item.stock || 0),
    0
  )
);

        if(items.length > 0){

          setVendorName(
            items[0].vendorName
            || "Vendor Store"
          );

        }

      } catch (error) {

        console.log(error);

      }

      setLoading(false);

    };

    if(params?.id){

      fetchStore();

    }

  }, [params]);

  if(loading){

    return(

      <div className="
        py-20
        text-center
      ">
        Loading store...
      </div>

    );

  }

  return (

    <section className="
      py-10
      px-4
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        <Link
  href="/store"
  className="
    inline-block
    mb-6
    bg-gray-200
    hover:bg-gray-300
    px-4
    py-2
    rounded-xl
  "
>
  ← Back to Stores
</Link>

        {/* STORE HEADER */}

        <div className="
  bg-gradient-to-r
  from-green-600
  to-blue-600
  rounded-3xl
  p-6 md:p-12
  text-white
  mb-10
">

  <div className="
    flex
    flex-col
    md:flex-row
    md:items-center
    md:justify-between
    gap-4
  ">
  <img
      src={
        vendorInfo?.logo ||
        "/user.png"
      }
      alt=""
      className="
        w-full
        h-full
        object-cover
      "
    />

  </div>

  <div>

    <div className="
  flex
  items-center
  gap-4
">

  <div className="
    w-24
    h-24
    rounded-full
    bg-white
    overflow-hidden
    border-4
    border-white
    shadow-lg
  ">

    <img
      src={
        vendorInfo?.logo ||
        "/user.png"
      }
      alt="Vendor Logo"
      className="
        w-full
        h-full
        object-cover
      "
    />

  </div>

  <div>

    <p className="
      uppercase
      tracking-widest
      text-sm
      opacity-80
    ">
      <img
  src="/store-banner.jpg"
  alt=""
  className="
    w-full
    h-48
    object-cover
    rounded-3xl
    mb-6
  "
/>
      Verified Seller
    </p>

    <h1 className="
      text-2xl
      md:text-5xl
      font-bold
      mt-2
    ">
      {vendorName}
    </h1>

  </div>

</div>

  </div>

</div>

      <p className="
  mt-3
  opacity-90
">
Trusted marketplace seller serving customers across India
</p>

{vendorInfo && (

  <div className="
    mt-5
    space-y-1
  ">

    <p>
      👤 {vendorInfo.fullName}
    </p>

    <p>
  ✅ Verified Marketplace Seller
</p>
    <p>
      📞 {vendorInfo.businessPhone}
    </p>

    <p>
      📍 {vendorInfo.city},
      {" "}
      {vendorInfo.state}
    </p>
    <p>
  ⭐ 4.8 Store Rating
</p>

  </div>

)}

<div className="
  flex
  flex-wrap
  gap-3
  mt-4
">

  <span className="
    bg-white/20
    px-4
    py-2
    rounded-full
    text-sm
  ">
    ✅ Verified Store
  </span>

  <span className="
    bg-white/20
    px-4
    py-2
    rounded-full
    text-sm
  ">
    🚚 Fast Delivery
  </span>

  <span className="
    bg-white/20
    px-4
    py-2
    rounded-full
    text-sm
  ">
    🔒 Secure Seller
  </span>

</div>

<div className="
  flex
  gap-4
  mt-4
">

  <span className="
    bg-white/20
    px-3
    py-1
    rounded-full
  ">
    {totalProducts} 📦 Products
  </span>

  <span className="
    bg-white/20
    px-3
    py-1
    rounded-full
  ">
    {totalStock} 📊 Total Stock
  </span>
<div className="
  bg-white/20
  rounded-2xl
  p-4
  min-w-[120px]
  text-center
">
  <p>Rating</p>
  <h3 className="
    text-3xl
    font-bold
  ">
    4.8⭐
  </h3>
</div>
</div>

        <p className="mt-2">
  {products.length}
  {" "}
  Products Available
</p>
      
    </div>

    <div className="
      flex
      gap-4
    ">

      <div className="
        bg-white/20
        rounded-2xl
        p-4
        min-w-[120px]
        text-center
      ">
        <p>Products</p>
        <h3 className="
          text-3xl
          font-bold
        ">
          {totalProducts}
        </h3>
      </div>

      <div className="
        bg-white/20
        rounded-2xl
        p-4
        min-w-[120px]
        text-center
      ">
        <p>Stock</p>
        <h3 className="
          text-3xl
          font-bold
        ">
          {totalStock}
        </h3>
      </div>

    </div>

{/* STORE SEARCH */}

<div className="mb-6">

  <input
    type="text"
    placeholder="🔍 Search products in this store..."
    value={search}
    onChange={(e) =>
      setSearch(e.target.value)
    }
    className="
      w-full
      border
      rounded-2xl
      p-4
      shadow-sm
      outline-none
      focus:ring-2
      focus:ring-green-500
    "
  />
  <p className="
  text-gray-600
  mt-3
">
  Showing {
    products.filter((product)=>
      (product.name || "")
      .toLowerCase()
      .includes(
        search.trim().toLowerCase()
      )
    ).length
  } Products
</p>

</div>
        {/* PRODUCTS */}

        {products.length === 0 ? (

          <div className="
            bg-white
            rounded-3xl
            shadow-md
            p-8
            text-center
          ">

            <p className="
              text-gray-500
              text-lg
            ">
            This store has not added products yet.
            </p>

          </div>

        ) : (

          <div className="
            grid
            grid-cols-2
sm:grid-cols-2
md:grid-cols-3
lg:grid-cols-4
xl:grid-cols-8
gap-4
          ">

            {products
  .filter((product) =>
    (
  product.name || ""
)
.toLowerCase()
.includes(
  search.trim().toLowerCase()
)
  )
  .map(
              (
                product:any,
                index:number
              ) => (

              <Link
                key={product.id}
                href={`/product/${product.id}`}
              >

                <div className="
  bg-white
  rounded-3xl
  shadow-md
  overflow-hidden
  hover:shadow-xl
  transition
  duration-300
">

  <div className="
    relative
  ">

    <div className="
      absolute
      top-3
      left-3
      bg-red-500
      text-white
      text-xs
      font-bold
      px-3
      py-1
      rounded-full
      z-10
    ">
   {
  product.discount
    ? `${product.discount}% OFF`
    : "HOT"
}
    </div>

   <img
  src={
    product.image ||
    "/no-image.png"
  }
  alt={product.name}
  className="
    w-full
    h-44
    md:h-56
    object-cover
  "
/>

  </div>

              <div className="p-3 md:p-4">
                    <h2 className="
                    text-sm
                     md:text-base
                      font-bold
                      line-clamp-2
                      min-h-[40px]
                    ">
                      {product.name}
                    </h2>
                    <p className="
  text-sm
  text-gray-500
  mt-1
">
  {product.category}
</p>

                    <h2 className="
  text-sm
  md:text-base
  font-semibold
  line-clamp-2
  leading-5
">
  {product.name}
</h2>

<p className="
  text-green-600
  font-bold
  text-lg
  md:text-xl
  mt-1
">
  ₹{product.price}
</p>

                    {product.stock > 0 ? (

                      <p className="
                        text-green-600
                        text-sm
                        mt-2
                      ">
                        In Stock
                      </p>

                    ) : (

                      <p className="
                        text-red-500
                        text-sm
                        mt-2
                      ">
                        Out Of Stock
                      </p>

                    )}

                  </div>

                </div>

              </Link>

            ))}

          </div>

        )}

    </section>

  );

}