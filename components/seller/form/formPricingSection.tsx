"use client";

interface Props {
  price: string;
  setPrice: React.Dispatch<React.SetStateAction<string>>;

  mrp: string;
  setMrp: React.Dispatch<React.SetStateAction<string>>;

  stock: string;
  setStock: React.Dispatch<React.SetStateAction<string>>;
}

export default function FormPricingSection({
  price,
  setPrice,
  mrp,
  setMrp,
  stock,
  setStock,
}: Props) {
  return (
    <div className="space-y-4">

      <div className="grid grid-cols-2 gap-3">

        <input
          type="number"
          placeholder="Price"
          value={price}
          onChange={(e) =>
            setPrice(e.target.value)
          }
          className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
        />

        <input
          type="number"
          placeholder="Stock"
          value={stock}
          onChange={(e) =>
            setStock(e.target.value)
          }
          className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
        />

      </div>

      <input
        type="number"
        placeholder="MRP"
        value={mrp}
        onChange={(e) =>
          setMrp(e.target.value)
        }
        className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
      />

    </div>
  );
}