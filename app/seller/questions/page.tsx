"use client";

import {
  useEffect,
  useState
} from "react";
import { useRouter } from "next/navigation";

import {
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";

import { auth, db }
from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function SellerQuestionsPage(){

  const router = useRouter();

  const [questions,
  setQuestions] =
  useState<any[]>([]);

  const [loading,
  setLoading] =
  useState(true);

  const [vendorUid, setVendorUid] =
  useState("");

  useEffect(()=>{

    const unsubscribe = onAuthStateChanged(auth, (user) => {

      if (!user) {
        router.push("/vendor-login");
        return;
      }

      setVendorUid(user.uid);
      loadQuestions(user.uid);

    });

    return () => unsubscribe();

  },[router]);

 const loadQuestions = async (vendorUid: string) => {

  try {

    const snapshot = await getDocs(

      query(

        collection(db, "productQuestions"),

        where(
          "vendorId",
          "==",
          vendorUid
        )

      )

    );

    const data: any[] = [];

    snapshot.forEach((docSnap) => {

      data.push({

        ...docSnap.data(),

        id: docSnap.id,

      });

    });

    setQuestions(data);

  } catch (error) {

    console.log(error);

  } finally {

    setLoading(false);

  }

};
  const saveAnswer =
  async(
    id:string,
    answer:string
  )=>{

    try{

      // app/api/seller/questions/[id]/answer checks the PRODUCT is this
      // seller's before saving (a question's own vendorId is not trusted).
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch(
        `/api/seller/questions/${encodeURIComponent(id)}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ answer }),
        }
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        alert(result?.error || "Couldn't save your answer.");
        return;
      }

      alert(
        "Answer Saved"
      );

      loadQuestions(vendorUid);

    }catch(error){

      console.log(error);

    }

  };

  if(loading){

    return(

      <div className="
        p-10
        text-center
      ">
        Loading...
      </div>

    );

  }

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-4 md:p-6
    ">

      <div className="
        max-w-6xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-green-600
          to-blue-600
          text-white
          p-5 md:p-8
          rounded-3xl
          mb-8
        ">

          <h1 className="
            text-3xl md:text-4xl
            font-bold
          ">
            Product Questions
          </h1>

          <p>
            Answer customer questions
          </p>

        </div>

        <div className="
          space-y-6
        ">

          {questions.length === 0 && (

            <div className="
              bg-white
              p-8
              rounded-3xl
              text-center
            ">

              No Questions Found

            </div>

          )}

          {questions.map((item)=>{

            let answerText =
              item.answer || "";

            return(

              <div
                key={item.id}
                className="
                  bg-white
                  p-6
                  rounded-3xl
                  shadow
                "
              >

                <h3 className="
                  font-bold
                  text-lg break-words
                ">
                  {item.productName}
                </h3>

                <p className="
                  mt-3 break-words
                ">
                  ❓
                  {" "}
                  {item.question}
                </p>

                <p className="
                  text-sm
                  text-gray-500
                  mt-2 break-words
                ">
                  {item.customerName}
                </p>

                <textarea

                  defaultValue={
                    item.answer
                  }

                  onChange={(e)=>{

                    answerText =
                      e.target.value;

                  }}

                  placeholder="
                  Write answer..."

                  className="
                    w-full
                    border
                    rounded-xl
                    p-3
                    mt-4
                    min-h-[120px]
                  "
                />

                <button

                  onClick={()=>

                    saveAnswer(

                      item.id,

                      answerText

                    )

                  }

                  className="
                    mt-4
                    bg-green-600
                    text-white
                    px-6
                    py-3
                    rounded-xl
                  "
                >

                  Save Answer

                </button>

              </div>

            );

          })}

        </div>

      </div>

    </div>

  );

}