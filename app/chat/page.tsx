"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Image from "next/image";

export default function ChatPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
 type Chat = {
  id: string;
  sellerName: string;
  sellerImage?: string;
  productName: string;
  lastSender: string;
  lastMessage: string;
  lastMessageAt?: any;
  customerUnread: number;
  online?: boolean;
};

const [chats, setChats] = useState<Chat[]>([]);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    if (!user.email) {
      router.push("/login");
      return;
    }

    const loadChats = async () => {
      try {
        // Scoped to this customer on the server (needs a composite index on
        // customerEmail + lastMessageAt). Keeps other users' chats private.
        const snapshot = await getDocs(
          query(
            collection(db, "chats"),
            where("customerEmail", "==", user.email),
            orderBy("lastMessageAt", "desc")
          )
        );

        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });

        setChats(list);
      } catch (error) {
      console.error("Chat loading failed:", error);
      } finally {
        setLoading(false);
      }
    };

    loadChats();
  }, [router]);

  const filtered = chats.filter(
    (chat: any) =>
      (chat.sellerName || "")
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (chat.productName || "")
        .toLowerCase()
        .includes(search.toLowerCase())
  );
if (loading) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h2 className="text-2xl font-bold">
        Loading Chats...
      </h2>
    </div>
  );
}
   return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">💬 My Chats</h1>
          <p className="mt-2">Chat with sellers</p>
        </div>

        <input
          placeholder="Search seller or product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full p-4 rounded-2xl border mb-6"
        />

        <div className="space-y-5">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-3xl shadow p-10 text-center">
              No conversations found.
            </div>
          ) : (
            filtered.map((chat: any) => (
              <Link
                key={chat.id}
                href={`/chat/${chat.id}`}
                className="block bg-white rounded-3xl shadow p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Image
  src={chat.sellerImage || "/avatar.png"}
  alt={chat.sellerName || "Seller"}
  width={64}
  height={64}
  className="rounded-full object-cover"
/>
                    <span
                      className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${
                        chat.online ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                  </div>

                  <div className="flex-1">
                    <h2 className="text-xl font-bold">{chat.sellerName}</h2>

                    <p className="text-sm text-blue-600 font-medium">
                      📦 {chat.productName || "General Inquiry"}
                    </p>

                    <p className="text-gray-500 truncate">
                      {chat.lastSender === "customer"
                        ? "🧑 You: "
                        : "🏪 Seller: "}
                      {chat.lastMessage || "Start Conversation"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-gray-400">
                      {chat.lastMessageAt?.seconds
                        ? new Date(
                            chat.lastMessageAt.seconds * 1000
                          ).toLocaleString()
                        : "-"}
                    </p>

                    {chat.customerUnread > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-red-600 text-white text-sm font-bold mt-2">
                        {chat.customerUnread > 99 ? "99+" : chat.customerUnread}
                      </span>
                    )}
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
