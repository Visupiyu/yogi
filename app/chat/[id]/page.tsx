"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db, storage, auth } from "@/lib/firebase";
import { chatImagePath } from "@/lib/storagePaths";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";

export default function ChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const bottomRef = useRef<HTMLDivElement>(null);

  const [message, setMessage] = useState("");
  const [chat,setChat] =useState<any>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview,setPreview] = useState("");
  useEffect(() => { return () => { if (preview) { URL.revokeObjectURL(preview); } };
}, [preview]);
  const clearImage = () => {setImageFile(null); setPreview(""); };
  const [messages, setMessages] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  const uploadImage = async () => {
    if (!imageFile) return "";
    // Uid-scoped: a chat attachment now belongs to whoever sent it, and
    // cannot be replaced by the other party or by any other signed-in user.
    const senderUid = auth.currentUser?.uid;
    if (!senderUid) {
      router.push("/login");
      return "";
    }
    const storageRef = ref(
      storage,
      chatImagePath(senderUid, imageFile)
    );
    await uploadBytes(storageRef, imageFile);
    return await getDownloadURL(storageRef);
  };

 useEffect(() => {
  let unsubscribeSnapshot: (() => void) | undefined;

  const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
    if (!firebaseUser) {
      router.push("/login");
      return;
    }

    updateDoc(doc(db, "chats", id), {
      customerUnread: 0,
    }).catch(() => {});

    const q = query(
      collection(db, "messages"),
      where("chatId", "==", id),
      orderBy("createdAt")
    );
    const loadChat = async () => {

    const snap = await getDoc(
      doc(db, "chats", id)
    );

    if (snap.exists()) {

      setChat({
        id: snap.id,
        ...snap.data(),
      });

    }

  };

  loadChat();
  unsubscribeSnapshot = onSnapshot(q, (snapshot) => {

    console.log("Message count:", snapshot.size);

    const list: any[] = [];

    snapshot.forEach((docSnap) => {

      console.log("Message:", docSnap.data());

      list.push({
        id: docSnap.id,
        ...docSnap.data(),
      });

    });

    setMessages(list);

    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    });

  });
  });

  return () => {
    unsubscribeAuth();
    unsubscribeSnapshot?.();
  };

}, [id, router]);

const sendMessage = async () => {

  if (sending) return;

  if (!message.trim() && !imageFile) {
    return;
  }

  setSending(true);

  try {

    const user = JSON.parse(localStorage.getItem("user") || "{}");

    const imageUrl = imageFile
      ? await uploadImage()
      : "";

    await addDoc(
      collection(db, "messages"),
      {
        chatId: id,
        sender: "customer",
        senderName: user.name || "Customer",
        text: message,
        image: imageUrl,
        createdAt: serverTimestamp(),
      }
    );

    await updateDoc(
      doc(db, "chats", id),
      {
        lastMessage: message || "📷 Image",
        lastMessageAt: serverTimestamp(),
        lastSender: "customer",
        sellerUnread: increment(1),
      }
    );

    setMessage("");
    setImageFile(null);
    setPreview("");

  } catch (error) {

    console.error("Failed to send message:", error);

  } finally {

    setSending(false);

  }

};
 return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* HEADER */}
     <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-5 flex items-center justify-between">
  <div className="flex items-center gap-4">

    <Image
      src={chat?.sellerImage || "/avatar.png"}
      alt={chat?.sellerName || "Seller"}
      width={56}
      height={56}
      className="rounded-full border-2 border-white object-cover"
    />

    <div>
      <h1 className="text-2xl font-bold">
        {chat?.sellerName || "Seller"}
      </h1>

      <p className="text-sm">
        📦 {chat?.productName || "Product"}
      </p>

      <p className="text-sm flex items-center gap-2 mt-1">
        <span className="w-3 h-3 rounded-full bg-green-400" />
        Seller
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
                <Image
  src={msg.image}
  alt="Chat Image"
  width={220}
  height={220}
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
            <Image
              src={preview}
              alt="Preview"
              width={80}
              height={80}
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
