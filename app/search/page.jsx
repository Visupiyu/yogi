"use client";

import {
  useEffect,
  useState,
} from "react";



import {
  Suspense
} from "react";

import Link from "next/link";

import {
  useSearchParams
} from "next/navigation";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db }
from "@/lib/firebase";

function SearchContent(){

  const searchParams =
    useSearchParams();

  const query =
    searchParams.get("q") || "";

  const [products,setProducts] =
   useState([]);

const [filtered,setFiltered] =
   useState([]);
  const [loading,setLoading] =
    useState(true);

  const [sort,setSort] =
    useState("");

  const [stockOnly,setStockOnly] =
    useState(false);

  useEffect(()=>{

    const fetchProducts =
    async()=>{

      try{

        const snapshot =
          await getDocs(
            collection(db,"products")
          );

        const items = [];

        snapshot.forEach((doc)=>{

          const data = doc.data();

          if(
            data.name
            ?.toLowerCase()
            .includes(
              query
.trim()
.toLowerCase()
            )
          ){

            items.push({
              id:doc.id,
              ...data,
            });

          }

        });

        setProducts(items);

      }catch(error){

        console.log(error);

      }

      setLoading(false);

    };

    fetchProducts();

  },[query]);

  useEffect(()=>{

    let items = [...products];

    /* STOCK FILTER */

    if(stockOnly){

      items = items.filter(
        (item)=>
          item.stock > 0
      );

    }

    /* SORT */

    if(sort === "low"){

      items.sort(
        (a,b)=>
          a.price - b.price
      );

    }

    if(sort === "high"){

  items.sort(
    (a,b)=>
      b.price - a.price
  );

}

if(sort === "stock"){

  items.sort(
    (a,b)=>
      b.stock - a.stock
  );

}

     setFiltered(items);

  },[
    products,
    sort,
    stockOnly,
  ]);

  return (

     <section className="
      py-10
      px-4
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        {/* TOP */}

        <div className="
          flex
          flex-col
          lg:flex-row
          lg:items-center
          lg:justify-between
          gap-5
          mb-8
        ">

          <div>

  <h1 className="
    text-3xl
    font-bold
  ">

    Search Results:
    {" "}
    "{query}"

  </h1>

  <p className="
    text-gray-500
    mt-2
  ">

    {filtered.length}

    {" "}

    Products Found

  </p>

  <div className="
    flex
    flex-wrap
    gap-3
    mt-4
  ">

    {[
      "Shoes",
      "Mobile",
      "Beauty",
      "Grocery",
      "Fashion"
    ].map((item)=>(

      <Link
        key={item}
        href={`/search?q=${item}`}
      >

        <button className="
          bg-white
          border
          px-4
          py-2
          rounded-full
          hover:bg-gray-100
        ">

          {item}

        </button>

      </Link>

    ))}

  </div>

</div>

          {/* FILTERS */}

          <div className="
            flex
            flex-wrap
            gap-4
          ">

            <select
              value={sort}
              onChange={(e)=>
                setSort(
                  e.target.value
                )
              }
              className="
                border
                rounded-xl
                px-4
                py-2
              "
            >

              <option value="">
                Sort By
              </option>

              <option value="low">
                Price: Low to High
              </option>

              <option value="high">
  Price: High to Low
</option>

<option value="stock">
  Stock Available
</option>
              
            </select>

            <label className="
              flex
              items-center
              gap-2
              border
              rounded-xl
              px-4
              py-2
              bg-white
            ">

              <input
                type="checkbox"
                checked={stockOnly}
                onChange={(e)=>
                  setStockOnly(
                    e.target.checked
                  )
                }
              />

              In Stock Only

            </label>

            <button

  onClick={()=>{

    setSort("");

    setStockOnly(false);

  }}

  className="
    bg-red-500
    hover:bg-red-600
    text-white
    px-4
    py-2
    rounded-xl
    font-semibold
  "
>

  Clear Filters

</button>

          </div>

        </div>

        {/* LOADING */}

        {loading ? (

          <div>
            Loading...
          </div>

        ) : filtered.length === 0 ? (

          <div className="
  bg-white
  rounded-3xl
  shadow-md
  p-10
  text-center
">

  <img
    src="/empty-search.png"
    alt="No Products"
    className="
      w-40
      mx-auto
      mb-6
    "
  />

  <h2 className="
    text-3xl
    font-bold
    mb-3
  ">

    No Products Found

  </h2>

  <p className="
    text-gray-500
    text-lg
  ">

    Try another keyword

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
            grid-cols-2
            md:grid-cols-3
            lg:grid-cols-4
            gap-6
          ">

            {filtered.map((product)=>(  

              <Link
                key={product?.id}
                href={`/product/${product?.id}`}
              >

                <div className="
                  bg-white
                  rounded-2xl
                  shadow-md
                  overflow-hidden
                  hover:shadow-xl
                  transition
                  duration-300
                ">

                  <div className="
                    h-52
                    bg-gray-100
                  ">

                    <img
                      src={
                        product?.image ||
                        "/no-image.png"
                      }
                      alt={product?.name}
                      className="
                        w-full
                        h-full
                        object-cover
                      "
                    />

                  </div>

                  <div className="p-4">

                    <h3 className="
                      font-semibold
                      line-clamp-2
                      min-h-[48px]
                    ">
                      {product?.name}
                    </h3>

                    <p className="
                      text-green-600
                      font-bold
                      text-lg
                      mt-2
                    ">
                      ₹{product?.price}
                    </p>

                    {product?.stock > 0 ? (

                      <p className="
                        text-sm
                        text-green-600
                        mt-2
                      ">
                        In Stock
                      </p>

                    ) : (

                      <p className="
                        text-sm
                        text-red-500
                        mt-2
                      ">
                        Out of Stock
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


       
export default function SearchPage(){

  return(

    <Suspense
      fallback={
        <div>
          Loading...
        </div>
      }
    >

      <SearchContent />

    </Suspense>

  );

}