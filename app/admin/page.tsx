"use client";

import { useEffect, useState }
from "react";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc
} from "firebase/firestore";
import {

  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer

} from "recharts";

import { db }
from "@/lib/firebase";

import {
  auth
} from "@/lib/firebase";

import {
  useRouter
} from "next/navigation";

type Vendor = {

  id:string;

  fullName:string;

  businessName:string;

  businessPhone:string;

  businessType:string;

  city:string;

  state:string;

  status:string;

};

type Product = {

  id:string;

  name:string;

  image:string;

  price:number;

  stock:number;

};

type Order = {

  id:string;

  customerName:string;

  total:number;

  status:string;

  paymentMethod?:string;

};

type Customer = {

  id:string;

  name?:string;

  email?:string;

  totalOrders?:number;

  totalSpent?:number;

};

type Coupon = {

  id:string;

  code:string;

  type:string;

  value:number;

  expiry:string;

};

export default function
AdminPage(){

  const router =
  useRouter();
  const [vendors,setVendors] =
    useState<Vendor[]>([]);

  const [products,setProducts] =
    useState<Product[]>([]);

  const [orders,setOrders] =
    useState<Order[]>([]);

    const [customers,
setCustomers] =
  useState<Customer[]>([]);

  const [totalOrders,
  setTotalOrders] =
    useState(0);

  const [totalRevenue,
  setTotalRevenue] =
    useState(0);

    const [coupons,
setCoupons] =
  useState<Coupon[]>([]);

const [couponCode,
setCouponCode] =
  useState("");

const [couponType,
setCouponType] =
  useState("percent");

const [couponValue,
setCouponValue] =
  useState("");

const [couponExpiry,
setCouponExpiry] =
  useState("");

  const [notifications,
setNotifications] =
  useState<string[]>([]);

  const [loading,setLoading] =
    useState(true);

    const adminEmails = [

  "adminyogimart@gmail.com"

];

    const chartData = [

  {
    name:"Products",
    value:products.length
  },

  {
    name:"Orders",
    value:totalOrders
  },

  {
    name:"Customers",
    value:customers.length
  },

  {
    name:"Revenue",
    value:Math.floor(
      totalRevenue / 100
    )
  }

];

  async function loadVendors(){

    const snapshot =
      await getDocs(

        collection(
          db,
          "vendors"
        )

      );

    const items:Vendor[] = [];

    snapshot.forEach((docItem)=>{

      items.push({

        id:docItem.id,

        ...docItem.data()

      } as Vendor);

    });

    setVendors(items);

  }

  async function loadProducts(){

    /* PRODUCTS */

    const snapshot =
      await getDocs(

        collection(
          db,
          "products"
        )

      );

    const items:Product[] = [];

    snapshot.forEach((docItem)=>{

      items.push({

        id:docItem.id,

        ...docItem.data()

      } as Product);

    });

    setProducts(items);

    /* ORDERS */

    const ordersSnapshot =
      await getDocs(

        collection(
          db,
          "orders"
        )

      );

    setTotalOrders(
      ordersSnapshot.size
    );

    let revenue = 0;

    const orderItems:Order[] = [];

    ordersSnapshot.forEach(
      (docItem)=>{

        const order =
          docItem.data();

        if(order.items){

          order.items.forEach(
            (item:any)=>{

              revenue +=

                item.price *
                item.qty;

            }
          );

        }

        orderItems.push({

          id:docItem.id,

          ...order

        } as Order);

      }
    );

    setTotalRevenue(
      revenue
    );

    setOrders(orderItems);

    const customerMap:any = {};

ordersSnapshot.forEach(
  (docItem)=>{

    const order =
      docItem.data();

    const email =
      order.userEmail ||
      "unknown";

    if(!customerMap[email]){

      customerMap[email] = {

        id: docItem.id,

        email,

        totalOrders: 0,

        totalSpent: 0,

      };

    }

   customerMap[email]
  .totalOrders += 1;

customerMap[email]
  .totalSpent +=

  order.total || 0;

});

setCustomers(

  Object.values(
    customerMap
  )

);

const couponSnapshot =
  await getDocs(

    collection(
      db,
      "coupons"
    )

  );

const couponItems:Coupon[] =
  [];

couponSnapshot.forEach(
  (docItem)=>{

    couponItems.push({

      id:docItem.id,

      ...docItem.data()

    } as Coupon);

  }
);

setCoupons(couponItems);

const alerts:string[] = [];

/* LOW STOCK */

items.forEach((product)=>{

  if(product.stock < 5){

    alerts.push(

      `⚠️ Low stock:
       ${product.name}`

    );

  }

});

/* PENDING VENDORS */

vendors.forEach((vendor)=>{

  if(
    vendor.status ===
    "Pending"
  ){

    alerts.push(

      `🛒 Pending vendor:
       ${vendor.businessName}`

    );

  }

});

/* NEW ORDERS */

if(
  ordersSnapshot.size > 0
){

  alerts.push(

    `📦 Total Orders:
     ${ordersSnapshot.size}`

  );

}

setNotifications(alerts);
}

  /* REJECT */
const approveVendor =
async (
  id:string
)=>{

  await updateDoc(

    doc(
      db,
      "vendors",
      id
    ),

    {

      status:"Approved"

    }

  );

  loadVendors();

};

useEffect(()=>{


  async function init(){

   const currentUser =
  auth.currentUser;
if(!currentUser){

  router.push("/login");

  return;

}

const user =
  auth.currentUser;

if(

  !adminEmails.includes(
    currentUser?.email || ""
  )

){

  alert(
    "Not Admin Account"
  );

  return;

}

    await loadVendors();

    await loadProducts();

    setLoading(false);

  }

  init();

},[]); 

const rejectVendor =
async (
  id:string
)=>{

  await updateDoc(

    doc(
      db,
      "vendors",
      id
    ),

    {

      status:"Rejected"

    }

  );

  loadVendors();

};
    /* DELETE PRODUCT */

  const deleteProduct =
  async (
    id:string
  )=>{

    await deleteDoc(

      doc(
        db,
        "products",
        id
      )

    );

    loadProducts();

  };

  const deleteCoupon =
async (
  id:string
)=>{

  await deleteDoc(

    doc(
      db,
      "coupons",
      id
    )

  );

  loadProducts();

};

  const createCoupon =
async()=>{

  if(

    !couponCode ||
    !couponValue ||
    !couponExpiry

  ){

    const today =

  new Date()
  .toISOString()
  .split("T")[0];

if(
  couponExpiry < today
){

  alert(
    "Coupon expiry invalid"
  );

  return;

}

    alert(
      "Fill all coupon fields"
    );

    return;

  }

  await addDoc(

    collection(
      db,
      "coupons"
    ),

    {

      code: couponCode,

      type: couponType,

      value:Number(
        couponValue
      ),

      expiry: couponExpiry,

    }

  );

  setCouponCode("");

  setCouponValue("");

  setCouponExpiry("");

  loadProducts();

};

  /* UPDATE ORDER */

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

      await loadProducts();

    }catch(error){

      console.log(error);

    }

  };

  if(loading){

    return(

      <div className="
        p-10
      ">
        Loading Admin Dashboard...
      </div>

      

    );

  }

  return (

    <div className="
      min-h-screen
      bg-gray-100
    ">

      {/* HEADER */}

      <div className="
        bg-black
        text-white
        px-8
        py-5
        flex
        justify-between
        items-center
      ">

        <div>

          <h1 className="
            text-4xl
            font-bold
          ">
            Yogi Mart
          </h1>

          <p>
            👑 Admin Dashboard
          </p>

          <div className="
  mt-4
  inline-block
  bg-yellow-400
  text-black
  px-4
  py-2
  rounded-full
  font-bold
">

  🔔
  {notifications.length}
  Notifications

</div>
<button

  onClick={async()=>{

    const {
      signOut
    } = await import(
      "firebase/auth"
    );

    await signOut(auth);

    window.location.href =
      "/login";

  }}

  className="
    mt-4
    bg-red-500
    px-6
    py-3
    rounded-xl
    font-semibold
  "
>

  Logout

</button>

        </div>

      </div>

      <div className="
        max-w-7xl
        mx-auto
        p-8
      ">

        {/* STATS */}

        <div className="
          grid
          grid-cols-1
          md:grid-cols-6
          gap-5
          mb-10
        ">

          <div className="
            bg-white
            p-8
            rounded-2xl
            shadow
          ">

            <h2 className="
              text-2xl
              font-bold
              mb-4
            ">
              Total Vendors
            </h2>

            <p className="
              text-5xl
              font-bold
              text-blue-600
            ">
              {vendors.length}
            </p>

          </div>

          <div className="
            bg-white
            p-8
            rounded-2xl
            shadow
          ">

            <h2 className="
              text-2xl
              font-bold
              mb-4
            ">
              Approved Vendors
            </h2>

            <p className="
              text-5xl
              font-bold
              text-green-600
            ">

              {
                vendors.filter(
                  (v)=>
                    v.status ===
                    "Approved"
                ).length
              }

            </p>

          </div>

          <div className="
            bg-white
            p-8
            rounded-2xl
            shadow
          ">

            <h2 className="
              text-2xl
              font-bold
              mb-4
            ">
              Total Products
            </h2>

            <p className="
              text-5xl
              font-bold
              text-pink-600
            ">
              {products.length}
            </p>

          </div>

          <div className="
            bg-white
            p-8
            rounded-2xl
            shadow
          ">

            <h2 className="
              text-2xl
              font-bold
              mb-4
            ">
              Total Orders
            </h2>

            <p className="
              text-5xl
              font-bold
              text-orange-600
            ">
              {totalOrders}
            </p>

          </div>

          <div className="
            bg-white
            p-8
            rounded-2xl
            shadow
          ">

            <h2 className="
              text-2xl
              font-bold
              mb-4
            ">
              Revenue
            </h2>

            <p className="
              text-5xl
              font-bold
              text-green-600
            ">
              ₹{totalRevenue}
            </p>

          </div>
          <div className="
  bg-white
  p-8
  rounded-2xl
  shadow
">

  <h2 className="
    text-2xl
    font-bold
    mb-4
  ">
    Customers
  </h2>

  <p className="
    text-5xl
    font-bold
    text-purple-600
  ">
    {customers.length}
  </p>

</div>

        </div>

        <div className="
  bg-white
  p-8
  rounded-2xl
  shadow
">

  <h2 className="
    text-2xl
    font-bold
    mb-4
  ">
    Customers
  </h2>

  <p className="
    text-5xl
    font-bold
    text-purple-600
  ">
    {customers.length}
  </p>

</div>
{/* NOTIFICATIONS */}

<div className="
  bg-white
  rounded-2xl
  shadow
  p-8
  mb-10
">

  <h2 className="
    text-3xl
    font-bold
    mb-8
  ">
    Notifications
  </h2>

  <div className="
    space-y-4
  ">

    {notifications.length === 0 && (

      <p>
        No Notifications
      </p>

    )}

    {notifications.map(
      (
        item,
        index
      )=>(

      <div

        key={index}

        className="
          bg-gray-100
          p-4
          rounded-xl
        "
      >

        {item}

      </div>

    ))}

  </div>

</div>
{/* ANALYTICS CHART */}

<div className="
  bg-white
  rounded-2xl
  shadow
  p-8
  mb-10
">

  <h2 className="
    text-3xl
    font-bold
    mb-8
  ">
    Marketplace Analytics
  </h2>

  <div className="
    w-full
    h-[400px]
     min-w-0
  ">

    <ResponsiveContainer
      width="99%"
  height={400}
    >

      <BarChart
        data={chartData}
      >

        <XAxis
          dataKey="name"
        />

        <YAxis />

        <Tooltip />

        <Bar
          dataKey="value"
        />

      </BarChart>

    </ResponsiveContainer>

  </div>

</div>

{/* COUPONS */}

<div className="
  bg-white
  rounded-2xl
  shadow
  p-8
  mb-10
">

  <h2 className="
    text-3xl
    font-bold
    mb-8
  ">
    Coupon Management
  </h2>

  <div className="
    grid
    grid-cols-1
    md:grid-cols-4
    gap-4
    mb-8
  ">

    <input
      type="text"
      placeholder="Coupon Code"
      value={couponCode}
      onChange={(e)=>
        setCouponCode(
          e.target.value
        )
      }
      className="
        border
        p-4
        rounded-xl
      "
    />

    <select
      value={couponType}
      onChange={(e)=>
        setCouponType(
          e.target.value
        )
      }
      className="
        border
        p-4
        rounded-xl
      "
    >

      <option value="percent">
        Percentage
      </option>

      <option value="flat">
        Flat
      </option>

    </select>

    <input
      type="number"
      placeholder="Value"
      value={couponValue}
      onChange={(e)=>
        setCouponValue(
          e.target.value
        )
      }
      className="
        border
        p-4
        rounded-xl
      "
    />

    <input
      type="date"
      value={couponExpiry}
      onChange={(e)=>
        setCouponExpiry(
          e.target.value
        )
      }
      className="
        border
        p-4
        rounded-xl
      "
    />

  </div>

  <button

    onClick={createCoupon}

    className="
      bg-black
      text-white
      px-8
      py-4
      rounded-xl
      mb-10
    "
  >
    Create Coupon
  </button>

  <div className="
    overflow-x-auto
  ">

    <table className="
      w-full
    ">

      <thead>

        <tr className="
          border-b
        ">

          <th className="
            text-left
            py-4
          ">
            Code
          </th>

          <th className="
            text-left
            py-4
          ">
            Type
          </th>

          <th className="
            text-left
            py-4
          ">
            Value
          </th>

          <th className="
            text-left
            py-4
          ">
            Expiry
          </th>

          <th className="
            text-left
            py-4
          ">
            Action
          </th>

        </tr>

      </thead>

      <tbody>

        {coupons.map((coupon)=>(

          <tr
            key={coupon.id}
            className="
              border-b
            "
          >

            <td className="
              py-5
            ">
              {coupon.code}
            </td>

            <td>
              {coupon.type}
            </td>

            <td>
              {coupon.value}
            </td>

            <td>
              {coupon.expiry}
            </td>

            <td>

              <button

                onClick={()=>
                  deleteCoupon(
                    coupon.id
                  )
                }

                className="
                  bg-red-500
                  text-white
                  px-5
                  py-2
                  rounded-lg
                "
              >
                Delete
              </button>

            </td>

          </tr>

        ))}

      </tbody>

    </table>

  </div>

</div>

        {/* VENDORS */}

        <div className="
          bg-white
          rounded-2xl
          shadow
          p-8
          mb-10
        ">

          <h2 className="
            text-3xl
            font-bold
            mb-8
          ">
            Vendor Approvals
          </h2>

          <div className="
            space-y-6
          ">

            {vendors.map((vendor)=>(

              <div
                key={vendor.id}
                className="
                  border-b
                  pb-6
                  flex
                  flex-col
                  lg:flex-row
                  lg:justify-between
                  gap-6
                "
              >

                <div>

                  <h3 className="
                    text-2xl
                    font-bold
                  ">
                    {vendor.businessName}
                  </h3>

                  <p>
                    {vendor.fullName}
                  </p>

                  <p>
                    {vendor.city},
                    {" "}
                    {vendor.state}
                  </p>

                </div>

                <div className="
                  flex
                  gap-4
                ">

                  <button
                    onClick={()=>
                      approveVendor(
                        vendor.id
                      )
                    }
                    className="
                      bg-green-600
                      text-white
                      px-6
                      py-3
                      rounded-xl
                    "
                  >
                    Approve
                  </button>

                  <button
                    onClick={()=>
                      rejectVendor(
                        vendor.id
                      )
                    }
                    className="
                      bg-red-500
                      text-white
                      px-6
                      py-3
                      rounded-xl
                    "
                  >
                    Reject
                  </button>

                </div>

              </div>

            ))}

          </div>

        </div>

        {/* PRODUCTS */}

        <div className="
          bg-white
          rounded-2xl
          shadow
          p-8
          mb-10
        ">

          <h2 className="
            text-3xl
            font-bold
            mb-8
          ">
            Marketplace Products
          </h2>

          <div className="
            space-y-6
          ">

            {products.map((product)=>(

              <div
                key={product.id}
                className="
                  flex
                  justify-between
                  items-center
                  border-b
                  pb-6
                "
              >

                <div className="
                  flex
                  gap-5
                ">

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

                    <h3 className="
                      text-2xl
                      font-bold
                    ">
                      {product.name}
                    </h3>

                    <p>
                      ₹{product.price}
                    </p>

                    <p>
                    <p className={`font-semibold ${ product.stock <= 5 ? "text-red-500" : "text-green-600" } 
`}>

  Stock: {" "} {product.stock}

</p>
                    </p>

                  </div>

                </div>

                <button
                  onClick={()=>{

  const confirmDelete =

    confirm(
      "Delete product?"
    );

  if(confirmDelete){

    deleteProduct(
      product.id
    );

  }

}}
  
                  className="
                    bg-red-500
                    text-white
                    px-6
                    py-3
                    rounded-xl
                  "
                >
                  Remove
                </button>

              </div>

            ))}

          </div>

        </div>

        {/* ORDERS */}

        <div className="
          bg-white
          rounded-2xl
          shadow
          p-8
        ">

          <h2 className="
            text-3xl
            font-bold
            mb-8
          ">
            Marketplace Orders
          </h2>

          <div className="
            overflow-x-auto
          ">

            <table className="
              w-full
            ">

              <thead>

                <tr className="
                  border-b
                ">

                  <th className="
                    text-left
                    py-4
                  ">
                    Order
                  </th>

                  <th className="
                    text-left
                    py-4
                  ">
                    Customer
                  </th>

                  <th className="
                    text-left
                    py-4
                  ">
                    Amount
                  </th>

                  <th className="
                    text-left
                    py-4
                  ">
                    Payment
                  </th>

                  <th className="
                    text-left
                    py-4
                  ">
                    Status
                  </th>

                </tr>

              </thead>

              <tbody>

                {orders.map((order)=>(

                  <tr
                    key={order.id}
                    className="
                      border-b
                    "
                  >

                    <td className="
                      py-5
                    ">
                      #
                      {order.id.slice(0,6)}
                    </td>

                    <td>
                      {order.customerName}
                    </td>

                    <td>
                      ₹{order.total}
                    </td>

                    <td>
                      {order.paymentMethod ||
                       "COD"}
                    </td>

                    <td>

                      <select

  value={order.status}

  onChange={(e:any)=>{

    updateOrderStatus(

      order.id,

      e.target.value

    );

  }}

  className={`
    border
    p-2
    rounded-lg

    ${
      order.status ===
      "Delivered"

      ? "bg-green-100"

      : order.status ===
        "Pending"

      ? "bg-yellow-100"

      : "bg-blue-100"
    }
  `}
>

                        <option>
                          Pending
                        </option>

                        <option>
                          Processing
                        </option>

                        <option>
                          Shipped
                        </option>

                        <option>
                          Out For Delivery
                        </option>

                        <option>
                          Delivered
                        </option>

                      </select>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

            {/* CUSTOMERS */}

<div className="
  bg-white
  rounded-2xl
  shadow
  p-8
  mt-10
">

  <h2 className="
    text-3xl
    font-bold
    mb-8
  ">
    Customers
  </h2>

  <div className="
    overflow-x-auto
  ">

    <table className="
      w-full
    ">

      <thead>

        <tr className="
          border-b
        ">

          <th className="
            text-left
            py-4
          ">
            Email
          </th>

          <th className="
            text-left
            py-4
          ">
            Orders
          </th>

          <th className="
            text-left
            py-4
          ">
            Total Spending
          </th>

        </tr>

      </thead>

      <tbody>

        {customers.map((customer)=>(

          <tr
            key={customer.id}
            className="
              border-b
            "
          >

            <td className="
              py-5
            ">
              {customer.email}
            </td>

            <td>
              {customer.totalOrders}
            </td>

            <td>
              ₹{customer.totalSpent}
            </td>

          </tr>

        ))}

      </tbody>

    </table>

  </div>

</div>

          </div>

        </div>

      </div>

    </div>

  );
}