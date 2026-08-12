"use client";

import {
  useEffect,
  useRef,
  useState
} from "react";

import {
  useParams,
  useRouter
} from "next/navigation";

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
import Image from "next/image";

import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

export default function SellerChatRoomPage(){

 const params = useParams();
 const router = useRouter();

const id = params.id as string;

  const bottomRef=
    useRef<HTMLDivElement>(null);

  const [message,setMessage]=
    useState("");
    const [imageFile,setImageFile] =
  useState<File | null>(null);
    const [preview,setPreview] =
  useState("");

  const [messages,setMessages]=
    useState<any[]>([]);
    const [chat,setChat] =
useState<any>(null);
    const [sending,setSending]=
useState(false);
    const [sellerName,setSellerName] =
useState("Seller");

  const clearImage = () => {
    setImageFile(null);
    setPreview("");
  };

  useEffect(()=>{

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {

      if (!user) {
        router.push("/vendor-login");
        return;
      }

      setSellerName(user.displayName || "Seller");

    });

    updateDoc(

      doc(
        db,
        "chats",
        id as string
      ),

      {

        sellerUnread:0

      }

    ).catch(()=>{});

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
      ...snap.data(),
      id: snap.id,
    });

  }

};

loadChat();

    const unsubscribe=

      onSnapshot(

        q,

        (snapshot)=>{

          const list:any[]=[];

         snapshot.forEach((docSnap) => {

  list.push({

    ...docSnap.data(),

    id: docSnap.id,

  });

});

          setMessages(list);

         requestAnimationFrame(() => {

  bottomRef.current?.scrollIntoView({

    behavior: "smooth",

  });

});

        }

      );

    return()=>{
      unsubscribeAuth();
      unsubscribe();
    };

  },[id, router]);

  const uploadImage = async () => {

    if (!imageFile) return "";

    const storageRef = ref(
      storage,
      `chat/${Date.now()}-${imageFile.name}`
    );

    await uploadBytes(storageRef, imageFile);

    return await getDownloadURL(storageRef);

  };

  const sendMessage = async () => {

  if (sending) return;

  if (!message.trim() && !imageFile) {
    return;
  }

  setSending(true);

  try {

    const imageUrl = imageFile
      ? await uploadImage()
      : "";

    await addDoc(

      collection(
        db,
        "messages"
      ),

      {

        chatId:id,

        sender:"seller",

        senderName:
          sellerName,

        text:message,

        image:imageUrl,

        createdAt:
          serverTimestamp()

      }

    );

   await updateDoc(
  doc(db, "chats", id),
  {
    lastMessage: message || "📷 Image",
    lastMessageAt: serverTimestamp(),
    lastSender: "seller",
    customerUnread: increment(1),
  }
);



   setMessage("");
clearImage();

} finally {

  setSending(false);

}

  };

  

  return(

    <div className="
      min-h-screen
      bg-gray-100
      flex
      flex-col
    ">

      <div className="
        bg-gradient-to-r
        from-green-600
        to-blue-600
        text-white
        p-6
      ">

        <h1 className="text-3xl font-bold">

💬 {chat?.customerName || "Customer"}

</h1>

<p className="mt-2 opacity-90">

📦 {chat?.productName}

</p>

      </div>

      <div className="
        flex-1
        overflow-y-auto
        p-6
        space-y-4
      ">

        {

          messages.map(

            (msg:any)=>(

              <div

                key={msg.id}

                className={`

                  flex

                  ${

                    msg.sender===

                    "seller"

                    ?

                    "justify-end"

                    :

                    "justify-start"

                  }

                `}

              >

                <div className={`

                  max-w-md

                  rounded-3xl

                  px-5

                  py-3

                  ${

                    msg.sender===

                    "seller"

                    ?

                    "bg-green-600 text-white"

                    :

                    "bg-white"

                  }

                `}>

                  {msg.image && (

<Image
  src={msg.image}
  alt="Chat Image"
  width={220}
  height={220}
  className="rounded-xl mb-3 object-cover"
/>

)}

{msg.text && (

<p>

  {msg.text}

</p>

)}
                  <p className="
                    text-xs
                    mt-2
                    opacity-70
                  ">

                    {

                      msg.createdAt

                      ?.seconds

                      ?

                      new Date(

                        msg.createdAt.seconds*

                        1000

                      ).toLocaleTimeString()

                      :

                      ""

                    }

                  </p>

                </div>

              </div>

            )

          )

        }

        <div ref={bottomRef}/>

      </div>

      <div className="
        bg-white
        border-t
        p-4
      ">

        {preview && (

          <div className="mb-3 w-20 relative">

            <img
              src={preview}
              alt=""
              className="w-20 h-20 rounded-xl object-cover"
            />

            <button
              type="button"
              onClick={clearImage}
              className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6"
            >
              ×
            </button>

          </div>

        )}

        <div className="flex gap-4">

        <input
  value={message}
  onChange={(e) =>
    setMessage(e.target.value)
  }
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  }}

          placeholder="Reply to customer..."

          className="
            flex-1
            border
            rounded-xl
            p-3
          "

        />

        <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-4 py-3 rounded-xl">

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
  onClick={sendMessage}
  disabled={sending}
  className="
    bg-green-600
    text-white
    px-8
    rounded-xl
    disabled:opacity-50
    disabled:cursor-not-allowed
  "
>
  {sending ? "Sending..." : "Send"}
</button>

        </div>

      </div>

    </div>

  );

}