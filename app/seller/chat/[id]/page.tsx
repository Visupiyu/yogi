"use client";

import {
  useEffect,
  useRef,
  useState
} from "react";

import {
  useParams
} from "next/navigation";

import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,where
} from "firebase/firestore";
import Image from "next/image";

import { db } from "@/lib/firebase";

export default function SellerChatRoomPage(){

 const params = useParams();

const id = params.id as string;

  const bottomRef=
    useRef<HTMLDivElement>(null);

  const [message,setMessage]=
    useState("");
    const [imageFile,setImageFile] =
  useState<File | null>(null);

  const [messages,setMessages]=
    useState<any[]>([]);
    const [sending,setSending]=
useState(false);

  useEffect(()=>{

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

    const unsubscribe=

      onSnapshot(

        q,

        (snapshot)=>{

          const list:any[]=[];

         snapshot.forEach((docSnap) => {

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

        }

      );

    return()=>unsubscribe();

  },[id]);

  const sendMessage = async () => {

  if (sending) return;

  if (!message.trim() && !imageFile) {
    return;
  }

  setSending(true);

  try {

    const vendor=JSON.parse(

      localStorage.getItem(
        "vendor"
      ) || "{}"

    );

    await addDoc(

      collection(
        db,
        "messages"
      ),

      {

        chatId:id,

        sender:"seller",

        senderName:
          vendor.businessName ||

          vendor.name ||

          "Seller",

        text:message,

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
setImageFile(null);

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

        <h1 className="
          text-3xl
          font-bold
        ">

          💬 Customer Chat

        </h1>

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
        flex
        gap-4
      ">

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

  );

}