"use client";

import { useEffect, useState }
from "react";

import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import {
  auth,
  db
} from "@/lib/firebase";
import {
  useRouter
} from "next/navigation";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

import { storage }
from "@/lib/firebase";

type Product = {

  id:string;

  name:string;

  price:number;

  image:string;

  stock:number;

  category:string;

};

type Order = {

  id:string;

  customer:string;

  amount:number;

  status:string;

  date:string;

};

export default function SellerPage(){
  const router =
  useRouter();
  const [totalProducts,setTotalProducts] =
  useState(0);

const [totalOrders,setTotalOrders] =
  useState(0);

const [pendingOrders,setPendingOrders] =
  useState(0);

const [earnings,setEarnings] =
  useState(0);

  const [products,setProducts] =
    useState<Product[]>([]);

  const [orders,setOrders] =
    useState<Order[]>([]);

  const [name,setName] =
    useState("");

  const [price,setPrice] =
    useState("");

  const [stock,setStock] =
    useState("");

  const [category,setCategory] =
    useState("Grocery");
  const [vendorName,setVendorName] =
  useState("");  

  const [image,setImage] =
    useState("");
    const [imageFile,setImageFile] =
  useState<any>(null);

  const [description,setDescription] =
  useState("");  

  const [loading,setLoading] =
    useState(false);

  const [editingId,setEditingId] =
    useState("");

  const handleImage = (
    e:any
  )=>{

    const file =
      e.target.files[0];

    if(!file) return;

    const reader =
      new FileReader();
      
    reader.onloadend = ()=>{

      setImage(
        reader.result as string
      );

    };

    reader.readAsDataURL(file);

  };
   async function loadProducts(){

  if(!auth.currentUser) return;

  const q = query(

    collection(
      db,
      "products"
    ),

    where(

      "vendorId",

      "==",

      auth.currentUser.uid

    )

  );

  const productSnapshot =
    await getDocs(q);

  const items:Product[] = [];

  productSnapshot.forEach((docItem)=>{

    items.push({

      id:docItem.id,

      ...docItem.data()

    } as Product);

  });

  setProducts(items);

}

  useEffect(()=>{
    const vendor =
  localStorage.getItem(
    "vendor"
  );

if(!vendor){

   alert(
    "Please login as vendor"
  );
   router.push(
    "/vendor-login"
  );

  return;

}

  loadProducts();

  fetchDashboardData();
  loadVendorOrders();

},[]);

const loadVendorOrders =
async()=>{

  const user =
    auth.currentUser;

  if(!user) return;

  const vendorId =
    user.uid;

  const snapshot =
    await getDocs(

      collection(
        db,
        "orders"
      )

    );

  const vendorOrders:any[] =
    [];

  snapshot.forEach((docSnap)=>{

    const order =
      docSnap.data();

    const sellerItems =

      order.items.filter(

        (item:any)=>

          item.vendorId ===
          vendorId

      );

    if(
      sellerItems.length > 0
    ){

      vendorOrders.push({

        id:docSnap.id,

        customer:
          order.customerName,

        amount:
          sellerItems.reduce(

            (
              sum:number,
              item:any
            )=>

              sum +
              item.price *
              item.qty,

            0

          ),

        status:
          order.status,

        date:
          order.createdAt
          ?.toDate()
          ?.toLocaleDateString()

      });

    }

  });

  setOrders(vendorOrders);

};

const clearForm = ()=>{

    setName("");
    setPrice("");
    setStock("");
    setCategory("Grocery");
    setImage("");
    setEditingId("");

  };

  const addOrUpdateProduct =
    async ()=>{

    if(
      !name ||
      !price ||
      !stock ||
      !imageFile
    ){

      alert("Fill All Fields");

      return;

    }

    try{

      setLoading(true);

      if(editingId){

        let imageUrl = image;

if(imageFile){

  const imageRef =

    ref(

      storage,

      `products/${Date.now()}`

    );

  await uploadBytes(

    imageRef,

    imageFile

  );

  imageUrl =

    await getDownloadURL(
      imageRef
    );

}

await updateDoc(

  doc(
    db,
    "products",
    editingId
  ),

  {

    name,

    price:Number(price),

    stock:Number(stock),

    category,

    description,

    image:imageUrl

  }

);

        alert("Product Updated");

      }else{

        let imageUrl = "";

if(imageFile){

  const imageRef =

    ref(

      storage,

      `products/${Date.now()}`

    );

  await uploadBytes(

    imageRef,

    imageFile

  );

  imageUrl =

    await getDownloadURL(
      imageRef
    );

}
      
         
await addDoc(
  collection(db,"products"),

  {

    name,

    price:Number(price),

    stock:Number(stock),

    category,

    description,

    image:imageUrl,

    vendorId:
      auth.currentUser?.uid,

    vendorName:
  vendorName,

    createdAt:new Date()

  }

);

        alert("Product Added");

      }

      clearForm();

      loadProducts();

    }catch(err:any){

      alert(err.message);

    }finally{

      setLoading(false);

    }

  };

  const editProduct = (
    product:Product
  )=>{

    setName(product.name);

    setPrice(
      product.price.toString()
    );

    setStock(
      product.stock.toString()
    );

    setCategory(
      product.category
    );

    setImage(product.image);

    setDescription(
  (product as any)
  .description || ""
);

    setEditingId(product.id);

    window.scrollTo({

      top:0,

      behavior:"smooth"

    });

  };

  const deleteProduct = async (
    id:string
  )=>{

    await deleteDoc(
      doc(db,"products",id)
    );

    loadProducts();

  };

  const updateOrderStatus =
async (
  id:string,
  status:string
)=>{

  try{

    await updateDoc(

      doc(
        db,
        "orders",
        id
      ),

      {

        status

      }

    );

    const updated =
      orders.map(

        (order:any)=>{

        if(
          order.id === id
        ){

          return {

            ...order,

            status

          };

        }

        return order;

      });

    setOrders(updated);

    alert(
      "Order status updated"
    );

  }catch(error){

    console.log(error);

    alert(
      "Failed to update"
    );

  }

};

const fetchDashboardData =
async ()=>{

  const user =
    auth.currentUser;

  if(!user) return;

  const vendorId =
    user.uid;

  // PRODUCTS

  const productQuery = query(

    collection(db,"products"),

    where(
      "vendorId",
      "==",
      vendorId
    )

  );

  const productSnap =
    await getDocs(
      productQuery
    );

  setTotalProducts(
    productSnap.size
  );

  // ORDERS

  const ordersSnap =
    await getDocs(
      collection(db,"orders")
    );

  let ordersCount = 0;

  let pendingCount = 0;

  let totalEarnings = 0;

  ordersSnap.forEach((docSnap)=>{

    const order =
  docSnap.data();

    const sellerItems =

      order.items.filter(

        (item: any)=>

          item.vendorId ===
          vendorId

      );

    if(
      sellerItems.length > 0
    ){

      ordersCount++;

      if(
        order.status ===
        "Pending"
      ){

        pendingCount++;

      }

      sellerItems.forEach(
        (item: any)=>{

          totalEarnings +=

            item.price *
            item.qty;

        }
      );

    }

  });

  setTotalOrders(
    ordersCount
  );

  setPendingOrders(
    pendingCount
  );

  setEarnings(
    totalEarnings
  );

};

 return (

    <div className="min-h-screen bg-gray-100">

      {/* HEADER */}

      <div
        className="
          bg-blue-600
          text-white
          px-8
          py-5
          flex
          justify-between
          items-center
        "
      >

        <div>

          <h1 className="text-4xl font-bold">
            Yogi Mart
          </h1>

          <p>

  Welcome,

  {" "}

  {auth.currentUser?.email}

</p>

        </div>

        <div className="flex gap-8">

  <button

    onClick={()=>

      window.scrollTo({

        top:0,

        behavior:"smooth"

      })

    }

  >
    Dashboard
  </button>

  <button

    onClick={()=>{

      document
        .getElementById("orders")
        ?.scrollIntoView({

          behavior:"smooth"

        });

    }}

  >
    Orders
  </button>

  <button

    onClick={()=>{

      document
        .getElementById("products")
        ?.scrollIntoView({

          behavior:"smooth"

        });

    }}

  >
    Products
  </button>

  <button

    onClick={async ()=>{

      const {
        signOut
      } = await import(
        "firebase/auth"
      );

      await signOut(auth);

      window.location.href =
        "/vendor-login";

    }}

  >
    Logout
  </button>

</div>
      </div>

      <div className="max-w-7xl mx-auto p-8">

        {/* STATS */}

        <div
          className="
            grid
            grid-cols-1
            md:grid-cols-2
            lg:grid-cols-4
            gap-6
            mb-8
          "
        >

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-4">
              Total Products
            </h2>

            <p className="text-5xl font-bold text-blue-600">
              {totalProducts}
            </p>

          </div>

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-4">
              Total Orders
            </h2>

            <p className="text-5xl font-bold text-green-600">
              {totalOrders}
            </p>

          </div>

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-4">
              Pending Orders
            </h2>

            <p className="text-5xl font-bold text-yellow-500">

              {pendingOrders}
            </p>

          </div>

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-4">
              Earnings
            </h2>

            <p className="text-5xl font-bold text-pink-600">

              ₹{earnings}
              </p>

          </div>

        </div>

        {/* MAIN */}

        <div
          className="
            grid
            grid-cols-1
            lg:grid-cols-3
            gap-8
          "
        >

          {/* FORM */}

          <div
            className="
              bg-white
              p-8
              rounded-2xl
              shadow
            "
          >

            <h2 className="text-3xl font-bold mb-8">

              {editingId
                ? "Edit Product"
                : "Add Product"}

            </h2>

            <div className="space-y-5">

              <input
                type="text"
                placeholder="Product Name"
                value={name}
                onChange={(e)=>
                  setName(e.target.value)
                }
                className="
                  w-full
                  p-4
                  border
                  rounded-xl
                "
              />

              <input
                type="number"
                placeholder="Price"
                value={price}
                onChange={(e)=>
                  setPrice(e.target.value)
                }
                className="
                  w-full
                  p-4
                  border
                  rounded-xl
                "
              />

              <input
                type="number"
                placeholder="Stock"
                value={stock}
                onChange={(e)=>
                  setStock(e.target.value)
                }
                className="
                  w-full
                  p-4
                  border
                  rounded-xl
                "
              />
              <textarea
  placeholder="Product Description"
  value={description}
  onChange={(e)=>
    setDescription(
      e.target.value
    )
  }
  className="
    w-full
    p-4
    border
    rounded-2xl
    h-32
  "
/>
              <select
                value={category}
                onChange={(e)=>
                  setCategory(e.target.value)
                }
                className="
                  w-full
                  p-4
                  border
                  rounded-xl
                "
              >

                <option>
                  Grocery
                </option>

                <option>
                  Fashion
                </option>

                <option>
                  Beauty
                </option>

                <option>
                  Electronics
                </option>

              </select>

              <input

  type="file"

  accept="image/*"

  onChange={(e)=>{

    if(
      e.target.files
    ){

      setImageFile(
        e.target.files[0]
      );

      const reader =
  new FileReader();

reader.onloadend = ()=>{

  setImage(
    reader.result as string
  );

};

reader.readAsDataURL(

  e.target.files[0]

);

    }

  }}

  className="
    w-full
    border
    p-4
    rounded-xl
  "
/>
           {image && (

                <img
                  src={image}
                  alt="Preview"
                  className="
                    w-40
                    h-40
                    object-cover
                    rounded-xl
                  "
                />

              )}

              <button

                onClick={
                  addOrUpdateProduct
                }

                disabled={loading}

                className="
                  w-full
                  bg-blue-600
                  text-white
                  py-4
                  rounded-xl
                  text-lg
                  font-semibold
                "
              >

                {loading
                  ? "Saving..."
                  : editingId
                  ? "Update Product"
                  : "Add Product"}

              </button>

            </div>

          </div>

          {/* PRODUCTS */}

          <div
          id="products"
            className="
              lg:col-span-2
              bg-white
              p-8
              rounded-2xl
              shadow
            "
          >

            <h2 className="text-3xl font-bold mb-8">
              Products
            </h2>

            <div className="space-y-6">

              {products.map((product)=>(

                <div

                  key={product.id}

                  className="
                    flex
                    items-center
                    justify-between
                    border-b
                    pb-6
                  "
                >

                  <div className="flex gap-5">

                    <img
                      src={product.image}
                      alt={product.name}
                      className="
                        w-24
                        h-24
                        object-cover
                        rounded-xl
                      "
                    />

                    <div>

                      <h3 className="text-2xl font-bold">
                        {product.name}
                      </h3>

                      <p className="text-lg">
                        ₹{product.price}
                      </p>

                      <p className="text-sm text-gray-500">
                        {product.category}
                      </p>

                      <p className="text-sm">

                       Stock:
                        {" "}
                        {product.stock}

                        </p>

                      {product.stock > 0 &&
                      product.stock <= 5 && (

                     <p
                    className=" text-red-500
                    font-semibold
                   text-sm
                    mt-1
                     "
                    >

                  Low Stock

                   </p>

                  )}
                    </div>

                  </div>

                  <div className="flex gap-3">

                    <button

                      onClick={()=>
                        editProduct(product)
                      }

                      className="
                        bg-blue-600
                        text-white
                        px-5
                        py-3
                        rounded-xl
                      "
                    >
                      Edit
                    </button>

                    <button

                      onClick={()=>
                        deleteProduct(product.id)
                      }

                      className="
                        bg-red-500
                        text-white
                        px-5
                        py-3
                        rounded-xl
                      "
                    >
                      Delete
                    </button>

                  </div>

                </div>

              ))}

            </div>

          </div>

        </div>

        {/* ORDERS */}

        <div
        id="orders"
          className="
            bg-white
            p-8
            rounded-2xl
            shadow
            mt-10
          "
        >

          <h2 className="text-3xl font-bold mb-8">
            Recent Orders
          </h2>

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead>

                <tr className="border-b">

                  <th className="text-left py-4">
                    Order ID
                  </th>

                  <th className="text-left py-4">
                    Customer
                  </th>

                  <th className="text-left py-4">
                    Amount
                  </th>

                  <th className="text-left py-4">
                    Status
                  </th>

                  <th className="text-left py-4">
                    Date
                  </th>

                </tr>

              </thead>

              <tbody>

                {orders.map((order)=>(

                  <tr
                    key={order.id}
                    className="border-b"
                  >

                    <td className="py-5">
                      {order.id}
                    </td>

                    <td>
                      {order.customer}
                    </td>

                    <td>
                      ₹{order.amount}
                    </td>

                    <td>

                      <select

                        value={order.status}

                        onChange={(e)=>

                          updateOrderStatus(

                            order.id,
                            e.target.value

                          )

                        }

                        className="
                          border
                          p-2
                          rounded-lg
                        "
                      >

                        <option>
                          Pending
                        </option>

                        <option>
                          Shipped
                        </option>

                        <option>
                          Delivered
                        </option>

                      </select>

                    </td>

                    <td>
                      {order.date}
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </div>

      </div>

    </div>

  );

}
