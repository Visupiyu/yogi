"use client";

import { CategoryField } from "@/lib/catalog/categoryFields";

interface Props {
  groupedFields: Record<string, CategoryField[]>;
  attributes: Record<string, string>;
  setAttributes: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
}

export default function SellerProductSpecifications({
  groupedFields,
  attributes,
  setAttributes,
}: Props) {
  return (
    <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">

      <h2 className="text-xl font-bold mb-1">
        📦 Product Specifications
      </h2>

      <p className="text-sm text-gray-500 mb-5">
        Specifications are automatically loaded based on the selected category.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {Object.entries(groupedFields).map(
          ([groupName, fields]) => (

            <div
              key={groupName}
              className="col-span-2"
            >

              <h3 className="text-lg font-semibold border-b pb-2 mb-4 mt-2">
                {groupName}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {fields.map((field) => (

                  <div key={field.id}>

                    <label className="block text-sm font-medium mb-2">
                      {field.label}
                    </label>

                    {field.type === "select" ? (

                      <select
                        value={attributes[field.id] || ""}
                        onChange={(e) =>
                          setAttributes((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                        className="w-full p-3 border rounded-xl"
                      >
                        <option value="">
                          Select {field.label}
                        </option>

                        {field.options?.map((option) => (
                          <option
                            key={option}
                            value={option}
                          >
                            {option}
                          </option>
                        ))}

                      </select>

                    ) : (

                      <input
                        type={
                          field.type === "number"
                            ? "number"
                            : "text"
                        }
                        value={attributes[field.id] || ""}
                        onChange={(e) =>
                          setAttributes((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                        placeholder={`Enter ${field.label}`}
                        className="w-full p-3 border rounded-xl"
                      />

                    )}

                  </div>

                ))}

              </div>

            </div>

          )
        )}

      </div>

    </div>
  );
}