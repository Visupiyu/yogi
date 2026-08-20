"use client";

import { useState } from "react";
import { toast } from "sonner";
import AIChatWidget from "@/components/ai/AIChatWidget";
import { auth } from "@/lib/firebase";
export default function SellerAssistantPage(){

  const [productName,setProductName] =useState("");
  const [category,setCategory] =useState("");
  const [generating,setGenerating] =useState(false);
  const [description,setDescription] =useState("");
  const [seoTitle,setSeoTitle] =useState("");
  const [tags,setTags] =useState("");
    const [tips,setTips] =useState<string[]>([]);
  const [socialPost,setSocialPost] =useState("");
const [emailContent,setEmailContent] =useState("");
const [offerText,setOfferText] =useState("");
const [hindiDescription,setHindiDescription] =
  useState("");
  const [whatsappMessage,setWhatsappMessage] =
  useState("");

const [googleHeadline,setGoogleHeadline] =
  useState("");

const [bulletPoints,setBulletPoints] =
  useState<string[]>([]);

const copyText = (

  text:string

)=>{

  navigator.clipboard.writeText(text);

 toast.success("Copied to clipboard.");

};

 // Previously just interpolated productName into fixed template
 // strings — the same generic "Premium Quality / Fast Delivery" copy
 // for every single product, AI in name only. Now calls the real
 // YOMICO AI Engine (Seller AI layer) via app/api/ai/seller-assistant.
 const generateContent = async ()=>{
  if(!productName){
    toast.error("Please enter a product name.");
    return;
  }

  // The generator endpoint now requires a signed-in caller, since each run
  // costs real AI spend. The seller dashboard already gates this page, so
  // this only fails if the session expired mid-visit.
  const currentUser = auth.currentUser;
  if (!currentUser) {
    toast.error("Please sign in again.");
    return;
  }

  setGenerating(true);

  try {
    const idToken = await currentUser.getIdToken();

    const response = await fetch("/api/ai/seller-assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ productName, category }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Failed to generate content.");
    }

    setDescription(data.description || "");
    setSeoTitle(data.seoTitle || "");
    setTags(data.tags || "");
    setTips(Array.isArray(data.tips) ? data.tips : []);
    setSocialPost(data.socialPost || "");
    setEmailContent(data.emailContent || "");
    setOfferText(data.offerText || "");
    setHindiDescription(data.hindiDescription || "");
    setWhatsappMessage(data.whatsappMessage || "");
    setGoogleHeadline(data.googleHeadline || "");
    setBulletPoints(Array.isArray(data.bulletPoints) ? data.bulletPoints : []);

    toast.success("AI content generated.");
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to generate content. Please try again.";
    toast.error(message);
  } finally {
    setGenerating(false);
  }
};


  return(
    <div className="min-h-screen bg-gray-100 p-6 ">
      <div className="max-w-5xl  mx-auto ">
        <div className=" bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">
            🤖 AI Seller Assistant
          </h1>
          <p className="mt-2">
            Generate product content instantly
          </p>
        </div>

        <div className="mb-8">
          <AIChatWidget
            endpoint="/api/ai/seller/chat"
            title="Seller Assistant"
            subtitle="Ask about your sales, orders and inventory"
            suggestedQuestions={[
              "How are my sales this month?",
              "Which of my products are low on stock?",
              "What are my total earnings so far?",
            ]}
          />
        </div>

        <div className="bg-white rounded-3xl shadow p-8 ">
          <div className="
            grid
            md:grid-cols-2
            gap-6
          ">
            <div>
              <label className="
                font-semibold
              ">
                Product Name
              </label>

              <input

                value={productName}

                onChange={(e)=>

                  setProductName(
                    e.target.value
                  )

                }

                className="
                  w-full
                  border
                  p-3
                  rounded-xl
                  mt-2
                "
              />

            </div>

            <div>

              <label className="
                font-semibold
              ">
                Category
              </label>

              <input

                value={category}

                onChange={(e)=>

                  setCategory(
                    e.target.value
                  )

                }

                className="
                  w-full
                  border
                  p-3
                  rounded-xl
                  mt-2
                "
              />

            </div>

          </div>

          <button

            onClick={
              generateContent
            }

            disabled={generating}

            className="
              mt-8
              bg-indigo-600
              text-white
              px-8
              py-3
              rounded-xl
              disabled:opacity-60
            "

          >

            {generating ? "Generating…" : "Generate AI Content"}

          </button>

          <div className="
            mt-10
            space-y-8
          ">

            <div>

              <h2 className="
                text-xl
                font-bold
                mb-3
              ">
                Product Description
              </h2>
            

              <div className="space-y-3">

  <textarea

    value={description}

    onChange={(e)=>

      setDescription(
        e.target.value
      )

    }

    rows={6}

    className="
      w-full
      border
      rounded-xl
      p-4
    "

  />

  <button

    onClick={()=>

      copyText(description)

    }

    className="
      bg-blue-600
      text-white
      px-5
      py-2
      rounded-lg
    "

  >

    Copy Description

  </button>

</div>
</div>
<div>

              <h2 className="
                text-xl
                font-bold
                mb-3
              ">
                SEO Title
              </h2>

              <input

                value={seoTitle}

                onChange={(e)=>

                  setSeoTitle(
                    e.target.value
                  )

                }

                className="
                  w-full
                  border
                  rounded-xl
                  p-4
                "

              />

            </div>
            <button

  onClick={()=>

    copyText(seoTitle)

  }

  className="
    mt-3
    bg-indigo-600
    text-white
    px-5
    py-2
    rounded-lg
  "

>

  Copy SEO Title

</button>

            <div>

              <h2 className="
                text-xl
                font-bold
                mb-3
              ">
                SEO Tags
              </h2>

              <textarea

                value={tags}

                onChange={(e)=>

                  setTags(
                    e.target.value
                  )

                }

                rows={4}

                className="
                  w-full
                  border
                  rounded-xl
                  p-4
                "

              />
              <button

  onClick={()=>

    copyText(tags)

  }

  className="
    mt-3
    bg-indigo-600
    text-white
    px-5
    py-2
    rounded-lg
  "

>

  Copy SEO Tags

</button>

            </div>
            <div className="
  mt-10
">

  <h2 className="
    text-2xl
    font-bold
    mb-3
  ">
    🌍 Hindi Description
  </h2>

  <textarea

    value={hindiDescription}

    onChange={(e)=>

      setHindiDescription(
        e.target.value
      )

    }

    rows={6}

    className="
      w-full
      border
      rounded-xl
      p-4
    "

  />

  <button

    onClick={()=>

      copyText(
        hindiDescription
      )

    }

    className="
      mt-3
      bg-green-600
      text-white
      px-5
      py-2
      rounded-lg
    "

  >

    Copy Hindi Description

  </button>

</div>
            <div className="
  mt-10
">

  <h2 className="
    text-2xl
    font-bold
    mb-6
  ">
    📈 AI Business Suggestions
  </h2>

  <div className="
    space-y-4
  ">

    {tips.map(

      (tip,index)=>(

        <div

          key={index}

          className="
            bg-green-50
            border-l-4
            border-green-600
            p-4
            rounded-xl
          "
        >

          {tip}

        </div>

      )

    )}

  </div>

</div>
<div className="
  mt-12
  space-y-8
">

  <div>

    <h2 className="
      text-2xl
      font-bold
      mb-3
    ">
      📱 Social Media Post
    </h2>

    <textarea

      value={socialPost}

      onChange={(e)=>
        setSocialPost(
          e.target.value
        )
      }

      rows={6}

      className="
        w-full
        border
        rounded-xl
        p-4
      "
    />

    <button

  onClick={()=>

    copyText(socialPost)

  }

  className="
    mt-3
    bg-indigo-600
    text-white
    px-5
    py-2
    rounded-lg
  "

>

  Copy Social Post

</button>

  </div>

  <div>

    <h2 className="
      text-2xl
      font-bold
      mb-3
    ">
      📧 Promotional Email
    </h2>

    <textarea

      value={emailContent}

      onChange={(e)=>
        setEmailContent(
          e.target.value
        )
      }

      rows={8}

      className="
        w-full
        border
        rounded-xl
        p-4
      "
    />

    <button

  onClick={()=>

    copyText(emailContent)

  }

  className="
    mt-3
    bg-indigo-600
    text-white
    px-5
    py-2
    rounded-lg
  "

>

  Copy Email

</button>

  </div>

  <div>

    <h2 className="
      text-2xl
      font-bold
      mb-3
    ">
      🎉 Promotional Offer
    </h2>

    <textarea

      value={offerText}

      onChange={(e)=>
        setOfferText(
          e.target.value
        )
      }

      rows={5}

      className="
        w-full
        border
        rounded-xl
        p-4
      "
    />
    <button

  onClick={()=>

    copyText(offerText)

  }

  className="
    mt-3
    bg-indigo-600
    text-white
    px-5
    py-2
    rounded-lg
  "

>

  Copy Offer

</button>

  </div>

</div>
</div>
<div className="mt-10">

  <h2 className="text-2xl font-bold mb-3">
    🎯 Google Ads Headline
  </h2>

  <input
    value={googleHeadline}
    onChange={(e)=>
      setGoogleHeadline(e.target.value)
    }
    className="w-full border rounded-xl p-4"
  />

  <button
    onClick={()=>
      copyText(googleHeadline)
    }
    className="mt-3 bg-indigo-600 text-white px-5 py-2 rounded-lg"
  >
    Copy Headline
  </button>

</div>
<div className="mt-10">

  <h2 className="text-2xl font-bold mb-3">
    📱 WhatsApp Promotion
  </h2>

  <textarea
    value={whatsappMessage}
    onChange={(e)=>
      setWhatsappMessage(e.target.value)
    }
    rows={5}
    className="w-full border rounded-xl p-4"
  />

  <button
    onClick={()=>
      copyText(whatsappMessage)
    }
    className="mt-3 bg-green-600 text-white px-5 py-2 rounded-lg"
  >
    Copy WhatsApp Message
  </button>

</div>
<div className="mt-10">

  <h2 className="text-2xl font-bold mb-3">
    ⭐ Product Highlights
  </h2>

  <ul className="space-y-3">

    {bulletPoints.map((point,index)=>(

      <li
        key={index}
        className="bg-yellow-50 p-3 rounded-xl"
      >

        ✅ {point}

      </li>

    ))}

  </ul>

</div>


          </div>

        </div>

      </div>

);

}