"use client";

import { useState } from "react";
import { CATEGORY_VARIANTS } from "@/lib/catalog/categoryVariants";

interface ProductVariant {
  id: string;
  attributes: Record<string, string>;
  stock: number;
  price: number;
}

interface VariantSelectorProps {
  category: string;
  variants: ProductVariant[];
  onChange: (variants: ProductVariant[]) => void;
}

export default function VariantSelector({
  category,
  variants,
  onChange,
}: VariantSelectorProps) {
  const fields =
    CATEGORY_VARIANTS[category.toUpperCase()] || [];

  // ==========================================
  // Custom colors and sizes
  // ==========================================

  const [customColors, setCustomColors] =
    useState<string[]>([]);

  const [customSizes, setCustomSizes] =
    useState<string[]>([]);

  const [newColor, setNewColor] =
    useState("");

  const [newSize, setNewSize] =
    useState("");

  // ==========================================
  // Selected values
  // ==========================================

  const [selectedValues, setSelectedValues] =
    useState<Record<string, string>>({});

  // ==========================================
  // Get field values
  // ==========================================

  const getFieldValues = (
    fieldName: string
  ): string[] => {
    const field = fields.find(
      (item) => item.name === fieldName
    );

    const defaultValues =
      field?.values || [];

    if (fieldName === "Color") {
      return [
        ...defaultValues,
        ...customColors,
      ];
    }

    if (fieldName === "Size") {
      return [
        ...defaultValues,
        ...customSizes,
      ];
    }

    return defaultValues;
  };

  // ==========================================
  // Add custom color
  // ==========================================

  const addColor = () => {
    const color = newColor.trim();

    if (!color) {
      alert("Please enter a color.");
      return;
    }

    const existingDefaultColors =
      getFieldValues("Color");

    const alreadyExists =
      existingDefaultColors.some(
        (item) =>
          item.toLowerCase() ===
          color.toLowerCase()
      );

    if (alreadyExists) {
      alert("This color already exists.");
      return;
    }

    setCustomColors((previous) => [
      ...previous,
      color,
    ]);

    setNewColor("");
  };

  // ==========================================
  // Add custom size
  // ==========================================

  const addSize = () => {
    const size = newSize.trim();

    if (!size) {
      alert("Please enter a size.");
      return;
    }

    const existingDefaultSizes =
      getFieldValues("Size");

    const alreadyExists =
      existingDefaultSizes.some(
        (item) =>
          item.toLowerCase() ===
          size.toLowerCase()
      );

    if (alreadyExists) {
      alert("This size already exists.");
      return;
    }

    setCustomSizes((previous) => [
      ...previous,
      size,
    ]);

    setNewSize("");
  };

  // ==========================================
  // Attribute change
  // ==========================================

  const handleAttributeChange = (
    fieldName: string,
    value: string
  ) => {
    setSelectedValues((previous) => ({
      ...previous,
      [fieldName]: value,
    }));
  };

  // ==========================================
  // Add variant
  // ==========================================

  const addVariant = () => {
    const attributes: Record<
      string,
      string
    > = {};

    for (const field of fields) {
      const value =
        selectedValues[field.name];

      if (!value) {
        alert(
          `Please select ${field.name}.`
        );
        return;
      }

      attributes[field.name] = value;
    }

    const alreadyExists =
      variants.some((variant) =>
        fields.every(
          (field) =>
            variant.attributes[
              field.name
            ] ===
            attributes[field.name]
        )
      );

    if (alreadyExists) {
      alert(
        "This variant already exists."
      );
      return;
    }

    const newVariant: ProductVariant = {
      id:
        typeof crypto !==
          "undefined" &&
        crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,

      attributes,

      stock: 0,

      price: 0,
    };

    onChange([
      ...variants,
      newVariant,
    ]);

    setSelectedValues({});
  };

  // ==========================================
  // Update variant
  // ==========================================

  const updateVariant = (
    id: string,
    field: "stock" | "price",
    value: number
  ) => {
    const updatedVariants =
      variants.map((variant) =>
        variant.id === id
          ? {
              ...variant,
              [field]: value,
            }
          : variant
      );

    onChange(updatedVariants);
  };

  // ==========================================
  // Remove variant
  // ==========================================

  const removeVariant = (
    id: string
  ) => {
    const updatedVariants =
      variants.filter(
        (variant) =>
          variant.id !== id
      );

    onChange(updatedVariants);
  };

  // ==========================================
  // No variants
  // ==========================================

  if (fields.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-gray-500">
        No variants available for this
        category.
      </div>
    );
  }

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="space-y-6">

      {/* ================================== */}
      {/* PRODUCT VARIANTS */}
      {/* ================================== */}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">

        <h3 className="mb-5 text-lg font-bold text-gray-900">
          Product Variants
        </h3>

        {/* ============================== */}
        {/* COLOR + SIZE */}
        {/* ============================== */}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

          {fields.map((field) => {

            const values =
              getFieldValues(
                field.name
              );

            return (
              <div
                key={field.name}
              >

                <label className="mb-2 block font-semibold text-gray-800">
                  {field.name}
                </label>

                <select
                  value={
                    selectedValues[
                      field.name
                    ] || ""
                  }
                  onChange={(e) =>
                    handleAttributeChange(
                      field.name,
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
                  "
                >

                  <option value="">
                    Select{" "}
                    {field.name}
                  </option>

                  {values.map(
                    (option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    )
                  )}

                </select>

                {/* ====================== */}
                {/* ADD COLOR */}
                {/* ====================== */}

                {field.name ===
                  "Color" && (
                  <div className="mt-3 flex gap-2">

                    <input
                      type="text"
                      value={newColor}
                      onChange={(e) =>
                        setNewColor(
                          e.target.value
                        )
                      }
                      placeholder="Enter custom color"
                      className="
                        flex-1
                        rounded-lg
                        border
                        border-gray-300
                        p-3
                        focus:border-blue-600
                        focus:outline-none
                      "
                    />

                    <button
                      type="button"
                      onClick={addColor}
                      className="
                        rounded-lg
                        border
                        border-blue-600
                        px-4
                        py-2
                        font-semibold
                        text-blue-600
                        hover:bg-blue-50
                      "
                    >
                      + Add Color
                    </button>

                  </div>
                )}

                {/* ====================== */}
                {/* ADD SIZE */}
                {/* ====================== */}

                {field.name ===
                  "Size" && (
                  <div className="mt-3 flex gap-2">

                    <input
                      type="text"
                      value={newSize}
                      onChange={(e) =>
                        setNewSize(
                          e.target.value
                        )
                      }
                      placeholder="Enter custom size"
                      className="
                        flex-1
                        rounded-lg
                        border
                        border-gray-300
                        p-3
                        focus:border-blue-600
                        focus:outline-none
                      "
                    />

                    <button
                      type="button"
                      onClick={addSize}
                      className="
                        rounded-lg
                        border
                        border-blue-600
                        px-4
                        py-2
                        font-semibold
                        text-blue-600
                        hover:bg-blue-50
                      "
                    >
                      + Add Size
                    </button>

                  </div>
                )}

              </div>
            );
          })}

        </div>

        {/* ================================= */}
        {/* ADD VARIANT */}
        {/* ================================= */}

        <button
          type="button"
          onClick={addVariant}
          className="
            mt-6
            rounded-lg
            bg-blue-600
            px-5
            py-3
            font-semibold
            text-white
            transition
            hover:bg-blue-700
          "
        >
          + Add Variant
        </button>

      </div>

      {/* ================================== */}
      {/* VARIANT TABLE */}
      {/* ================================== */}

      {variants.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">

          <table className="w-full min-w-[750px]">

            <thead className="bg-gray-50">

              <tr>

                {fields.map(
                  (field) => (
                    <th
                      key={field.name}
                      className="
                        px-4
                        py-3
                        text-left
                        text-sm
                        font-bold
                        text-gray-700
                      "
                    >
                      {field.name}
                    </th>
                  )
                )}

                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">
                  Stock
                </th>

                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">
                  Price
                </th>

                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {variants.map(
                (variant) => (
                  <tr
                    key={variant.id}
                    className="border-t border-gray-100"
                  >

                    {fields.map(
                      (field) => (
                        <td
                          key={
                            field.name
                          }
                          className="px-4 py-3 text-sm text-gray-800"
                        >
                          {
                            variant
                              .attributes[
                              field.name
                            ]
                          }
                        </td>
                      )
                    )}

                    {/* STOCK */}

                    <td className="px-4 py-3">

                      <input
                        type="number"
                        min="0"
                        value={
                          variant.stock
                        }
                        onChange={(e) =>
                          updateVariant(
                            variant.id,
                            "stock",
                            Number(
                              e.target.value
                            )
                          )
                        }
                        className="
                          w-24
                          rounded-lg
                          border
                          border-gray-300
                          p-2
                        "
                      />

                    </td>

                    {/* PRICE */}

                    <td className="px-4 py-3">

                      <input
                        type="number"
                        min="0"
                        value={
                          variant.price
                        }
                        onChange={(e) =>
                          updateVariant(
                            variant.id,
                            "price",
                            Number(
                              e.target.value
                            )
                          )
                        }
                        className="
                          w-28
                          rounded-lg
                          border
                          border-gray-300
                          p-2
                        "
                      />

                    </td>

                    {/* REMOVE */}

                    <td className="px-4 py-3">

                      <button
                        type="button"
                        onClick={() =>
                          removeVariant(
                            variant.id
                          )
                        }
                        className="
                          rounded-lg
                          bg-red-50
                          px-3
                          py-2
                          text-sm
                          font-semibold
                          text-red-600
                          hover:bg-red-100
                        "
                      >
                        Remove
                      </button>

                    </td>

                  </tr>
                )
              )}

            </tbody>

          </table>

        </div>
      )}

    </div>
  );
}