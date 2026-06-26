"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {doc,getDoc,collection,getDocs,query,where, addDoc,  serverTimestamp} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

import Link from "next/link";

export default function ProductPage() {

  const params = useParams();  const router = useRouter();
  const [product,setProduct] = useState<any>(null);
  const [relatedProducts,setRelatedProducts] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  const [selectedImage,setSelectedImage] = useState("");
  const [selectedSize,setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [showSizeChart,setShowSizeChart] = useState(false);
  const [question,setQuestion] =useState("");
  const [questions,setQuestions] =useState<any[]>([]);
  const [reviews,setReviews] =useState<any[]>([]);
  const [rating,setRating] =useState(5);
  const [reviewText,setReviewText] =useState("");
 

  useEffect(()=>{
    async function loadProduct(){ try{ 
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
 const fullProduct: any = { id: snap.id, ...productData
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
  const questionQuery = query(

  collection(
    db,
    "productQuestions"
  ),

  where(
    "productId",
    "==",
    snap.id
  )

);

const questionSnap =
  await getDocs(
    questionQuery
  );

const questionData:any[] =
  [];

questionSnap.forEach((doc)=>{

  questionData.push({

    id:doc.id,

    ...doc.data()

  });

});

setQuestions(
  questionData
);

const reviewQuery = query(

  collection(
    db,
    "productReviews"
  ),

  where(
    "productId",
    "==",
    snap.id
  )

);

const reviewSnap =
  await getDocs(
    reviewQuery
  );

const reviewData:any[] =
  [];

reviewSnap.forEach((doc)=>{

  reviewData.push({

    id:doc.id,

    ...doc.data()

  });

});

setReviews(
  reviewData
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
  const addToCart = () => {

  console.log("Product:", product);

  console.log("vendorId:", product.vendorId);

  console.log("vendorName:", product.vendorName);

  const cart = JSON.parse(
    localStorage.getItem("cart") || "[]"
  );

  console.log("Cart Before:", cart);


  // existing code...
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

        qty:1,

         vendorId: product.vendorId,

         vendorName: product.vendorName,

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
 const askQuestion = async()=>{

  const user =
    JSON.parse(
      localStorage.getItem(
        "user"
      ) || "{}"
    );

  if(!question.trim()){

    alert(
      "Enter a question"
    );

    return;

  }

  try{

    await addDoc(

      collection(
        db,
        "productQuestions"
      ),

      {

        productId:
          product.id,

        productName:
          product.name,

        customerName:
          user.name ||
          "Customer",

        question,

        answer: "",

        status:
          "Pending",

        createdAt:
          new Date(),

      }

    );

    alert(
      "Question submitted"
    );

    setQuestion("");

    window.location.reload();

  }catch(error){

    console.log(error);

  }

};

const submitReview =
async()=>{

  const user =
    JSON.parse(

      localStorage.getItem(
        "user"
      ) || "{}"

    );

  if(!reviewText){

    alert(
      "Enter review"
    );

    return;

  }

  try{

    await addDoc(

      collection(
        db,
        "productReviews"
      ),

      {

        productId:
          product.id,

        productName:
          product.name,

        customerName:
          user.name ||
          "Customer",

        userEmail:
          user.email || "",

        rating,

        review:
          reviewText,

        createdAt:
          serverTimestamp()

      }

    );

    alert(
      "Review Submitted"
    );

    window.location.reload();

  }catch(error){

    console.log(error);

  }

};
const startChat = async()=>{

  const user = JSON.parse(

    localStorage.getItem(
      "user"
    ) || "{}"

  );

  if(!user.email){

    alert("Please Login First");

    router.push("/login");

    return;

  }

  const q = query(

    collection(
      db,
      "chats"
    ),

    where(
      "customerEmail",
      "==",
      user.email
    ),

    where(
      "sellerId",
      "==",
      product.vendorId
    )

  );

  const snapshot =
    await getDocs(q);

  if(!snapshot.empty){

    router.push(

      `/chat/${snapshot.docs[0].id}`

    );

    return;

  }

  const docRef =
    await addDoc(

      collection(
        db,
        "chats"
      ),

      {

        customerEmail:
          user.email,

        customerName:
          user.name,

        sellerId:
          product.vendorId,

        sellerName:
          product.vendorName,

        sellerImage:"",

        customerImage:"",

        productId:
          product.id,

        productName:
          product.name,

        lastMessage:"",

       customerUnread:0,

      sellerUnread:0,

        createdAt:
          serverTimestamp(),

        lastMessageAt:
          serverTimestamp(),

      }

    );

  router.push(

    `/chat/${docRef.id}`

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

  const colors =
  product.color
    ? product.color
        .split(",")
        .map((c: string) => c.trim())
    : [];

 return (

    <>

  <div className="
  min-h-screen
  bg-gray-100
  p-3
  pb-32
">

    <div className="
  max-w-7xl
  mx-auto
  bg-white
  rounded-3xl
  shadow
  p-4
  h-fit
">

  <div className="
  grid
  md:grid-cols-2
  gap-10
  items-start
">

        {/* IMAGE */}

      <div className="
  md:sticky
  md:top-24
  self-start
">

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
    h-[280px]
    sm:h-[350px]
    md:h-[500px]
    lg:h-[650px]
    object-contain
    rounded-2xl
    transition-all
    duration-300
    hover:scale-110
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
 w-14
h-14
md:w-20
md:h-20
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
  <div className="
  flex
  flex-wrap
  gap-2
  mt-3
">

  <span className="
    bg-green-100
    text-green-700
    px-3
    py-1
    rounded-full
    text-xs
  ">
    🚚 Fast Delivery
  </span>

  <span className="
    bg-blue-100
    text-blue-700
    px-3
    py-1
    rounded-full
    text-xs
  ">
    🔒 Secure Payment
  </span>

  <span className="
    bg-orange-100
    text-orange-700
    px-3
    py-1
    rounded-full
    text-xs
  ">
    ↩ Easy Returns
  </span>

</div>

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

  <div className="
  grid
  grid-cols-2
  gap-y-3
  text-sm
">

  <p className="font-semibold">
    Brand
  </p>

  <p>
    {product.brand || "-"}
  </p>

  <p className="font-semibold">
    Gender
  </p>

  <p>
    {product.gender || "-"}
  </p>

  <p className="font-semibold">
    Color
  </p>

  <p>
    {product.color || "-"}
  </p>

  <p className="font-semibold">
    Material
  </p>

  <p>
    {product.material || "-"}
  </p>

  <p className="font-semibold">
    Country Of Origin
  </p>

  <p>
    {
      product.countryOfOrigin
      || "-"
    }
  </p>


  </div>

</div>

          <div className="mb-4">

           <div
  className={`
    p-3
    rounded-xl

    ${
      product.stock > 0
        ? "bg-green-50"
        : "bg-red-50"
    }
  `}
>
              <div>

  <p className="
    text-green-600
    font-semibold
  ">
    ✓ In Stock
  </p>

  <p className="
    text-orange-500
    text-sm
  ">
    Only {product.stock} Left
  </p>

</div>

              {
  product.sizes &&
  product.sizes.length > 0 && (

    <div className="mb-4">

      <div className="
  flex
  justify-between
  items-center
  mb-2
">

  <p className="font-semibold">
    Select Size
  </p>

  <button
    type="button"
   onClick={() =>
  setShowSizeChart(true)
}
    className="
      text-blue-600
      text-sm
      font-semibold
    "
  >
    Size Chart
  </button>

</div>

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
          </div>

          </div>

          {/* COLOR SELECTOR */}

{colors.length > 0 && (

  <div className="mb-4">

    <p className="
      font-semibold
      text-green-700
      mb-2
    ">
      Select Color
    </p>

    <div className="
      flex
      flex-wrap
      gap-2
    ">

      {colors.map((color:any) => (

        <button
          key={color}
          onClick={() =>
            setSelectedColor(color)
          }
          className={`
            px-4
            py-2
            rounded-xl
            border
            font-medium
            ${
              selectedColor === color
                ? "border-blue-600 bg-blue-50 text-blue-600"
                : "border-gray-300"
            }
          `}
        >
          {color}
        </button>

      ))}

    </div>

  </div>

)}

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

          <div
  className="
    bg-slate-50
    rounded-2xl
    p-4
    mb-4
  "
>

  <h3 className="
    font-bold
    text-lg
    mb-3
  ">
    Delivery & Services
  </h3>

  <div className="
    space-y-2
    text-sm
  ">

    <p>
      🚚 Free Delivery
    </p>

    <p>
      📦 Delivery in 3-5 Days
    </p>

    <p>
      ↩️ 7 Days Easy Return
    </p>

    <p>
      💳 Cash On Delivery Available
    </p>

    <p>
      🔒 Secure Payment
    </p>

  </div>

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

          <div
  className="
    grid
    grid-cols-2
    gap-3
    mt-4
  "
>

  <Link href="/">

    <button
      className="
        w-full
        border-2
        border-green-600
        text-green-600
        hover:bg-green-600
        hover:text-white
        py-4
        rounded-2xl
        font-bold
        transition
      "
    >

      ← Continue Shopping

    </button>

  </Link>

  <Link href="/cart">

    <button
      className="
        w-full
        bg-green-600
        hover:bg-green-700
        text-white
        py-4
        rounded-2xl
        font-bold
      "
    >

      🛒 View Cart

    </button>

  </Link>

</div>
          <button

  onClick={startChat}

  className="
    w-full
    mt-4
    bg-indigo-600
    text-white
    py-4
    rounded-2xl
    font-bold
  "

>

  💬 Chat With Seller

</button>

<button

  onClick={async()=>{

    const url = window.location.href;

    if(navigator.share){

      await navigator.share({

        title: product.name,

        text: product.name,

        url

      });

    }else{

      navigator.clipboard.writeText(url);

      alert("Product link copied.");

    }

  }}

  className="
    w-full
    mt-4
    bg-gray-700
    text-white
    py-4
    rounded-2xl
    font-bold
  "

>

  🔗 Share Product

</button>

          {/* HIGHLIGHTS */}

<div className="mt-8">

  <h2 className="
    text-xl
    font-bold
    mb-4
  ">
    Highlights
  </h2>

  <div className="
    grid
    grid-cols-1
    md:grid-cols-2
    gap-3
  ">

    <div>✔ Premium Quality</div>

    <div>
      ✔ {product.material || "Quality Material"}
    </div>

    <div>
      ✔ {product.color || "Stylish Color"}
    </div>

    <div>
      ✔ Made In {
        product.countryOfOrigin ||
        "India"
      }
    </div>

  </div>

</div>

  {/* SPECIFICATIONS */}

<div className="mt-8">

  <h2 className="
    text-xl
    font-bold
    mb-4
  ">
    Specifications
  </h2>

  <div className="
    border
    rounded-2xl
    overflow-hidden
  ">

    <div className="
      grid
      grid-cols-2
      border-b
    ">
      <div className="
        bg-gray-50
        p-3
        font-semibold
      ">
        Brand
      </div>

      <div className="p-3">
        {product.brand || "-"}
      </div>
    </div>

    <div className="
      grid
      grid-cols-2
      border-b
    ">
      <div className="
        bg-gray-50
        p-3
        font-semibold
      ">
        Color
      </div>

      <div className="p-3">
        {product.color || "-"}
      </div>
    </div>

    <div className="
      grid
      grid-cols-2
      border-b
    ">
      <div className="
        bg-gray-50
        p-3
        font-semibold
      ">
        Material
      </div>

      <div className="p-3">
        {product.material || "-"}
      </div>
    </div>

    <div className="
      grid
      grid-cols-2
      border-b
    ">
      <div className="
        bg-gray-50
        p-3
        font-semibold
      ">
        Country Of Origin
      </div>

      <div className="p-3">
        {product.countryOfOrigin || "-"}
      </div>
    </div>

    <div className="
      grid
      grid-cols-2
    ">
      <div className="
        bg-gray-50
        p-3
        font-semibold
      ">
        Category
      </div>

      <div className="p-3">
        {product.category || "-"}
      </div>
    </div>

  </div>

</div>    

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
    

      </div>
    </div>
    {/* RELATED PRODUCTS */}

      <div
  className="
    max-w-7xl
    mx-auto
    mt-10
    px-4
  "
>

        <h2 className="
  text-3xl
  font-bold
  mb-6
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
    <div className="
  max-w-7xl
  mx-auto
  mt-10
  px-4
">

  <div className="
    bg-white
    rounded-3xl
    p-6
    shadow
  ">

    <h2 className="
      text-2xl
      font-bold
      mb-5
    ">
      Product Questions
    </h2>

    <div className="
      flex
      gap-3
      mb-6
    ">

      <input

        type="text"

        value={question}

        onChange={(e)=>

          setQuestion(
            e.target.value
          )

        }

        placeholder="
        Ask a question..."

        className="
          flex-1
          border
          p-3
          rounded-xl
        "
      />

      <button

        onClick={
          askQuestion
        }

        className="
          bg-blue-600
          text-white
          px-6
          rounded-xl
        "
      >

        Ask

      </button>

    </div>

    <div className="
      space-y-4
    ">

      {questions.map((q:any)=>(

        <div
          key={q.id}
          className="
            border-b
            pb-4
          "
        >

          <p className="
            font-semibold
          ">
            ❓ {q.question}
          </p>

          <p className="
            text-sm
            text-gray-500
          ">
            {q.customerName}
          </p>

          {q.answer && (

            <div className="
              bg-green-50
              p-3
              rounded-xl
              mt-3
            ">

              <p className="
                font-semibold
              ">
                ✅ Seller Answer
              </p>

              <p>
                {q.answer}
              </p>

            </div>

          )}

        </div>

      ))}

    </div>

  </div>

</div>

       {/* REVIEWS */}

      <div className="
  max-w-7xl
  mx-auto
  mt-10
  px-4
">

  <div className="
    bg-white
    rounded-3xl
    p-6
    shadow
  ">

    <h2 className="
      text-2xl
      font-bold
      mb-5
    ">
      Reviews & Ratings
    </h2>

    <div className="
      flex
      gap-3
      mb-4
    ">

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
          p-3
          rounded-xl
        "
      >

        <option value={5}>
          ⭐⭐⭐⭐⭐
        </option>

        <option value={4}>
          ⭐⭐⭐⭐
        </option>

        <option value={3}>
          ⭐⭐⭐
        </option>

        <option value={2}>
          ⭐⭐
        </option>

        <option value={1}>
          ⭐
        </option>

      </select>

      <input

        value={reviewText}

        onChange={(e)=>

          setReviewText(
            e.target.value
          )

        }

        placeholder="
        Write review..."

        className="
          flex-1
          border
          p-3
          rounded-xl
        "
      />

      <button

        onClick={
          submitReview
        }

        className="
          bg-green-600
          text-white
          px-5
          rounded-xl
        "
      >

        Submit

      </button>

    </div>

    <div className="
      space-y-4
    ">

      {reviews.map((review:any)=>(

        <div
          key={review.id}
          className="
            border-b
            pb-4
          "
        >

          <p className="
            font-semibold
          ">
            {"⭐".repeat(
              review.rating
            )}
          </p>

          <p className="
            font-semibold
          ">
            {review.customerName}
          </p>

          <p className="
            text-gray-600
          ">
            {review.review}
          </p>

        </div>

      ))}

    </div>

  </div>

</div>

{
  showSizeChart && (

    <div className="
      fixed
      inset-0
      bg-black/50
      flex
      items-center
      justify-center
      z-50
    ">

      <div className="
        bg-white
        p-6
        rounded-2xl
        w-80
      ">

        <h2 className="
          text-xl
          font-bold
          mb-4
        ">
          Size Chart
        </h2>

        <div className="
          space-y-2
        ">

          <p>S = 36</p>
          <p>M = 38</p>
          <p>L = 40</p>
          <p>XL = 42</p>
          <p>XXL = 44</p>

        </div>

        <button
          onClick={() =>
            setShowSizeChart(false)
          }
          className="
            mt-4
            w-full
            bg-blue-600
            text-white
            py-2
            rounded-xl
          "
        >
          Close
        </button>

      </div>

    </div>

  )
}

<div className="
  md:hidden
  fixed
  bottom-16
  left-0
  right-0
  bg-white
  border-t
  p-3
  flex
  gap-2
  z-40
">
  <button
    onClick={addToCart}
    className="
      flex-1
      bg-green-600
      text-white
      py-3
      rounded-xl
      font-bold
    "
  >
    Cart
  </button>

  <Link
    href="/checkout"
    className="
      flex-1
      bg-blue-600
      text-white
      py-3
      rounded-xl
      text-center
      font-bold
    "
  >
    Buy Now
  </Link>
</div>

       </>

);
}