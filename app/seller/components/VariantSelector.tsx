"use client";

import { CATEGORY_VARIANTS } from "@/lib/catalog/categoryVariants";

interface VariantSelectorProps {

  category: string;

  variants: Record<string, string>;

  onChange: (
    variants: Record<string, string>
  ) => void;

}

export default function VariantSelector({

  category,

  variants,

  onChange,

}: VariantSelectorProps) {

  const fields =

    CATEGORY_VARIANTS[category] || [];

  const handleChange = (

    field: string,

    value: string

  ) => {

    onChange({

      ...variants,

      [field]: value,

    });

  };

  if (fields.length === 0) {

    return (

      <p className="text-gray-500">

        No variants available.

      </p>

    );

  }

  return (

    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

      {fields.map((field) => (

        <div key={field.name}>

          <label className="mb-2 block font-semibold">
  {field.name}
</label>

<select
  value={variants[field.name] || ""}
  onChange={(e) =>
    handleChange(field.name, e.target.value)
  }

  className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-600 focus:outline-none"

          >
 <option value="">
    Select {field.name}
  </option>

  {field.values.map((option: string) => (
    <option
      key={option}
      value={option}
    >
      {option}
    </option>
  ))}
</select>

        </div>

      ))}

    </div>

  );

}