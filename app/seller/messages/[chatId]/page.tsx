"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db, storage } from "@/lib/firebase";

import { onAuthStateChanged } from "firebase/auth";

import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

export default function SellerChatPage() {

  const router = useRouter();

  const params = useParams();

  const chatId = params.Id as string;

  const bottomRef =
    useRef<HTMLDivElement>(null);

  const [loading, setLoading] =
    useState(true);

  const [sellerName, setSellerName] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [messages, setMessages] =
    useState<any[]>([]);

  const [imageFile, setImageFile] =
    useState<File | null>(null);

  const [preview, setPreview] =
    useState("");

  const clearImage = () => {

    setImageFile(null);

    setPreview("");

  };

  useEffect(() => {
  let unsubscribeSnapshot: (() => void) | undefined;

  const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {

    if (!user) {
      router.push("/vendor-login");
      return;
    }

    setSellerName(user.displayName || "Seller");

    await updateDoc(doc(db, "chats", chatId), {
      sellerUnread: 0,
    }).catch(() => {});

    const q = query(
      collection(db, "messages"),
      where("chatId", "==", chatId),
      orderBy("createdAt")
    );

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {

      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      setMessages(list);
      setLoading(false);

      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({
          behavior: "smooth",
        });
      });

    });

  });

  return () => {
    unsubscribeAuth();

    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
    }
  };

}, [chatId, router]);

  const uploadImage =
    async()=>{

      if(!imageFile)
        return "";

      const storageRef =
        ref(

          storage,

          `chat/${Date.now()}-${imageFile.name}`

        );

      await uploadBytes(
        storageRef,
        imageFile
      );

      return await
      getDownloadURL(
        storageRef
      );

    };
    const sendMessage = async () => {

  if (!message.trim() && !imageFile) return;

  const imageUrl =
    imageFile
      ? await uploadImage()
      : "";

  await addDoc(
    collection(db, "messages"),
    {
      chatId,
      sender: "seller",
      senderName: sellerName,
      text: message,
      image: imageUrl,
      createdAt: serverTimestamp(),
    }
  );

  await updateDoc(
    doc(db, "chats", chatId),
    {
      lastMessage: message || "📷 Image",
      lastMessageAt: serverTimestamp(),
      lastSender: "seller",
      customerUnread: increment(1),
    }
  );

  setMessage("");
  setImageFile(null);
  setPreview("");

};

  if(loading){

    return(

      <div
        className="
        min-h-screen
        flex
        items-center
        justify-center
      "
      >

        <h2
          className="
          text-2xl
          font-bold
        "
        >

          Loading Conversation...

        </h2>

      </div>

    );

  }

  return(

    <div
      className="
      min-h-screen
      bg-gray-100
      flex
      flex-col
    "
    >

      <div
        className="
        bg-gradient-to-r
        from-green-600
        via-teal-600
        to-blue-600
        text-white
        p-6
      "
      >

        <h1
          className="
          text-3xl
          font-bold
        "
        >

          💬 Customer Chat

        </h1>

        <p
          className="
          mt-2
        "
        >

          {sellerName}

        </p>

      </div>

      <div
        className="
        flex-1
        overflow-y-auto
        p-6
        space-y-4
      "
      >
        {messages.map((msg: any) => (

  <div
    key={msg.id}
    className={`flex ${
      msg.sender === "seller"
        ? "justify-end"
        : "justify-start"
    }`}
  >

    <div
      className={`max-w-lg rounded-3xl px-5 py-4 shadow-md ${
        msg.sender === "seller"
          ? "bg-gradient-to-r from-green-600 to-blue-600 text-white"
          : "bg-white"
      }`}
    >

      {msg.image && (

        <img
          src={msg.image}
          alt="Chat"
          className="w-56 rounded-xl mb-3 object-cover"
        />

      )}

      {msg.text && <p>{msg.text}</p>}

      <p className="text-xs mt-2 opacity-70">

        {msg.createdAt?.seconds

          ? new Date(
              msg.createdAt.seconds * 1000
            ).toLocaleTimeString()

          : ""}

      </p>

    </div>

  </div>

))}

<div ref={bottomRef} />

</div>

{/* INPUT */}

<div className="bg-white border-t p-4">

  {preview && (

    <div className="mb-3 w-20 relative">

      <img
        src={preview}
        alt=""
        className="w-20 h-20 rounded-xl object-cover"
      />

      <button
        onClick={clearImage}
        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6"
      >
        ×
      </button>

    </div>

  )}

  <div className="flex gap-3 items-center">

    <button
      onClick={() => setMessage((m) => m + "😊")}
      className="text-3xl"
    >
      😊
    </button>

    <input
      value={message}
      onChange={(e) => setMessage(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          sendMessage();
        }
      }}
      placeholder="Reply to customer..."
      className="flex-1 border rounded-xl p-3"
    />

    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-4 py-3 rounded-xl">

      📷

      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {

          const file =
            e.target.files?.[0];

          if (file) {

            setImageFile(file);

            setPreview(
              URL.createObjectURL(file)
            );

          }

        }}
      />

    </label>

    <button
      onClick={sendMessage}
      className="bg-gradient-to-r from-green-600 to-blue-600 text-white px-8 py-3 rounded-xl font-semibold"
    >
      Send
    </button>

  </div>

</div>

</div>

);

}
