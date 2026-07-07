"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";

import {
  auth,
  db,
} from "@/lib/firebase";

import {
  onAuthStateChanged,
} from "firebase/auth";

type Chat = {
  id: string;
  customerEmail: string;
  customerName: string;
  customerImage?: string;

  sellerId: string;
  sellerName: string;

  productId: string;
  productName: string;

  lastMessage: string;
  lastSender: string;

  sellerUnread: number;
  customerUnread: number;

  lastMessageAt?: any;
};

export default function SellerMessagesPage() {

  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [sellerId, setSellerId] = useState("");

  const [sellerName, setSellerName] = useState("");

  const [chats, setChats] = useState<Chat[]>([]);

  useEffect(() => {

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {

          if (!user) {

            router.push("/vendor-login");

            return;

          }

          setSellerId(user.uid);

          const vendorSnap =
            await getDocs(

              query(

                collection(db, "vendors"),

                where(
                  "email",
                  "==",
                  user.email
                )

              )

            );

          if (vendorSnap.empty) {

            router.push("/vendor-login");

            return;

          }

          const vendor =
            vendorSnap.docs[0].data();

          setSellerName(
            vendor.businessName || ""
          );

          try {

            const snapshot =
              await getDocs(

                query(

                  collection(
                    db,
                    "chats"
                  ),

                  where(
                    "sellerId",
                    "==",
                    user.uid
                  ),

                  orderBy(
                    "lastMessageAt",
                    "desc"
                  )

                )

              );

           const list = snapshot.docs.map((docSnap) => {
  const data = docSnap.data() as Omit<Chat, "id">;

  return {
    ...data,
    id: docSnap.id,
  };
});
          } catch (error) {

            console.error(error);

          } finally {

            setLoading(false);

          }

        }

      );

    return () => unsubscribe();

  }, [router]);

  const filteredChats =
    chats.filter((chat) =>

      chat.customerName
        ?.toLowerCase()
        .includes(
          search.toLowerCase()
        )

      ||

      chat.productName
        ?.toLowerCase()
        .includes(
          search.toLowerCase()
        )

    );

  if (loading) {

    return (

      <div className="min-h-screen flex items-center justify-center">

        <h2 className="text-2xl font-bold">

          Loading Customer Chats...

        </h2>

      </div>

    );

  }

  return (

    <div className="min-h-screen bg-gray-100">

      <div className="max-w-7xl mx-auto p-8">

        <div
          className="
          rounded-3xl
          bg-gradient-to-r
          from-green-600
          via-teal-600
          to-blue-600
          text-white
          p-8
          mb-8
        "
        >

          <h1 className="text-4xl font-bold">

            💬 Customer Chats

          </h1>

          <p className="mt-2 text-lg">

            Welcome

            {" "}

            {sellerName}

          </p>

        </div>

        <input

          type="text"

          placeholder="Search customer or product..."

          value={search}

          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }

          className="
            w-full
            p-4
            rounded-2xl
            border
            mb-8
          "

        />

        <div className="space-y-5">
            {filteredChats.length === 0 ? (

  <div className="bg-white rounded-3xl shadow p-10 text-center">

    <h2 className="text-2xl font-bold mb-2">

      No Customer Chats

    </h2>

    <p className="text-gray-500">

      Customer conversations will appear here.

    </p>

  </div>

) : (

  filteredChats.map((chat) => (

    <Link

      key={chat.id}

      href={`/seller/messages/${chat.id}`}

      className="
        block
        bg-white
        rounded-3xl
        shadow
        hover:shadow-xl
        transition
        p-6
      "

    >

      <div className="flex items-center gap-5">

        <img

          src={
            chat.customerImage ||
            "/avatar.png"
          }

          alt="Customer"

          className="
            w-16
            h-16
            rounded-full
            object-cover
          "

        />

        <div className="flex-1">

          <h2 className="text-xl font-bold">

            {chat.customerName || "Customer"}

          </h2>

          <p className="text-sm text-green-600">

            📦 {chat.productName}

          </p>

          <p className="text-gray-500 truncate mt-2">

            {

              chat.lastSender === "customer"

                ? "🧑 Customer: "

                : "🏪 You: "

            }

            {chat.lastMessage || "Start Conversation"}

          </p>

        </div>

        <div className="text-right">

          <p className="text-sm text-gray-400">

            {

              chat.lastMessageAt?.seconds

                ? new Date(

                    chat.lastMessageAt.seconds * 1000

                  ).toLocaleString()

                : "-"

            }

          </p>

          {

            chat.sellerUnread > 0 && (

              <div
                className="
                  mt-3
                  inline-flex
                  items-center
                  justify-center
                  min-w-[30px]
                  h-8
                  px-2
                  rounded-full
                  bg-red-600
                  text-white
                  font-bold
                "
              >

                {

                  chat.sellerUnread > 99

                    ? "99+"

                    : chat.sellerUnread

                }

              </div>

            )

          }

        </div>

      </div>

    </Link>

  ))

)}

        </div>

      </div>

    </div>

  );

}