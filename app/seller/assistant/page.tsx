"use client";

import { useState } from "react";
import { toast } from "sonner";
export default function SellerAssistantPage(){

  const [productName,setProductName] =useState("");
  const [category,setCategory] =useState("");
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

 const generateContent = ()=>{if(!productName){toast.error("Please enter a product name.");
    return;
  }
  setDescription(
    `${productName} is a premium quality ${category || "product"} designed for durability, excellent performance and everyday use. Carefully selected for customers looking for quality and value.`
  );

  setSeoTitle(`Buy ${productName} Online at Best Price | YOMICO`
  );

  setTags(`${productName}, ${category}, Online Shopping, Best Price, YOMICO`
  );

  setTips(["📈 Keep at least 20 units in stock.",

    "⭐ Encourage customers to leave reviews after delivery.",

    "🏷️ Use attractive product images from multiple angles.",

    "🚚 Offer fast delivery for better conversions.",

    "💰 Run discounts during weekends to increase sales.",

    "🔥 Add 5–10 SEO keywords to improve search visibility."

  ]);
  setSocialPost(`🔥 ${productName} is now available on YOMICO!

✨ Premium Quality
🚚 Fast Delivery
💰 Best Price

Order today and enjoy a great shopping experience!

#YOMICO #${productName.replace(/\s+/g,"")}`

);

setEmailContent(`Subject: Special Offer on ${productName}

Dear Customer,

We're excited to introduce our latest ${productName}.

✔ Premium Quality
✔ Affordable Price
✔ Fast Delivery

Visit YOMICO today and place your order.

Thank you for shopping with us.

Team YOMICO`

);

setOfferText(`🎉 Limited Time Offer!

Buy ${productName} today and enjoy amazing savings only on YOMICO.

Shop Now!`

);

setHindiDescription(

`${productName} एक उच्च गुणवत्ता वाला ${category || "उत्पाद"} है जो बेहतर प्रदर्शन, टिकाऊ गुणवत्ता और उचित कीमत के साथ उपलब्ध है। केवल YOMICO पर खरीदें।`

);

setWhatsappMessage(

`🛍️ ${productName}

✨ Premium Quality
🚚 Fast Delivery
💰 Best Price

Shop now on YOMICO!

https://yomico.in`

);

setGoogleHeadline(

`Buy ${productName} Online | Best Price | YOMICO`

);

setBulletPoints([

  "Premium Quality",

  "Affordable Price",

  "Fast Delivery",

  "Trusted Seller",

  "Easy Returns"

]);

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

            className="
              mt-8
              bg-indigo-600
              text-white
              px-8
              py-3
              rounded-xl
            "

          >

            Generate AI Content

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