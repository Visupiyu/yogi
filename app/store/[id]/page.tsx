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
  doc,
  getDoc,
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
  href="/stores"
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
  p-10
  text-white
  mb-10
">

  <div className="
    flex
    flex-col
    md:flex-row
    md:items-center
    md:justify-between
    gap-6
  ">

    <div>

      <p className="
        uppercase
        tracking-widest
        text-sm
        opacity-80
      ">
        Verified Seller
      </p>

      <h1 className="
        text-5xl
        font-bold
        mt-3
      ">
        {vendorName}
      </h1>

      <p className="
  mt-3
  opacity-90
">
  Trusted marketplace seller
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
      📧 {vendorInfo.email}
    </p>

    <p>
      📞 {vendorInfo.businessPhone}
    </p>

    <p>
      📍 {vendorInfo.city},
      {" "}
      {vendorInfo.state}
    </p>

  </div>

)}

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

</div>
        {/* PRODUCTS */}

        {products.length === 0 ? (

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
              No products found
            </p>

          </div>

        ) : (

          <div className="
            grid
            grid-cols-2
            md:grid-cols-3
            lg:grid-cols-4
            gap-6
          ">

            {products
  .filter((product) =>
    product.name
      ?.toLowerCase()
      .includes(
        search.toLowerCase()
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

                  <img
                    src={
                      product.image ||
                      "/no-image.png"
                    }
                    alt={product.name}
                    className="
                      w-full
                      h-60
                      object-cover
                    "
                  />

                  <div className="p-5">

                    <h2 className="
                      text-lg
                      font-bold
                      line-clamp-2
                      min-h-[56px]
                    ">
                      {product.name}
                    </h2>

                    <p className="
                      text-green-600
                      font-bold
                      text-2xl
                      mt-3
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

      </div>

    </section>

  );

}