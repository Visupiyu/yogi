"use client";

import { useEffect, useState } from "react";

import Image from "next/image";

import {
collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { toast } from "sonner";

type Product = {

  id:string;

  name:string;

  image:string;

  category:string;

  vendorName:string;

  price:number;

  stock:number;

  sales:number;

  status?:string;

};

export default function AdminProductsPage(){

  const [products,setProducts]=
    useState<Product[]>([]);

  const [loading,setLoading]=
    useState(true);

  const [search,setSearch]=
    useState("");

  const [categoryFilter,setCategoryFilter]=
    useState("All");
    const [vendorFilter,setVendorFilter]=
useState("All");

  useEffect(()=>{

    loadProducts();

  },[]);

  const loadProducts=async()=>{

    try{

      const snapshot=await getDocs(

        query(

          collection(db,"products"),

          orderBy("createdAt","desc")

        )

      );

      const items:Product[]=[];

      snapshot.forEach((docSnap)=>{

        const data:any=docSnap.data();

        items.push({

          id:docSnap.id,

          name:data.name || "Product",

          image:data.image || "",

          category:data.category || "Others",

          vendorName:data.vendorName || "Unknown",

          price:data.price || 0,

          stock:data.stock || 0,

          sales:data.sales || 0,

          status:data.status || "Active",

        });

      });

      setProducts(items);

    }

    catch(error){

      console.error(error);

    }

    finally{

      setLoading(false);

    }

  };

 const filtered = products.filter((item)=>{

  const searchMatch =

    item.name
      .toLowerCase()
      .includes(search.toLowerCase())

    ||

    item.vendorName
      .toLowerCase()
      .includes(search.toLowerCase());

  const categoryMatch =

    categoryFilter==="All"

    ||

    item.category===categoryFilter;

  const vendorMatch =

    vendorFilter==="All"

    ||

    item.vendorName===vendorFilter;

  return(

    searchMatch &&

    categoryMatch &&

    vendorMatch

  );

});

  const totalProducts=products.length;

  const activeProducts=
    products.filter(
      p=>p.status==="Active"
    ).length;

  const outOfStock=
    products.filter(
      p=>p.stock<=0
    ).length;

  const lowStock=
    products.filter(
      p=>p.stock>0 && p.stock<=5
    ).length;

    const toggleStatus = async (

  product: Product

) => {

  try {

    await updateDoc(

      doc(
        db,
        "products",
        product.id
      ),

      {

        status:

          product.status === "Active"

            ? "Blocked"

            : "Active",

      }

    );

    toast.success(

      "Product updated."

    );

    loadProducts();

  } catch (error) {

    console.error(error);

    toast.error(

      "Failed to update product."

    );

  }

};

const deleteProduct = async (

  id: string

) => {

  if (

    !confirm(

      "Delete this product?"

    )

  ) {

    return;

  }

  try {

    await deleteDoc(

      doc(
        db,
        "products",
        id
      )

    );

    toast.success(

      "Product deleted."

    );

    loadProducts();

  } catch (error) {

    console.error(error);

    toast.error(

      "Delete failed."

    );

  }

};

  const categories=[
    "All",
    ...new Set(
      products.map(
        p=>p.category
      )
    ),
  ];
  const vendors=[

"All",

...new Set(

products.map(

p=>p.vendorName

)

),

];

const exportCSV=()=>{

const rows=[

[

"Product",

"Vendor",

"Category",

"Price",

"Stock",

"Sales",

"Status"

],

...filtered.map(p=>([

p.name,

p.vendorName,

p.category,

p.price,

p.stock,

p.sales,

p.status

]))

];

const csv=

rows

.map(

r=>r.join(",")

)

.join("\n");

const blob=

new Blob(

[csv],

{

type:"text/csv"

}

);

const url=

URL.createObjectURL(blob);

const a=

document.createElement("a");

a.href=url;

a.download=

"products.csv";

a.click();

URL.revokeObjectURL(url);

};

  return(

<div className="min-h-screen bg-gray-100 p-6">

<div className="max-w-7xl mx-auto">

<div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">

<h1 className="text-4xl font-bold">

📦 Marketplace Products

</h1>

<p className="mt-2">

Manage all marketplace products

</p>

</div>

<div className="grid md:grid-cols-4 gap-5 mb-8">

<div className="bg-white rounded-2xl shadow p-6">

<p>Total Products</p>

<h2 className="text-3xl font-bold">

{totalProducts}

</h2>

</div>

<div className="bg-white rounded-2xl shadow p-6">

<p>Active</p>

<h2 className="text-3xl font-bold text-green-600">

{activeProducts}

</h2>

</div>

<div className="bg-white rounded-2xl shadow p-6">

<p>Low Stock</p>

<h2 className="text-3xl font-bold text-yellow-600">

{lowStock}

</h2>

</div>

<div className="bg-white rounded-2xl shadow p-6">

<p>Out Of Stock</p>

<h2 className="text-3xl font-bold text-red-600">

{outOfStock}

</h2>

</div>

</div>
<div className="flex justify-end mb-5">

<button

onClick={exportCSV}

className="

bg-green-600

text-white

px-6

py-3

rounded-xl

"

>

📥 Export CSV

</button>

</div>

<div className="grid md:grid-cols-3 gap-4 mb-8">

<input

placeholder="Search product or vendor..."

value={search}

onChange={(e)=>

setSearch(e.target.value)

}

className="border rounded-xl p-4"

/>

<select

value={categoryFilter}

onChange={(e)=>

setCategoryFilter(

e.target.value

)

}

className="border rounded-xl p-4"

>

{

categories.map((cat)=>(

<option

key={cat}

>

{cat}

</option>

))

}

</select>

</div>
<select

value={vendorFilter}

onChange={(e)=>

setVendorFilter(

e.target.value

)

}

className="border rounded-xl p-4"

>

{

vendors.map((vendor)=>(

<option

key={vendor}

>

{vendor}

</option>

))

}

</select>

{

loading

?

<div className="bg-white rounded-2xl p-10 text-center">

Loading...

</div>

:

<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

{

filtered.map((product)=>(

<div

key={product.id}

className="bg-white rounded-3xl shadow p-5"

>
<div className="relative h-48">
<Image
  src={product.image || "/placeholder.png"}
  alt={product.name}
  fill  
  loading="eager"
  sizes="(max-width:768px) 100vw, (max-width:1200px) 50vw, 33vw"
  className="object-cover rounded-2xl"
/>
</div>

<h2 className="text-xl font-bold mt-4">

{product.name}

</h2>

<p>

🏪 {product.vendorName}

</p>

<p>

📂 {product.category}

</p>

<p>

💰 ₹{product.price}

</p>

<p>

📦 Stock: {product.stock}

</p>

<p>

🔥 Sales: {product.sales}

</p>
<div className="flex gap-2 mt-4">

  <span
    className={`
      px-3
      py-1
      rounded-full
      text-xs
      font-bold
      ${
        product.status === "Active"
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      }
    `}
  >
    {product.status}
  </span>

  {product.stock <= 0 ? (

    <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs">
      Out Of Stock
    </span>

  ) : product.stock <= 5 ? (

    <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs">
      Low Stock
    </span>

  ) : null}

</div>

<div className="flex gap-3 mt-5">

  <button
    onClick={() => toggleStatus(product)}
    className={`
      flex-1
      py-2
      rounded-xl
      text-white
      ${
        product.status === "Active"
          ? "bg-yellow-600"
          : "bg-green-600"
      }
    `}
  >
    {product.status === "Active"
      ? "Block"
      : "Activate"}
  </button>

  <button
    onClick={() => deleteProduct(product.id)}
    className="flex-1 bg-red-600 text-white py-2 rounded-xl"
  >
    Delete
  </button>

</div>

</div>

))

}

</div>

}

</div>

</div>

);

}