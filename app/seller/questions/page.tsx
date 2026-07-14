"use client";

import {
  useEffect,
  useState
} from "react";

import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where
} from "firebase/firestore";

import { db }
from "@/lib/firebase";

export default function SellerQuestionsPage(){

  const [questions,
  setQuestions] =
  useState<any[]>([]);

  const [loading,
  setLoading] =
  useState(true);

  useEffect(()=>{

    loadQuestions();

  },[]);

 const loadQuestions = async () => {

  try {

    const vendor = JSON.parse(
      localStorage.getItem("vendor") || "{}"
    );

    const snapshot = await getDocs(

      query(

        collection(db, "productQuestions"),

        where(
          "vendorId",
          "==",
          vendor.vendorId
        )

      )

    );

    const data: any[] = [];

    snapshot.forEach((docSnap) => {

      data.push({

        id: docSnap.id,

        ...docSnap.data(),

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

      await updateDoc(

        doc(
          db,
          "productQuestions",
          id
        ),

        {

          answer,

          status:
            "Answered"

        }

      );

      alert(
        "Answer Saved"
      );

      loadQuestions();

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
      p-6
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
          p-8
          rounded-3xl
          mb-8
        ">

          <h1 className="
            text-4xl
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
                  text-lg
                ">
                  {item.productName}
                </h3>

                <p className="
                  mt-3
                ">
                  ❓
                  {" "}
                  {item.question}
                </p>

                <p className="
                  text-sm
                  text-gray-500
                  mt-2
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