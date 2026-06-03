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

        <h1 className="text-4xl font-bold mb-8">

        User Management

        </h1>

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

        {loading ? (

          <p>
            Loading...
          </p>

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

              <tbody>

                {users.map(
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
                      {user.status}
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