"use client";

import {
  useEffect,
  useState
} from "react";

import {
  collection,
  getDocs
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend
} from "recharts";

export default function SellerAnalyticsPage(){

  const [loading,setLoading] =
    useState(true);

  const [orders,setOrders] =
    useState<any[]>([]);

  const [products,setProducts] =
    useState<any[]>([]);

  const [reviews,setReviews] =
    useState<any[]>([]);

  useEffect(()=>{

    loadAnalytics();

  },[]);

  const loadAnalytics =
  async()=>{

    try{

      const vendor = JSON.parse(

        localStorage.getItem(
          "vendor"
        ) || "{}"

      );

      const productSnap =
        await getDocs(
          collection(
            db,
            "products"
          )
        );

      const productList:any[]=[];

      productSnap.forEach(doc=>{

        const data:any={
          id:doc.id,
          ...doc.data()
        };

        if(
          data.vendorId ===
          vendor.uid
        ){

          productList.push(data);

        }

      });

      setProducts(productList);

      const orderSnap =
        await getDocs(
          collection(
            db,
            "orders"
          )
        );

      const orderList:any[]=[];

      orderSnap.forEach(doc=>{

        const data:any=
          doc.data();

        const myItems =

          data.items?.filter(

            (item:any)=>

              item.vendorId ===
              vendor.uid

          ) || [];

        if(myItems.length){

          orderList.push({

            ...data,

            myItems

          });

        }

      });

      setOrders(orderList);

      const reviewSnap =
        await getDocs(
          collection(
            db,
            "productReviews"
          )
        );

      const reviewList:any[]=[];

      reviewSnap.forEach(doc=>{

        reviewList.push(doc.data());

      });

      setReviews(reviewList);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  const revenue =

    orders.reduce(

      (sum,order)=>

        sum +

        order.myItems.reduce(

          (s:any,item:any)=>

            s +

            item.price *

            item.qty,

          0

        ),

      0

    );

  const totalProducts =
    products.length;

  const totalOrders =
    orders.length;

  const averageRating =

    reviews.length

      ? (

          reviews.reduce(

            (sum:any,r:any)=>

              sum+r.rating,

            0

          ) /

          reviews.length

        ).toFixed(1)

      : "0";

  const chartData=[

    {
      name:"Products",
      value:totalProducts
    },

    {
      name:"Orders",
      value:totalOrders
    },

    {
      name:"Reviews",
      value:reviews.length
    }

  ];

  const revenueChart=[

    {
      name:"Revenue",
      amount:revenue
    }

  ];
  const productSales:any = {};

orders.forEach((order)=>{

  order.myItems.forEach((item:any)=>{

    if(!productSales[item.name]){

      productSales[item.name]=0;

    }

    productSales[item.name]+=item.qty;

  });

});

const bestSellingProducts =

  Object.entries(productSales)

  .map(

    ([name,qty])=>({

       name: name as string,

      qty: Number(qty)

    })

  )

 .sort(

    (a, b) =>

      b.qty - a.qty

  )

  .slice(0, 5);

  const pendingOrders =

  orders.filter(

    (order:any)=>

      order.status ===
      "Pending"

  ).length;

const lowStockProducts =

  products.filter(

    (product:any)=>

      Number(
        product.stock || 0
      ) <= 5

  ).length;

const totalCommission =

  Math.round(

    revenue * 0.10

  );

const netEarnings =

  revenue -

  totalCommission;

const deliveredOrders =

  orders.filter(

    (order:any)=>

      order.status ===
      "Delivered"

  ).length;

const returnedOrders =

  orders.filter(

    (order:any)=>

      order.status ===
      "Refunded"

  ).length;

const returnRate =

  deliveredOrders

    ? (

        returnedOrders *

        100 /

        deliveredOrders

      ).toFixed(1)

    : "0";

    const orderStatusData = [

  {
    name:"Pending",
    value: orders.filter(
      (o:any)=>
        o.status==="Pending"
    ).length
  },

  {
    name:"Packed",
    value: orders.filter(
      (o:any)=>
        o.status==="Packed"
    ).length
  },

  {
    name:"Shipped",
    value: orders.filter(
      (o:any)=>
        o.status==="Shipped"
    ).length
  },

  {
    name:"Delivered",
    value: orders.filter(
      (o:any)=>
        o.status==="Delivered"
    ).length
  },

  {
    name:"Refunded",
    value: orders.filter(
      (o:any)=>
        o.status==="Refunded"
    ).length
  }

];
const inventoryData = [

  {
    name:"Healthy",
    value: products.filter(
      (p:any)=>
        Number(
          p.stock || 0
        ) > 5
    ).length
  },

  {
    name:"Low Stock",
    value: products.filter(
      (p:any)=>
        Number(
          p.stock || 0
        ) <=5 &&
        Number(
          p.stock || 0
        ) >0
    ).length
  },

  {
    name:"Out of Stock",
    value: products.filter(
      (p:any)=>
        Number(
          p.stock || 0
        )===0
    ).length
  }

];

const monthlyRevenue = [

  {
    month:"Jan",
    revenue:0
  },

  {
    month:"Feb",
    revenue:0
  },

  {
    month:"Mar",
    revenue:0
  },

  {
    month:"Apr",
    revenue:0
  },

  {
    month:"May",
    revenue:0
  },

  {
    month:"Jun",
    revenue:revenue
  }

];

  const COLORS=[
    "#16a34a",
    "#2563eb",
    "#f59e0b"
  ];

  if(loading){

    return(

      <div className="
        p-10
        text-center
      ">

        Loading Analytics...

      </div>

    );

  }

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">
    

      <div className="
        max-w-7xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-green-600
          to-blue-600
          text-white
          rounded-3xl
          p-8
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">
            Seller Analytics
          </h1>

          <p className="mt-2">
            Business Performance Dashboard
          </p>

        </div>
         </div>
         
       <div className="
  grid
  grid-cols-1
  md:grid-cols-2
  lg:grid-cols-3
  gap-6
  mb-8
">


  {/* Best Seller */}
 <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
    🏆 
  </div>
<div>

    <p className="text-gray-500 text-lg">
      Best Seller
    </p>

    <h2 className="text-4xl font-bold mt-2">
      {bestSellingProducts[0]?.name}
    </h2>

    <p className="text-gray-400 mt-1">
      Awaiting dispatch
    </p>

  </div>
   </div>


  {/* Pending Orders */}
  <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
    📦
  </div>

  <div>

    <p className="text-gray-500 text-lg">
      Pending Orders
    </p>

    <h2 className="text-4xl font-bold mt-2">
      {pendingOrders}
    </h2>

    <p className="text-gray-400 mt-1">
     
    </p>

  </div>
   </div>


  {/* Low Stock */}
 <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
    📉 
  </div>

  <div>

    <p className="text-gray-500 text-lg">
      Low Stock
    </p>

    <h2 className="text-4xl font-bold mt-2">
    {lowStockProducts}
    </h2>

    <p className="text-gray-400 mt-1">
     
    </p>

  </div>
   </div>


  {/* Commission */}
 <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
💸 
  </div>

  <div>

    <p className="text-gray-500 text-lg">
    Commission
    </p>

    <h2 className="text-4xl font-bold mt-2">
     ₹{totalCommission}
    </h2>

    <p className="text-gray-400 mt-1">
     
    </p>

  </div>
   </div>



  {/* Net Earnings */}
 <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
   💵 
  </div>

  <div>

    <p className="text-gray-500 text-lg">
     Net Earnings
    </p>

    <h2 className="text-4xl font-bold mt-2">
      ₹{netEarnings}
    </h2>

    <p className="text-gray-400 mt-1">
      
    </p>

  </div>
   </div>

    {/* Units Sold */}
  <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
    🛒 
  </div>

  <div>

    <p className="text-gray-500 text-lg">
      🛒 Units Sold
    </p>

    <h2 className="text-4xl font-bold mt-2">
      {bestSellingProducts[0]?.qty}
    </h2>

    <p className="text-gray-400 mt-1">
    
    </p>

  </div>
   </div>


  {/* Total Reviews */}
  <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
   ⭐
  </div>

  <div>

    <p className="text-gray-500 text-lg">
    Total Reviews
    </p>

    <h2 className="text-4xl font-bold mt-2">
      {reviews.length}
    </h2>

    <p className="text-gray-400 mt-1">
      
    </p>

  </div>
   </div>
  
  <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
💰 
  </div>

  <div>

    <p className="text-gray-500 text-lg">
  Total Revenue
    </p>

    <h2 className="text-4xl font-bold mt-2">
     ₹{revenue}
    </h2>

    <p className="text-gray-400 mt-1">
      
    </p>

  </div>
   </div>



          <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
  📋
  </div>

  <div>

    <p className="text-gray-500 text-lg">
     📋 Orders
    </p>

    <h2 className="text-4xl font-bold mt-2">
     {totalOrders}
    </h2>

    <p className="text-gray-400 mt-1">
      Awaiting dispatch
    </p>

  </div>
   </div>

   <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
    📦 
  </div>

  <div>

    <p className="text-gray-500 text-lg">
      Products

    </p>

    <h2 className="text-4xl font-bold mt-2">
      {totalProducts}
    </h2>

    <p className="text-gray-400 mt-1">
     </p>

  </div>
   </div>


          <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
    ⭐ 
  </div>

  <div>

    <p className="text-gray-500 text-lg">
      Average Rating
    </p>

    <h2 className="text-4xl font-bold mt-2">
      {averageRating}
    </h2>

    <p className="text-gray-400 mt-1">
      </p>

  </div>
   </div>
    <div
  className="
    bg-white
    rounded-[28px]
    shadow-lg
    border
    border-gray-100
    p-8
    min-h-[170px]
    flex
    items-center
    gap-6
  "
>

  <div
    className="
      w-20
      h-20
      rounded-3xl
      bg-blue-100
      flex
      items-center
      justify-center
      text-4xl
      flex-shrink-0
    "
  >
    ⭐ 
  </div>

  <div>

    <p className="text-gray-500 text-lg">
      Average Rating
    </p>

    <h2 className="text-4xl font-bold mt-2">
      {averageRating}
    </h2>

    <p className="text-gray-400 mt-1"> </p>

  </div>
   </div>
   
<div className="
  bg-white
  rounded-3xl
  p-6
  shadow
  mt-8
">

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
            h-[400px]
          ">

            <h2 className="
              text-xl
              font-bold
              mb-4
            ">
              Business Overview
            </h2>

            <ResponsiveContainer>

              <PieChart>

                <Pie

                  data={chartData}

                  dataKey="value"

                  outerRadius={120}

                  label

                >

                  {chartData.map(

                    (entry,index)=>(

                      <Cell

                        key={index}

                        fill={
                          COLORS[index]
                        }

                      />

                    )

                  )}

                </Pie>

                <Tooltip/>

              </PieChart>

            </ResponsiveContainer>

          </div>

          <div className="
grid
xl:grid-cols-2
gap-8
mb-8
">

  <h2 className="
    text-2xl
    font-bold
    mb-6
  ">
    🔥 Best Selling Products
  </h2>

  <ResponsiveContainer
    width="100%"
    height={350}
  >

    <BarChart
      data={bestSellingProducts}
    >

      <CartesianGrid
        strokeDasharray="3 3"
      />

      <XAxis
        dataKey="name"
      />

      <YAxis/>

      <Tooltip/>

      <Bar
        dataKey="qty"
      />

    </BarChart>

  </ResponsiveContainer>

</div>
<div className="
  bg-white
  rounded-3xl
  shadow
  p-8
  mt-8
">

  <h2 className="
    text-2xl
    font-bold
    mb-6
  ">
    📈 Business Insights
  </h2>

  <div className="
    space-y-4
    text-lg
  ">

    <p>

      💰 Revenue Generated:
      <strong>
        {" "}
        ₹{revenue}
      </strong>

    </p>

    <p>

      🏆 Best Seller:
      <strong>
        {" "}
        {
          bestSellingProducts[0]?.name ||
          "N/A"
        }
      </strong>

    </p>

    <p>

      ⭐ Average Rating:
      <strong>
        {" "}
        {averageRating}
      </strong>

    </p>

    <p>

      📉 Return Rate:
      <strong>
        {" "}
        {returnRate}%
      </strong>

    </p>

    <p>

      📦 Low Stock Products:
      <strong>
        {" "}
        {lowStockProducts}
      </strong>

    </p>

    <p>

      🚚 Pending Orders:
      <strong>
        {" "}
        {pendingOrders}
      </strong>

    </p>

  </div>

</div>
</div>

<div className="
grid
xl:grid-cols-3
gap-8
">

  {/* Monthly Revenue */}

  <div className="
    bg-white
    rounded-3xl
    p-6
    shadow
  min-h-[420px]
  ">

    <h2 className="
      text-xl
      font-bold
      mb-4
    ">
      📈 Monthly Revenue
    </h2>

    <ResponsiveContainer>

      <LineChart
        data={monthlyRevenue}
      >

        <CartesianGrid strokeDasharray="3 3"/>

        <XAxis dataKey="month"/>

        <YAxis/>

        <Tooltip/>

        <Legend/>

        <Line
          type="monotone"
          dataKey="revenue"
        />

      </LineChart>

    </ResponsiveContainer>

  </div>

  {/* Order Status */}

  <div className="
    bg-white
    rounded-3xl
    p-6
    shadow
    min-h-[420px]
  ">

    <h2 className="
      text-xl
      font-bold
      mb-4
    ">
      📦 Order Status
    </h2>

    <ResponsiveContainer>

      <PieChart>

        <Pie

          data={orderStatusData}

          dataKey="value"

          outerRadius={100}

          label

        >

          {orderStatusData.map(

            (_,index)=>(

              <Cell
                key={index}
                fill={
                  COLORS[
                    index %
                    COLORS.length
                  ]
                }
              />

            )

          )}

        </Pie>

        <Tooltip/>

      </PieChart>

    </ResponsiveContainer>

  </div>

  {/* Inventory */}

  <div className="
    bg-white
    rounded-3xl
    p-6
    shadow
    min-h-[420px]
  ">

    <h2 className="
      text-xl
      font-bold
      mb-4
    ">
      📦 Inventory Health
    </h2>

    <ResponsiveContainer>

      <PieChart>

        <Pie

          data={inventoryData}

          dataKey="value"

          outerRadius={100}

          label

        >

          {inventoryData.map(

            (_,index)=>(

              <Cell
                key={index}
                fill={
                  COLORS[
                    index %
                    COLORS.length
                  ]
                }
              />

            )

          )}

        </Pie>

        <Tooltip/>

      </PieChart>

    </ResponsiveContainer>

  </div>

</div>

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
            min-h-[420px]
          ">

            <h2 className="
              text-xl
              font-bold
              mb-4
            ">
              Revenue
            </h2>

            <ResponsiveContainer>

              <BarChart
                data={revenueChart}
              >

                <CartesianGrid strokeDasharray="3 3"/>

                <XAxis dataKey="name"/>

                <YAxis/>

                <Tooltip/>

                <Bar
                  dataKey="amount"
                />

              </BarChart>

            </ResponsiveContainer>

          </div>

        </div>

 </div>
    
    

    
  );

}