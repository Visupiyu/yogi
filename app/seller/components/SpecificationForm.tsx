"use client";

import { useState } from "react";
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

  // ==========================================
  // Custom specifications (fallback for categories
  // with no predefined field set)
  // ==========================================

  const [newSpecKey, setNewSpecKey] = useState("");
  const [newSpecValue, setNewSpecValue] = useState("");

  const addCustomSpec = () => {
    const key = newSpecKey.trim();
    const value = newSpecValue.trim();

    if (!key || !value) {
      alert("Enter both a name and a value.");
      return;
    }

    if (specifications[key] !== undefined) {
      alert("A specification with this name already exists.");
      return;
    }

    onChange({
      ...specifications,
      [key]: value,
    });

    setNewSpecKey("");
    setNewSpecValue("");
  };

  const removeCustomSpec = (key: string) => {
    const updated = { ...specifications };
    delete updated[key];
    onChange(updated);
  };

  if (fields.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          No predefined specifications for this category yet — add your
          own below.
        </p>

        {Object.entries(specifications).length > 0 && (
          <div className="space-y-2">
            {Object.entries(specifications).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2"
              >
                <span className="text-sm">
                  <span className="font-semibold">{key}:</span> {value}
                </span>
                <button
                  type="button"
                  onClick={() => removeCustomSpec(key)}
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={newSpecKey}
            onChange={(e) => setNewSpecKey(e.target.value)}
            placeholder="Specification name (e.g. Material)"
            className="flex-1 rounded-lg border border-gray-300 p-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <input
            type="text"
            value={newSpecValue}
            onChange={(e) => setNewSpecValue(e.target.value)}
            placeholder="Value (e.g. Cotton)"
            className="flex-1 rounded-lg border border-gray-300 p-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={addCustomSpec}
            className="rounded-lg border border-blue-600 px-5 py-3 font-semibold text-blue-600 hover:bg-blue-50"
          >
            + Add
          </button>
        </div>
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