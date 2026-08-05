"use client";

import { categoryFields } from "@/lib/catalog/categoryFields";

interface SpecificationFormProps {

  category: string;

  specifications: Record<string, string>;

  onChange: (
    specifications: Record<string, string>
  ) => void;

}

export default function SpecificationForm({

  category,

  specifications,

  onChange,

}: SpecificationFormProps) {

  const fields = categoryFields[category] ?? [];

  const updateField = (

    key: string,

    value: string

  ) => {

    onChange({

      ...specifications,

      [key]: value,

    });

  };

  if (fields.length === 0) {

    return (

      <div className="rounded-lg border border-dashed p-6 text-center text-gray-500">

        No specifications available for this category.

      </div>

    );

  }

  return (

    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

      {fields.map((field: any) => (

        <div key={field.key}>

          <label className="mb-2 block text-sm font-semibold">

            {field.label}

            {field.required && (

              <span className="ml-1 text-red-500">

                *

              </span>

            )}

          </label>

          <input

            type="text"

            value={

              specifications[field.key] || ""

            }

            onChange={(e)=>

              updateField(

                field.key,

                e.target.value

              )

            }

            placeholder={field.placeholder || field.label}

            className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-600 focus:outline-none"

          />

        </div>

      ))}

    </div>

  );

}