"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type User = {

  id:string;

  name:string;

  email:string;

  role:string;

   status?:string;

};

export default function AdminUsersPage(){

  const [users,setUsers] =
    useState<User[]>([]);

  const [loading,setLoading] =
    useState(true);
    const [search,setSearch] =
  useState("");

  useEffect(()=>{

    loadUsers();

  },[]);

  const loadUsers =
    async ()=>{

    try{

      const items:any[] = [];

      const vendorsSnap =
        await getDocs(
          collection(
            db,
            "vendors"
          )
        );

      vendorsSnap.forEach(
        (docSnap)=>{

          const data =
            docSnap.data();

          items.push({

            id:docSnap.id,

            status:
  data.status ||
  "Pending",

            name:
              data.fullName ||
              "Vendor",

            email:
              data.email ||
              "-",

            role:"Vendor",

          });

        }
      );

      setUsers(items);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  return (

    <div className="min-h-screen bg-gray-100">

      <div className="max-w-7xl mx-auto p-8">

       <div className="
  bg-gradient-to-r
  from-green-600
  to-blue-600
  text-white
  p-8
  rounded-3xl
  mb-8
">

  <h1 className="
    text-4xl
    font-bold
  ">
    User Management
  </h1>

  <p className="opacity-90">
    Manage vendors and marketplace users
  </p>

</div>

        <div className="
          grid
          grid-cols-1
          md:grid-cols-3
          gap-6
          mb-8
        ">

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">

            <h2 className="text-xl font-bold">
              Total Users
            </h2>

            <p className="
              text-4xl
              font-bold
              text-blue-600
              mt-2
            ">
              {users.length}
            </p>

          </div>

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">

            <h2 className="text-xl font-bold">
              Vendors
            </h2>

            <p className="
              text-4xl
              font-bold
              text-green-600
              mt-2
            ">
              {
                users.filter(
                  (u)=>
                    u.role ===
                    "Vendor"
                ).length
              }
            </p>

          </div>

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">

            <h2 className="text-xl font-bold">
              Customers
            </h2>

            <p className="
              text-4xl
              font-bold
              text-purple-600
              mt-2
            ">
              0
            </p>

          </div>

        </div>
        <input
  type="text"
  placeholder="Search Name or Email..."
  value={search}
  onChange={(e)=>
    setSearch(e.target.value)
  }
  className="
    w-full
    border
    p-4
    rounded-2xl
    mb-6
  "
/>

        {loading ? (

          <div className="
  bg-white
  rounded-2xl
  shadow
  p-10
  text-center
">

  Loading Users...

</div>

        ) : (

          <div className="
            bg-white
            rounded-2xl
            shadow
            p-6
            overflow-x-auto
          ">

            <table className="w-full">

              <thead>

                <tr className="border-b">

                  <th className="text-left py-4">
                    Name
                  </th>

                  <th className="text-left py-4">
                    Email
                  </th>

                  <th className="text-left py-4">
                    Role
                  </th>

                  <th className="text-left py-4">
                    Status
                  </th>

                </tr>

              </thead>

              {users.length === 0 && (

  <tr>

    <td
      colSpan={4}
      className="
        text-center
        py-10
        text-gray-500
      "
    >

      No Users Found

    </td>

  </tr>

)}

              <tbody>

               {users
  .filter((user)=>

    user.name
      .toLowerCase()
      .includes(
        search.toLowerCase()
      )

    ||

    user.email
      .toLowerCase()
      .includes(
        search.toLowerCase()
      )

  )
  .map(
    (user)=>(
                  <tr
                    key={user.id}
                    className="border-b"
                  >

                    <td className="py-4">
                      {user.name}
                    </td>

                    <td>
                      {user.email}
                    </td>

                    <td>
                      {user.role}
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
        user.status === "Approved"
        ? "bg-green-100 text-green-700"

        : user.status === "Rejected"
        ? "bg-red-100 text-red-700"

        : "bg-yellow-100 text-yellow-700"
      }
    `}
  >

    {user.status}

  </span>

</td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>

  );

}