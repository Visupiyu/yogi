"use client";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import Link from "next/link";

export default function ProductPage() {

  const params = useParams();

  const [product,setProduct] =
    useState<any>(null);
    const [relatedProducts,setRelatedProducts] =
  useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);
    const [selectedImage,setSelectedImage] =
  useState("");
  const [selectedSize,setSelectedSize] =
  useState("");

  useEffect(()=>{

    async function loadProduct(){

      try{

        const snap =
          await getDoc(

            doc(
              db,
              "products",
              params.id as string
            )

          );

        if (snap.exists()) {

  const productData = snap.data();

 const fullProduct: any = {
  id: snap.id,
  ...productData
};

setProduct(fullProduct);

setSelectedImage(
  fullProduct.images?.[0] ||
  fullProduct.image ||
  "/no-image.png"
);

  const q = query(
    collection(db, "products"),
    where(
      "category",
      "==",
      productData.category
    )
  );

  const relatedSnap =
    await getDocs(q);

  const related: any[] = [];

  relatedSnap.forEach((doc) => {

    if (doc.id !== snap.id) {

      related.push({
        id: doc.id,
        ...doc.data()
      });

    }

  });

  setRelatedProducts(
    related.slice(0, 4)
  );

}

      }catch(error){

        console.log(error);

      }finally{

        setLoading(false);

      }

    }

    if(params?.id){

      loadProduct();

    }

  },[params]);

  const addToCart = ()=>{

    const cart = JSON.parse(

      localStorage.getItem(
        "cart"
      ) || "[]"

    );

    const index = cart.findIndex(

      (item:any)=>

        item.id === product.id

    );

    if(index > -1){

      cart[index].qty += 1;

    }else{

      cart.push({

        id:product.id,

        name:product.name,

        price:product.price,

        image:product.image,

        stock:product.stock,

        qty:1

      });

    }

    localStorage.setItem(

      "cart",

      JSON.stringify(cart)

    );

    window.dispatchEvent(

      new Event(
        "cartUpdated"
      )

    );

    alert(
      "Added To Cart"
    );

  };

  const addToWishlist = ()=>{

    const wishlist = JSON.parse(

      localStorage.getItem(
        "wishlist"
      ) || "[]"

    );

    const exists = wishlist.find(

      (item:any)=>

        item.id === product.id

    );

    if(exists){

      alert(
        "Already In Wishlist"
      );

      return;

    }

    wishlist.push(product);

    localStorage.setItem(

      "wishlist",

      JSON.stringify(wishlist)

    );

    window.dispatchEvent(

      new Event(
        "wishlistUpdated"
      )

    );

    alert(
      "Added To Wishlist"
    );

  };

  if(loading){

    return(

      <div className="
        min-h-screen
        flex
        items-center
        justify-center
      ">

        Loading Product...

      </div>

    );

  }

  if(!product){

    return(

      <div className="
        min-h-screen
        flex
        items-center
        justify-center
      ">

        Product Not Found

      </div>

    );

  }

 return (

  <div className="
    min-h-screen
    bg-gray-100
    p-3
  ">

    <div className="
      max-w-7xl
      mx-auto
      bg-white
      rounded-3xl
      shadow
      p-4
    ">

      <div className="
        grid
        md:grid-cols-2
        gap-10
      ">

        {/* IMAGE */}

        <div>

 <div
  className="
    bg-slate-50
    rounded-3xl
    p-4
    overflow-hidden
  "
>

  <img
  src={selectedImage}
  alt={product.name}
  className="
    w-full
    h-[300px]
    md:h-[500px]
    object-contain
    rounded-2xl
    transition-all
    duration-300
    hover:scale-150
    cursor-zoom-in
  "
/>

  </div>

  <div className="
    flex
     justify-center
    gap-3
    mt-4
    flex-wrap
  ">

    {(product.images || [product.image])
      .map((img:string,index:number)=>(

        <img
          key={index}
          src={img}
          alt=""
          onClick={() =>
            setSelectedImage(img)
          }
         className={`
  w-20
  h-20
  object-cover
  rounded-xl
  border-2
  cursor-pointer
  ${
    selectedImage === img
      ? "border-blue-600"
      : "border-gray-300"
  }
`}
        />

      ))}

  </div>

</div>

        {/* DETAILS */}

        <div>

          <h1 className="
           text-2xl
md:text-4xl
            font-bold
            mb-2
          ">
            {product.name}
          </h1>

          <div className="
            flex
            items-center
            gap-3
            mb-2
          ">
            <span className="text-yellow-500">
              ⭐⭐⭐⭐⭐
            </span>

            <span className="
              text-gray-500
              text-sm
            ">
              (4.9 Rating)
            </span>
          </div>

          <div className="
            flex
            items-center
            gap-3
            mb-3
          ">

            <div>

  <p className="
    text-green-600
    text-4xl
    font-bold
  ">
    ₹{product.price}
  </p>

  <div className="
    flex
    items-center
    gap-3
    mt-1
  ">

    <p className="
      text-gray-400
      line-through
      text-lg
    ">
      ₹{
        product.mrp ||
        Math.round(
          product.price * 1.25
        )
      }
    </p>

    <span className="
      bg-red-100
      text-red-600
      px-2
      py-1
      rounded-full
      text-sm
      font-semibold
    ">
      {
        product.discountPercent || 25
      }% OFF
    </span>

  </div>

  <p className="
    text-green-700
    font-semibold
    mt-1
  ">
    You Save ₹
    {
      (product.mrp || 0)
      -
      product.price
    }
  </p>

  <p className="
    text-xs
    text-gray-500
  ">
    Inclusive of all taxes
  </p>

</div>

          </div>

          <p className="
            text-gray-600
            mb-2
          ">
            Category: {product.category}
          </p>

          <div className="
  bg-slate-50
  rounded-2xl
  p-4
  mb-4
">

  <h3 className="
    font-bold
    mb-3
  ">
    Product Details
  </h3>

  <div className="
    grid
    grid-cols-2
    gap-2
    text-sm
  ">

    <p>
      <b>Brand:</b>
      {" "}
      {product.brand || "-"}
    </p>

    <p>
      <b>Gender:</b>
      {" "}
      {product.gender || "-"}
    </p>

    <p>
      <b>Color:</b>
      {" "}
      {product.color || "-"}
    </p>

    <p>
      <b>Material:</b>
      {" "}
      {product.material || "-"}
    </p>

    <p>
      <b>Country:</b>
      {" "}
      {
        product.countryOfOrigin
        || "-"
      }
    </p>

  </div>

</div>

          <div className="mb-4">

            <span
              className={`
                px-3
                py-1
                rounded-full
                text-sm
                font-semibold

                ${
                  product.stock > 0
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }
              `}
            >
              {
                product.stock > 0
                  ? "In Stock"
                  : "Out Of Stock"
              }

              {
  product.sizes &&
  product.sizes.length > 0 && (

    <div className="mb-4">

      <p className="
        font-semibold
        mb-2
      ">
        Select Size
      </p>

      <div className="
        flex
        gap-2
        flex-wrap
      ">

        {product.sizes.map(
          (
            size:string,
            index:number
          ) => (

            <button
              key={index}
              onClick={() =>
                setSelectedSize(
                  size
                )
              }
              className={`
                px-4
                py-2
                border
                rounded-xl

                ${
                  selectedSize ===
                  size

                  ? "bg-blue-600 text-white"

                  : "bg-white"
                }
              `}
            >
              {size}
            </button>

          )
        )}

      </div>

    </div>

  )
}
            </span>

          </div>

          {/* VENDOR */}

          <div className="
            bg-slate-50
            rounded-2xl
            p-4
            mb-4
          ">

            <p className="
              text-sm
              text-gray-500
            ">
              Sold By
            </p>

            <h3 className="
              font-bold
              text-lg
            ">
              {product.vendorName}
            </h3>

            <Link
             href={`/store/${product.vendorId}`}
              className="
                text-green-600
                font-semibold
                text-sm
              "
            >
              Visit Store →
            </Link>

          </div>

          {/* BUTTONS */}

         <div className="
  flex
  flex-col
  sm:flex-row
  gap-3
  mb-4
">

            <button
              onClick={addToCart}
              className="
  flex-1
  bg-green-600
  text-white
  py-4
  rounded-2xl
  font-bold
"
            >
              Add To Cart
            </button>

            <button
              onClick={addToWishlist}
              className="
  flex-1
  bg-pink-600
  text-white
  py-4
  rounded-2xl
  font-bold
"
            >
              Wishlist
            </button>

          </div>

          <Link
            href="/checkout"
           className="
  block
  w-full
  bg-blue-600
  text-white
  py-4
  rounded-2xl
  font-bold
  text-center
"
          >
            Buy Now
          </Link>

          {/* DESCRIPTION */}

          <div className="mt-8">

            <h2 className="
              text-xl
              font-bold
              leading-snug
              mb-3
            ">
              Product Description
            </h2>

            <p className="
              text-gray-600
              leading-7
            ">
              {
                product.description ||
                "No description available."
              }
            </p>

          </div>

        </div>

      </div>

      {/* REVIEWS */}

      <div className="mt-8">

        <h2 className="
          text-2xl
          font-bold
          mb-2
        ">
          Reviews & Ratings
        </h2>

        <p className="text-gray-500">
          Reviews feature coming soon.
        </p>

      </div>

      {/* RELATED PRODUCTS */}

      <div className="mt-8">

        <h2 className="
          text-2xl
          font-bold
          mb-4
        ">
          Related Products
        </h2>

        <div className="
          grid
          grid-cols-2
          md:grid-cols-4
          gap-4
        ">

          {relatedProducts.map((item) => (

            <Link
              key={item.id}
              href={`/product/${item.id}`}
            >

              <div className="
                bg-white
                rounded-xl
                shadow
                overflow-hidden
              ">

                <img
                  src={item.image}
                  alt={item.name}
                  className="
                    w-full
                    h-40
                    object-contain
                  "
                />

                <div className="p-2">

                  <h3 className="
                    font-semibold
                    line-clamp-2
                  ">
                    {item.name}
                  </h3>

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

      </div>

    </div>

  </div>

);
}