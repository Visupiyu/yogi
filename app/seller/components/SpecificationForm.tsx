"use client";

import { categoryFields } from "@/lib/catalog/categoryFields";

interface SpecificationFormProps {
  categoryId: string;
  subCategoryId?: string;
  leafCategoryId?: string;
  specifications: Record<string, string>;
  onChange: (
    specifications: Record<string, string>
  ) => void;
}

export default function SpecificationForm({
  categoryId,
  subCategoryId,
  leafCategoryId,
  specifications,
  onChange,
}: SpecificationFormProps) {
 // categoryFields is keyed by specific leaf-style codes (e.g. MEN_TSHIRTS),
 // not top-level categories — try the most specific level the seller
 // picked first. No fallback to an unrelated category's fields: showing
 // the wrong fields (e.g. t-shirt sizing on a phone listing) is worse
 // than showing none.
 const fields =
  categoryFields[leafCategoryId ?? ""] ??
  categoryFields[subCategoryId ?? ""] ??
  categoryFields[categoryId] ??
  [];

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
        <div key={field.id}>

          {/* LABEL */}

          <label className="mb-2 block text-sm font-semibold text-gray-800">
            {field.label}

            {field.required && (
              <span className="ml-1 text-red-500">
                *
              </span>
            )}
          </label>

          {/* SELECT */}

          {field.type === "select" ? (
            <select
              value={
                specifications[field.id] || ""
              }
              onChange={(e) =>
                updateField(
                  field.id,
                  e.target.value
                )
              }
              className="
                w-full
                rounded-lg
                border
                border-gray-300
                bg-white
                p-3
                focus:border-blue-600
                focus:outline-none
                focus:ring-2
                focus:ring-blue-100
              "
            >
              <option value="">
                {field.placeholder ||
                  `Select ${field.label}`}
              </option>

              {(field.options || []).map(
                (option: string) => (
                  <option
                    key={option}
                    value={option}
                  >
                    {option}
                  </option>
                )
              )}
            </select>
          ) : (

            /* TEXT INPUT */

            <input
              type="text"
              value={
                specifications[field.id] || ""
              }
              onChange={(e) =>
                updateField(
                  field.id,
                  e.target.value
                )
              }
              placeholder={
                field.placeholder ||
                field.label
              }
              className="
                w-full
                rounded-lg
                border
                border-gray-300
                p-3
                focus:border-blue-600
                focus:outline-none
                focus:ring-2
                focus:ring-blue-100
              "
            />

          )}

          {/* HELP TEXT */}

          {field.helpText && (
            <p className="mt-1 text-xs text-gray-500">
              {field.helpText}
            </p>
          )}

        </div>
      ))}
    </div>
  );
}