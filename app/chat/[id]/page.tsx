"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  updateDoc,
  doc,
  increment,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function ChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const bottomRef = useRef<HTMLDivElement>(null);

  const [message, setMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview,setPreview] = useState("");
  useEffect(() => { return () => { if (preview) { URL.revokeObjectURL(preview); } };
}, [preview]);
  const clearImage = () => {setImageFile(null); setPreview(""); };
  const [messages, setMessages] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  const uploadImage = async () => {
    if (!imageFile) return "";
    const storageRef = ref(
      storage,
      `chat/${Date.now()}-${imageFile.name}`
    );
    await uploadBytes(storageRef, imageFile);
    return await getDownloadURL(storageRef);
  };

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user.email) {
      router.push("/login");
      return;
    }

    // Clear this customer's unread count on open
    updateDoc(doc(db, "chats", id), { customerUnread: 0 }).catch(() => {});

    // Scoped to this chat on the server (needs a composite index on
    // chatId + createdAt) instead of reading every message.
    const q = query(
      collection(db, "messages"),
      where("chatId", "==", id),
      orderBy("createdAt")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      setMessages(list);

      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    });

    return () => unsubscribe();
  }, [id, router]);

  const sendMessage = async () => {
    if (sending) return;
    setSending(true);
    if (!message.trim() && !imageFile) return;

    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const imageUrl = imageFile ? await uploadImage() : "";

    await addDoc(collection(db, "messages"), {
      chatId: id,
      sender: "customer",
      senderName: user.name || "Customer",
      text: message,
      image: imageUrl,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "chats", id), {
      lastMessage: message || "📷 Image",
      lastMessageAt: serverTimestamp(),
      lastSender: "customer",
      sellerUnread: increment(1),
    });

   setMessage("");
setImageFile(null);
setPreview("");
setSending(false);
  };

 return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src="/avatar.png"
            alt="Seller"
             width={56} height={56}
            className="rounded-full border-2 border-white"
          />
          <div>
            <h1 className="text-2xl font-bold">Seller Chat</h1>
            <p className="text-sm flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-400" />
              Online
            </p>
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg: any) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.sender === "customer" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-lg rounded-3xl px-5 py-4 shadow-md ${
                msg.sender === "customer"
                  ? "bg-blue-600 text-white"
                  : "bg-white"
              }`}
            >
              {msg.image && (
                <img
                  src={msg.image}
                  alt="Chat Image"
                  width={224} height={224}
                  className="rounded-xl mb-3 object-cover"
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

      {/* INPUT BAR */}
      <div className="bg-white border-t p-4">
        {preview && (
          <div className="mb-3 relative w-20">
            <img
              src={preview}
              alt="Preview" width={80} height={80}
              className="rounded-xl object-cover"
            />
            <button
              onClick={clearImage}
              className="absolute -top-2 -right-2 bg-red-600 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex gap-4 items-center">
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
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Type message..."
            className="flex-1 border rounded-xl p-3"
          />

          <label
  className="
    cursor-pointer
    bg-gray-100
    hover:bg-gray-200
    px-4
    py-3
    rounded-xl
    text-xl
  "
>
  📷

  <input
    type="file"
    accept="image/*"
    className="hidden"
    onChange={(e) => {
      const file = e.target.files?.[0];

      if (file) {
        setImageFile(file);
        setPreview(URL.createObjectURL(file));
      }
    }}
  />

</label>

          <button
            onClick={sendMessage}  disabled={sending}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 rounded-xl font-semibold transition"
          >
     {sending ? "Sending..." : "📤 Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
