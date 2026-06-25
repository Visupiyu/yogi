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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  increment
} from "firebase/firestore";

import { db, storage } from "@/lib/firebase";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

export default function ChatRoomPage(){

 const params = useParams();

const id = params.id as string;

 const bottomRef =
  useRef<HTMLDivElement>(null);

const [message,setMessage] =
  useState("");

const [imageFile,setImageFile] =
  useState<File | null>(null);

const [messages,setMessages] =
  useState<any[]>([]);
  
    const uploadImage = async()=>{

  if(!imageFile){

    return "";

  }

  const storageRef = ref(

    storage,

    `chat/${Date.now()}-${imageFile.name}`

  );

  await uploadBytes(

    storageRef,

    imageFile

  );

  return await getDownloadURL(

    storageRef

  );

};

  useEffect(()=>{

    updateDoc(

  doc(
    db,
    "chats",
    id
  ),

  {

 customerUnread:0

  }

).catch(()=>{});

    const q=query(

      collection(
        db,
        "messages"
      ),

      orderBy(
        "createdAt"
      )

    );

    const unsubscribe=

      onSnapshot(

        q,

        (snapshot)=>{

          const list:any[]=[];

          snapshot.forEach(doc=>{

            const data:any={

              id:doc.id,

              ...doc.data()

            };

            if(

              data.chatId===id

            ){

              list.push(data);

            }

          });

          setMessages(list);

          setTimeout(()=>{

            bottomRef.current
            ?.scrollIntoView({

              behavior:"smooth"

            });

          },100);

        }

      );

    return()=>unsubscribe();

  },[id]);

  const sendMessage=
  async()=>{

   if(

  !message.trim() &&

  !imageFile

){

  return;

}

    const user=JSON.parse(

      localStorage.getItem(
        "user"
      ) || "{}"

    );
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

        sender:"customer",

        senderName:
          user.name,

        text:message,

         image:imageUrl,

        createdAt:
          serverTimestamp()

      }

    );
   await updateDoc(

  doc(
    db,
    "chats",
    id 
  ),

  {

   lastMessage:

  message ||

  "📷 Image",

    lastMessageAt:
      serverTimestamp(),

    sellerUnread:
      increment(1)

  }

);

  setMessage("");

setImageFile(null);

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
        from-blue-600
        to-indigo-600
        text-white
        p-6
      ">

        <h1 className="
          text-3xl
          font-bold
        ">
          💬 Chat
        </h1>

      </div>

      <div className="
        flex-1
        overflow-y-auto
        p-6
        space-y-4
      ">

        {messages.map(

          (msg:any)=>(

            <div

              key={msg.id}

              className={`

                flex

                ${

                  msg.sender===

                  "customer"

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

                  "customer"

                  ?

                  "bg-blue-600 text-white"

                  :

                  "bg-white"

                }

              `}>

               {msg.image && (

<img
  src={msg.image}
  alt="Chat Image"
  className="
    w-56
    rounded-xl
    mb-3
    object-cover
  "
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

                      msg.createdAt.seconds

                      *1000

                    ).toLocaleTimeString()

                    :

                    ""

                  }

                </p>

              </div>

            </div>

          )

        )}

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

          onChange={(e)=>

            setMessage(

              e.target.value

            )

          }

          placeholder="Type message..."

          className="
            flex-1
            border
            rounded-xl
            p-3
          "

        />

         <input

  type="file"

  accept="image/*"

  onChange={(e)=>

    setImageFile(

      e.target.files?.[0] || null

    )

  }

/>

        <button

          onClick={
            sendMessage
          }

          className="
            bg-blue-600
            text-white
            px-8
            rounded-xl
          "

        >

          Send

        </button>

      </div>

    </div>

  );

}