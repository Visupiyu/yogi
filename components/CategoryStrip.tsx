import Link from "next/link";

const categories = [

  "Grocery",
  "fashion",
  "grocery",
  "beauty"

];

export default function CategoryStrip(){

  return (

    <div className="bg-white shadow">

      <div
        className="
          max-w-7xl
          mx-auto
          flex
          gap-6
          overflow-x-auto
          p-4
        "
      >

        {categories.map((cat)=>(

          <Link
            key={cat}
            href={`/category/${cat}`}
            className="
              bg-gray-100
              px-6
              py-3
              rounded-xl
              font-bold
              capitalize
              hover:bg-blue-600
              hover:text-white
              transition
              whitespace-nowrap
            "
          >

            {cat}

          </Link>

        ))}

      </div>

    </div>

  );

}