"use client";

import {
  useEffect,
  useState
} from "react";

import Link from "next/link";

import {
  collection,
  getDocs,
  orderBy,
  query
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function SellerChatPage(){

  const [loading,setLoading] =
    useState(true);

  const [search,setSearch] =
    useState("");

  const [chats,setChats] =
    useState<any[]>([]);

  useEffect(()=>{

    loadChats();

  },[]);

  const loadChats =
  async()=>{

    try{

      const vendor = JSON.parse(

        localStorage.getItem(
          "vendor"
        ) || "{}"

      );

      const snapshot =
        await getDocs(

          query(

            collection(
              db,
              "chats"
            ),

            orderBy(
              "lastMessageAt",
              "desc"
            )

          )

        );

      const list:any[]=[];

      snapshot.forEach(doc=>{

        const data:any={

          id:doc.id,

          ...doc.data()

        };

        if(

          data.sellerId===

          vendor.uid

        ){

          list.push(data);

        }

      });

      setChats(list);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  const filtered =

    chats.filter(

      (chat:any)=>

        chat.customerName

        ?.toLowerCase()

        .includes(

          search.toLowerCase()

        )

    );

  if(loading){

    return(

      <div className="
        p-10
        text-center
      ">

        Loading Chats...

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
        max-w-5xl
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

            💬 Customer Chats

          </h1>

          <p className="mt-2">

            Manage customer conversations

          </p>

        </div>

        <input

          placeholder="Search Customer"

          value={search}

          onChange={(e)=>

            setSearch(
              e.target.value
            )

          }

          className="
            w-full
            p-4
            border
            rounded-2xl
            mb-6
          "

        />

        <div className="
          space-y-5
        ">

          {

            filtered.length===0

            ?

            <div className="
              bg-white
              rounded-3xl
              p-10
              shadow
              text-center
            ">

              No customer chats.

            </div>

            :

            filtered.map(

              (chat:any)=>(

                <Link

                  key={chat.id}

                href={`/seller/chat/${chat.id}`}

                  className="
                    block
                    bg-white
                    rounded-3xl
                    shadow
                    p-5
                    hover:shadow-lg
                    transition
                  "

                >

                  <div className="
                    flex
                    items-center
                    gap-4
                  ">

                    <img

                      src={

                        chat.customerImage ||

                        "/avatar.png"

                      }

                      alt=""

                      className="
                        w-16
                        h-16
                        rounded-full
                        object-cover
                      "

                    />

                    <div className="
                      flex-1
                    ">

                      <h2 className="
                        text-xl
                        font-bold
                      ">

                        {

                          chat.customerName ||

                          "Customer"

                        }

                      </h2>

                      <p className="
                        text-gray-500
                        truncate
                      ">

                        {

                          chat.lastMessage ||

                          "Start Conversation"

                        }

                      </p>

                    </div>

                    <div className="
                      text-right
                    ">

                      <p className="
                        text-sm
                        text-gray-400
                      ">

                        {

                          chat.lastMessageAt

                          ?.seconds

                          ?

                         new Date(chat.lastMessageAt.seconds *1000 ).toLocaleString() : "-" }

                      </p>

                      { chat.sellerUnread>0 &&

                        <span className="
                          inline-flex
                          items-center
                          justify-center
                          w-7
                          h-7
                          rounded-full
                          bg-red-600
                          text-white
                          text-sm
                          mt-2
                        ">

                          {

                          chat.sellerUnread

                          }

                        </span>

                      }

                    </div>

                  </div>

                </Link>

              )

            )

          }

        </div>

      </div>

    </div>

  );

}