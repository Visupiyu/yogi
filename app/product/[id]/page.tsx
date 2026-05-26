"use client";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import { doc, getDoc, collection, addDoc, getDocs, query, where, } from "firebase/firestore";

import { db } from "@/lib/firebase";
import Link from "next/link";

interface Product {

  id: string;

  name: string;

  price: number;

  image?: string;
  images?: string[];

  stock: number;

  description?: string;

  vendorId?: string;

  vendorName?: string;

}

export default function ProductPage() {

  const params = useParams();

  const [product, setProduct] =
    useState<Product | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [qty, setQty] =
    useState(1);
  
  const [selectedImage,setSelectedImage] =
  useState("");  

  const [wishlisted, setWishlisted] =
    useState(false);
   
  const [reviews,setReviews] =
  useState<any[]>([]);

  const [relatedProducts,setRelatedProducts] =
  useState<any[]>([]);
  const [recentProducts,setRecentProducts] =
  useState<any[]>([]);

  const [averageRating,setAverageRating] =
  useState(0);

const [reviewName,setReviewName] =
  useState("");

const [reviewText,setReviewText] =
  useState("");

const [rating,setRating] =
  useState(5);  
  /* FETCH PRODUCT */

  useEffect(() => {

    const fetchProduct = async () => {

      try {

        const ref = doc(
          db,
          "products",
          params.id as string
        );

        const snap =
          await getDoc(ref);

        if (snap.exists()) {

          setProduct({

            id: snap.id,

            ...(snap.data() as Omit<Product, "id">),

          });
         const data =
  snap.data() as Omit<
    Product,
    "id"
  >;

setSelectedImage(

  data.images?.[0] ||

  data.image ||

  "/no-image.png"

);
        }

      } catch (error) {

        console.log(error);

      }

      setLoading(false);

    };

    if (params?.id) {

      fetchProduct();

    }

  }, [params]);

  /* CHECK WISHLIST */

  useEffect(() => {

    const wishlist =
      JSON.parse(
        localStorage.getItem(
          "wishlist"
        ) || "[]"
      );

    const exists =
      wishlist.find(
        (item: any) =>
          item.id === product?.id
      );

    setWishlisted(!!exists);

  }, [product]);

  /* TOGGLE WISHLIST */

  const toggleWishlist = () => {

    if (!product) return;

    const wishlist =
      JSON.parse(
        localStorage.getItem(
          "wishlist"
        ) || "[]"
      );

    const exists =
      wishlist.findIndex(
        (item: any) =>
          item.id === product.id
      );

    if (exists > -1) {

      wishlist.splice(exists, 1);

      setWishlisted(false);

    } else {

      wishlist.push({

        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image || "",

      });

      setWishlisted(true);

    }

    localStorage.setItem(
      "wishlist",
      JSON.stringify(wishlist)
    );

    window.dispatchEvent(
      new Event("wishlistUpdated")
    );

  };
  useEffect(()=>{

  const loadReviews =
  async()=>{

    if(!product?.id) return;

    const q = query(

      collection(db,"reviews"),

      where(
        "productId",
        "==",
        product.id
      )

    );

    const snapshot =
      await getDocs(q);

    const items:any[] = [];

    snapshot.forEach((doc)=>{

      items.push({

        id:doc.id,

        ...doc.data()

      });

    });

    setReviews(items);

    if(items.length > 0){

      const total =
        items.reduce(

          (
            sum:number,
            review:any
          ) =>

            sum + review.rating,

          0

        );

      setAverageRating(

        total / items.length

      );

    }

  };

  loadReviews();

},[product]);

useEffect(()=>{

  const loadRelated =
  async()=>{

    if(!product) return;

    const snapshot =
      await getDocs(

        collection(
          db,
          "products"
        )

      );

    const items:any[] = [];

    snapshot.forEach((doc)=>{

      const data:any =
        doc.data();

      if(
        doc.id !== product.id
      ){

        items.push({

          id:doc.id,

          ...data

        });

      }

    });

    setRelatedProducts(

      items.slice(0,4)

    );

  };

  loadRelated();

},[product]);

useEffect(()=>{

  if(!product) return;

  const recent =
    JSON.parse(
      localStorage.getItem(
        "recentProducts"
      ) || "[]"
    );

  const filtered =
    recent.filter(
      (item:any)=>
        item.id !== product.id
    );

    
  filtered.unshift({

    id: product.id,

    name: product.name,

    price: product.price,

    image:
      product.image || "",

  });

  localStorage.setItem(

    "recentProducts",

    JSON.stringify(
      filtered.slice(0,8)
    )

  );

  setRecentProducts(
    filtered.slice(0,8)
  );

},[product]);

useEffect(()=>{

  const recent =
    JSON.parse(
      localStorage.getItem(
        "recentProducts"
      ) || "[]"
    );

  setRecentProducts(recent);

},[]);

  /* LOADING */
  const submitReview =
async()=>{

  if(
    !reviewName ||
    !reviewText
  ){

    alert("Fill all fields");

  

    return;

  }

  try{

    await addDoc(

      collection(db,"reviews"),

      {

        productId:
          product?.id,

        name:
          reviewName,

        text:
          reviewText,

        rating,

        createdAt:
          new Date(),

      }

    );

    setReviewName("");

    setReviewText("");

    setRating(5);

    alert("Review Added");

    const snapshot =
      await getDocs(

        query(

          collection(db,"reviews"),

          where(
            "productId",
            "==",
            product?.id
          )

        )

      );

    const items:any[] = [];

    snapshot.forEach((doc)=>{

      items.push({

        id:doc.id,

        ...doc.data()

      });

    });

    setReviews(items);

  }catch(error){

    console.log(error);

  }

};
  if (loading) {

    return (

      <div className="
        py-20
        text-center
      ">
        Loading...
      </div>

    );

  }

  /* PRODUCT NOT FOUND */

  if (!product) {

    return (

      <div className="
        py-20
        text-center
      ">
        Product not found
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
        grid
        grid-cols-1
        md:grid-cols-2
        gap-10
      ">

        {/* IMAGE */}

        <div className="
          bg-white
          rounded-3xl
          shadow-md
          overflow-hidden
        ">

          <div className="
            h-[500px]
            bg-gray-100
          ">

            <div className="
  overflow-hidden
  group
">

  <img
    src={selectedImage}
    alt={product.name}
    className="
      w-full
      h-full
      object-cover
      transition
      duration-300
      group-hover:scale-110
      cursor-zoom-in
    "
  />

</div>

          </div>
          <div className="
  flex
  gap-4
  p-4
  overflow-x-auto
">

  {(product.images?.length
    ? product.images
    : [product.image]
  ).map(

    (
      img:any,
      index:number
    ) => (

    <img
      key={index}
      src={
        img ||
        "/no-image.png"
      }
      alt=""
      onClick={() =>
        setSelectedImage(img)
      }
      className={`
        w-24
        h-24
        object-cover
        rounded-2xl
        cursor-pointer
        border-4
        ${
          selectedImage === img
          ? "border-green-500"
          : "border-transparent"
        }
      `}
    />

  ))}

</div>
        </div>

        {/* DETAILS */}

        <div>

          <p className="
            text-green-600
            font-semibold
            uppercase
            tracking-widest
            mb-3
          ">
            <Link
  href={`/store/${product.vendorId}`}
  className="
    text-green-600
    font-semibold
    uppercase
    tracking-widest
    mb-3
    inline-block
    hover:underline
  "
>
  {product.vendorName ||
   "Vendor Store"}
</Link>
          </p>

          <h1 className="
            text-4xl
            font-bold
            leading-tight
          ">
            {product.name}
          </h1>

          <p className="
            text-3xl
            font-bold
            text-green-600
            mt-5
          ">
            ₹{product.price}
          </p>
           <div className="
  flex
  items-center
  gap-3
  mt-4
">

  <p className="
    text-yellow-500
    text-xl
    font-bold
  ">

    {"⭐".repeat(
      Math.round(
        averageRating
      )
    )}

  </p>

  <p className="
    text-gray-600
  ">

    {averageRating.toFixed(1)}
    {" "}
    (
    {reviews.length}
    {" "}
    reviews
    )

  </p>

</div>
          {/* STOCK */}

          <div className="mt-5">

  {product.stock > 10 ? (

    <span className="
      bg-green-100
      text-green-700
      px-4
      py-2
      rounded-full
      font-medium
    ">
      In Stock
    </span>

  ) : product.stock > 0 ? (

    <span className="
      bg-orange-100
      text-orange-700
      px-4
      py-2
      rounded-full
      font-medium
    ">
      Only {product.stock} left 🔥
    </span>

  ) : (

    <span className="
      bg-red-100
      text-red-700
      px-4
      py-2
      rounded-full
      font-medium
    ">
      Out Of Stock
    </span>

  )}

</div>

          {/* DESCRIPTION */}

          <p className="
            mt-8
            text-gray-600
            leading-8
          ">
            {product.description ||
              "No description available"}
          </p>

          {/* QUANTITY */}

          <div className="mt-8">

            <p className="
              font-semibold
              mb-3
            ">
              Quantity
            </p>

            <div className="
              flex
              items-center
              gap-4
            ">

            <button
  onClick={() =>
    setQty(
      qty > 1
        ? qty - 1
        : 1
    )
  }
  className="
    w-12
    h-12
    rounded-full
    bg-gray-200
    text-xl
  "
>
  -
</button>

<span className="
  text-2xl
  font-bold
">
  {qty}
</span>

<button
  onClick={() =>
    setQty(

      qty < product.stock

      ? qty + 1

      : qty

    )
  }
  className="
    w-12
    h-12
    rounded-full
    bg-gray-200
    text-xl
  "
>
  +
</button>  

            </div>

          </div>

          {/* WISHLIST */}

          <button
            onClick={toggleWishlist}
            className={`
              w-full
              mt-8
              py-4
              rounded-2xl
              font-bold
              text-lg
              transition
              ${
                wishlisted
                  ? "bg-red-500 text-white"
                  : "bg-gray-200 text-black"
              }
            `}
          >

            {wishlisted
              ? "❤️ Wishlisted"
              : "🤍 Add To Wishlist"}

          </button>

          {/* BUTTONS */}

          <div className="
            mt-5
            flex
            flex-col
            sm:flex-row
            gap-5
          ">

            {/* ADD TO CART */}

            <button

  disabled={
    product.stock <= 0
  }

  onClick={() => {

    const existingCart =
      JSON.parse(
        localStorage.getItem(
          "cart"
        ) || "[]"
      );

    const existingIndex =
      existingCart.findIndex(
        (item: any) =>
          item.id === product.id
      );

    if (existingIndex > -1) {

      existingCart[
        existingIndex
      ].qty += qty;

    } else {

      existingCart.push({

        id: product.id,
        name: product.name,
        price: product.price,
        image:
          product.image || "",
        qty,
        vendorId:
          product.vendorId,
        stock:
          product.stock,

      });

    }

    localStorage.setItem(
      "cart",
      JSON.stringify(existingCart)
    );

    window.dispatchEvent(
      new Event("cartUpdated")
    );

    alert("Added to cart");

  }}

  className={`
    flex-1
    py-4
    rounded-2xl
    font-bold
    text-lg
    transition

    ${
      product.stock <= 0

      ? "bg-gray-400 cursor-not-allowed text-white"

      : "bg-green-600 hover:bg-green-700 text-white"
    }
  `}
>

  {product.stock <= 0

    ? "Out Of Stock"

    : "Add To Cart"

  }

</button>
            
            {/* BUY NOW */}

            <button
              onClick={() => {

                const buyNowItem = [

                  {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    image:
                      product.image || "",
                    qty,
                    vendorId:
                    product.vendorId,
                    stock:
                    product.stock,
                  }

                ];

                localStorage.setItem(
                  "checkoutItems",
                  JSON.stringify(buyNowItem)
                );

                window.location.href =
                  "/checkout";

              }}
              className="
                flex-1
                bg-black
                hover:bg-gray-900
                text-white
                py-4
                rounded-2xl
                font-bold
                text-lg
                transition
              "
            >
              Buy Now
            </button>

          </div>

        </div>

        </div>

     {/* REVIEWS */}

<div className="
  max-w-7xl
  mx-auto
  mt-20
">

  <h2 className="
    text-3xl
    font-bold
    mb-10
  ">
    Customer Reviews
  </h2>

  {/* REVIEW FORM */}

  <div className="
    bg-white
    rounded-3xl
    shadow-md
    p-8
    mb-10
  ">

    <div className="
      grid
      gap-5
    ">

      <input
        type="text"
        placeholder="Your Name"
        value={reviewName}
        onChange={(e)=>
          setReviewName(
            e.target.value
          )
        }
        className="
          border
          p-4
          rounded-2xl
        "
      />

      <textarea
        placeholder="Write review..."
        value={reviewText}
        onChange={(e)=>
          setReviewText(
            e.target.value
          )
        }
        className="
          border
          p-4
          rounded-2xl
          h-32
        "
      />

      <select
        value={rating}
        onChange={(e)=>
          setRating(
            Number(
              e.target.value
            )
          )
        }
        className="
          border
          p-4
          rounded-2xl
        "
      >

        <option value={5}>
          5 Stars
        </option>

        <option value={4}>
          4 Stars
        </option>

        <option value={3}>
          3 Stars
        </option>

        <option value={2}>
          2 Stars
        </option>

        <option value={1}>
          1 Star
        </option>

      </select>

      <button
        onClick={submitReview}
        className="
          bg-green-600
          hover:bg-green-700
          text-white
          py-4
          rounded-2xl
          font-bold
        "
      >
        Submit Review
      </button>

    </div>

  </div>

  {/* REVIEW LIST */}

  <div className="
    space-y-6
  ">

    {reviews.map(
      (
        review:any,
        index:number
      )=>(

      <div
        key={index}
        className="
          bg-white
          rounded-3xl
          shadow-md
          p-8
        "
      >

        <div className="
          flex
          justify-between
          items-center
          mb-4
        ">

          <h3 className="
            text-xl
            font-bold
          ">
            {review.name}
          </h3>

          <p className="
            text-yellow-500
            font-bold
          ">
            {"⭐".repeat(
              review.rating
            )}
          </p>

        </div>

    <div className="
  text-gray-600
  leading-7
">
  {review.text}

  <p className="
    text-sm
    text-gray-400
    mt-4
  ">

    {review.createdAt
      ? new Date(
          review.createdAt
        ).toDateString()

      : ""
    }

  </p>

</div>

      </div>

    ))}

  </div>

</div>

{/* RELATED PRODUCTS */}

<div className="
  max-w-7xl
  mx-auto
  mt-20
">

  <h2 className="
    text-3xl
    font-bold
    mb-10
  ">
    Related Products
  </h2>

  <div className="
    grid
    grid-cols-2
    md:grid-cols-4
    gap-6
  ">

    {relatedProducts.map(
      (
        item:any,
        index:number
      )=>(

      <Link
        key={index}
        href={`/product/${item.id}`}
      >

        <div className="
          bg-white
          rounded-3xl
          shadow-md
          overflow-hidden
          hover:shadow-xl
          transition
        ">

          <img
            src={
              item.image ||
              "/no-image.png"
            }
            alt={item.name}
            className="
              w-full
              h-52
              object-cover
            "
          />

          <div className="p-4">

            <h3 className="
              font-bold
              line-clamp-2
              min-h-[48px]
            ">
              {item.name}
            </h3>

            <p className="
              text-green-600
              text-xl
              font-bold
              mt-3
            ">
              ₹{item.price}
            </p>

          </div>

        </div>

      </Link>

  ))}

  </div>

</div>
{/* RECENTLY VIEWED */}

{recentProducts.length > 1 && (

<div className="
  max-w-7xl
  mx-auto
  mt-20
">

  <h2 className="
    text-3xl
    font-bold
    mb-10
  ">
    Recently Viewed
  </h2>

  <div className="
    grid
    grid-cols-2
    md:grid-cols-4
    gap-6
  ">

    {recentProducts
      .filter(
        (item:any)=>
          item.id !== product.id
      )
      .slice(0,4)
      .map(

      (
        item:any,
        index:number
      )=>(

      <Link
        key={index}
        href={`/product/${item.id}`}
      >

        <div className="
          bg-white
          rounded-3xl
          shadow-md
          overflow-hidden
          hover:shadow-xl
          transition
        ">

          <img
            src={
              item.image ||
              "/no-image.png"
            }
            alt={item.name}
            className="
              w-full
              h-52
              object-cover
            "
          />

          <div className="p-4">

            <h3 className="
              font-bold
              line-clamp-2
              min-h-[48px]
            ">
              {item.name}
            </h3>

            <p className="
              text-green-600
              text-xl
              font-bold
              mt-3
            ">
              ₹{item.price}
            </p>

          </div>

        </div>

      </Link>

    ))}

  </div>

</div>

)}
    </section>

  );

}