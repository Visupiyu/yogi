"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
   updateDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { toast } from "sonner";

type Customer = {

  id:string;

  name:string;

  email:string;

  phone:string;

  status:string;

};

export default function AdminCustomersPage(){

  const [customers,setCustomers]=
    useState<Customer[]>([]);

  const [loading,setLoading]=
    useState(true);

  const [search,setSearch]=
    useState("");

  useEffect(()=>{

    loadCustomers();

  },[]);

  const loadCustomers=async()=>{

    try{

      const snapshot=await getDocs(

        collection(
          db,
          "users"
        )

      );

      const items:Customer[]=[];

      snapshot.forEach((docSnap)=>{

        const data:any=docSnap.data();

        if(data.role==="Customer"){

          items.push({

            id:docSnap.id,

            name:
              data.name || "Customer",

            email:
              data.email || "-",

            phone:
              data.phone || "-",

            status:
              data.status || "Active",

          });

        }

      });

      setCustomers(items);

    }

    catch(error){

      console.error(error);

    }

    finally{

      setLoading(false);

    }

  };

  const filtered=customers.filter((customer)=>

    customer.name
      .toLowerCase()
      .includes(search.toLowerCase())

    ||

    customer.email
      .toLowerCase()
      .includes(search.toLowerCase())

  );
  const toggleCustomerStatus = async (

  customer: Customer

) => {

  try {

    await updateDoc(

      doc(
        db,
        "users",
        customer.id
      ),

      {

        status:

          customer.status === "Active"

            ? "Blocked"

            : "Active",

      }

    );

    toast.success(

      "Customer updated."

    );

    loadCustomers();

  } catch (error) {

    console.error(error);

    toast.error(

      "Update failed."

    );

  }

};

const exportCSV = ()=>{

const rows=[

[
"Name",
"Email",
"Phone",
"Status"
],

...filtered.map(c=>([

c.name,

c.email,

c.phone,

c.status

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

a.download="customers.csv";

a.click();

URL.revokeObjectURL(url);

};

  return(

<div className="min-h-screen bg-gray-100 p-6">

<div className="max-w-7xl mx-auto">

<div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-3xl p-8 mb-8">

<h1 className="text-4xl font-bold">

👥 Customer Management

</h1>

<p className="mt-2">

Manage marketplace customers

</p>

</div>

<div className="flex justify-end mb-6">

<button

onClick={exportCSV}

className="bg-green-600 text-white px-6 py-3 rounded-xl"

>

📥 Export CSV

</button>

</div>

<div className="grid md:grid-cols-3 gap-5 mb-8">

<div className="bg-white rounded-2xl shadow p-6">

<p>Total Customers</p>

<h2 className="text-3xl font-bold">

{customers.length}

</h2>

</div>

<div className="bg-white rounded-2xl shadow p-6">

<p>Active</p>

<h2 className="text-3xl font-bold text-green-600">

{

customers.filter(

c=>c.status==="Active"

).length

}

</h2>

</div>

<div className="bg-white rounded-2xl shadow p-6">

<p>Blocked</p>

<h2 className="text-3xl font-bold text-red-600">

{

customers.filter(

c=>c.status==="Blocked"

).length

}

</h2>

</div>

</div>

<input

placeholder="Search customer..."

value={search}

onChange={(e)=>

setSearch(e.target.value)

}

className="w-full border rounded-xl p-4 mb-6"

/>

{

loading

?

<div className="bg-white rounded-2xl p-10 text-center">

Loading...

</div>

:

<div className="bg-white rounded-2xl shadow overflow-x-auto">

<table className="w-full">

<thead>

<tr className="border-b">

<th className="p-4 text-left">

Name

</th>

<th className="p-4 text-left">

Email

</th>

<th className="p-4 text-left">

Phone

</th>

<th className="p-4 text-left">

Status

</th>
<th className="p-4 text-left">

Actions

</th>

</tr>

</thead>

<tbody>

{

filtered.map((customer)=>(

<tr

key={customer.id}

className="border-b"

>

<td className="p-4">

{customer.name}

</td>

<td>

{customer.email}

</td>

<td>

{customer.phone}

</td>

<td>

<span

className={`
px-3
py-1
rounded-full
text-sm
font-semibold

${
customer.status==="Active"

? "bg-green-100 text-green-700"

: "bg-red-100 text-red-700"

}

`}

>

{customer.status}

</span>

</td>

<td>

<div className="flex flex-wrap gap-2">

<button

onClick={()=>

toggleCustomerStatus(

customer

)

}

className={`
px-3
py-1
rounded-lg
text-white

${
customer.status==="Active"

? "bg-red-600"

: "bg-green-600"

}

`}

>

{

customer.status==="Active"

?

"Block"

:

"Unblock"

}

</button>

<button

className="bg-blue-600 text-white px-3 py-1 rounded-lg"

>

Orders

</button>

<button

className="bg-purple-600 text-white px-3 py-1 rounded-lg"

>

Profile

</button>

</div>

</td>

</tr>

))

}

</tbody>

</table>

</div>

}

</div>

</div>

);

}