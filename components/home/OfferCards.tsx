"use client";

export default function OfferCards(){

  const offers = [

    {
  title:"Latest Smartphones",

  subtitle:"Up To 40% OFF",

  image:
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=1200&auto=format&fit=crop",

  button:"Shop Mobiles",

  link:"/category/Mobile"
},

    {
  title:"Home Appliances",

  subtitle:"Smart Living Starts Here",

  image:
    "https://images.unsplash.com/photo-1586208958839-06c17cacdf08?q=80&w=1200&auto=format&fit=crop",

  button:"Shop Appliances",

  link:"/category/Appliances"
},
  ];

  return(

    <div className="
      flex
      flex-col
      gap-5
    ">

      {offers.map((offer,index)=>(

        <div

          key={index}

          className="
            relative
            overflow-hidden
            rounded-2xl
            h-[200px]
            shadow-sm
            group
          "
        >

          <img
            src={offer.image}
            alt={offer.title}
            className="
              absolute
              inset-0
              w-full
              h-full
              object-cover
              group-hover:scale-105
              transition
              duration-500
            "
          />

         <div
  className="
    absolute
    inset-0
    bg-black/30
  "
>

          </div>

          <div className="
            relative
            z-10
            h-full
            flex
            flex-col
            justify-center
            p-6
           text-slate-900
          ">

            <p className="
              text-sm
              uppercase
              tracking-wider
              mb-2
            ">

              Limited Offer

            </p>

            <h2 className="
              text-2xl
              font-bold
              mb-2
            ">

              {offer.title}

            </h2>

            <p className="
              text-lg
              font-semibold
            ">

              {offer.subtitle}

            </p>

            <button className="
              mt-*
            bg-white
text-slate-900
hover:bg-gray-100
              px-*
              py-2
              rounded-xl
              font-semibold
              w-fit
            ">

              Shop Now

            </button>

          </div>

        </div>

      ))}

    </div>

  );

}