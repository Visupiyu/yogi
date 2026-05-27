"use client";

export default function OfferCards(){

  const offers = [

    {

      title:"Fashion Sale",

      subtitle:"Up To 50% OFF",

      image:
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200&auto=format&fit=crop",

      color:"from-pink-500 to-red-500"

    },

    {

      title:"Fresh Grocery",

      subtitle:"Free Delivery",

      image:
        "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200&auto=format&fit=crop",

      color:"from-green-500 to-emerald-600"

    }

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

          <div className={`
            absolute
            inset-0
            bg-gradient-to-r
            ${offer.color}
            opacity-80
          `}>

          </div>

          <div className="
            relative
            z-10
            h-full
            flex
            flex-col
            justify-center
            p-6
            text-white
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
              mt-4
              bg-white
              text-black
              px-5
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