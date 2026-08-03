"use client";

interface Props {
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;

  brand: string;
  setBrand: React.Dispatch<React.SetStateAction<string>>;

  description: string;
  setDescription: React.Dispatch<
    React.SetStateAction<string>
  >;
}

export default function FormBasicInformation({
  name,
  setName,
  brand,
  setBrand,
  description,
  setDescription,
}: Props) {
  return (
    <div className="space-y-4">

      <input
        type="text"
        placeholder="Product Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
      />

      <input
        type="text"
        placeholder="Brand Name"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
      />

      <textarea
        placeholder="Product Description"
        value={description}
        onChange={(e) =>
          setDescription(e.target.value)
        }
        rows={5}
        className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
      />

    </div>
  );
}