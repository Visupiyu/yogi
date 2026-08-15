"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_VARIANTS } from "@/lib/catalog/categoryVariants";

interface ProductVariant {
  id: string;
  attributes: Record<string, string>;
  stock: number;
  price: number;
}

interface VariantSelectorProps {
  categoryId: string;
  subCategoryId?: string;
  leafCategoryId?: string;
  variants: ProductVariant[];
  onChange: (variants: ProductVariant[]) => void;
}

export default function VariantSelector({
  categoryId,
  subCategoryId,
  leafCategoryId,
  variants,
  onChange,
}: VariantSelectorProps) {
  // CATEGORY_VARIANTS mixes top-level codes (FASHION, MOBILES) with
  // leaf-style codes (FOOTWEAR, LAPTOPS) — try the most specific level
  // the seller picked first, then fall back up to the top-level category.
  const fields =
    CATEGORY_VARIANTS[(leafCategoryId ?? "").toUpperCase()] ||
    CATEGORY_VARIANTS[(subCategoryId ?? "").toUpperCase()] ||
    CATEGORY_VARIANTS[categoryId.toUpperCase()] ||
    [];

  const colorField = fields.find(
    (field) => field.name === "Color" || field.name === "Shade"
  );

  const sizeField = fields.find((field) => field.name === "Size");

  // Categories that have both a Color/Shade and a Size field (Fashion,
  // Footwear, Beauty) use the simplified one-color-many-sizes flow below,
  // with stock entered inline per size and no per-variant price. Every
  // other category shape (Mobiles' RAM+Storage+Color, Laptops, ...) keeps
  // the original single-select-per-field, one-variant-per-click flow with
  // its own editable stock/price table further down, completely untouched.
  const isColorSizeFlow = Boolean(colorField && sizeField);

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

  // Color+Size flow only: which sizes are checked and the stock entered
  // for each — keyed by size, so a size's presence here IS "checked".
  // Values are kept as raw strings (not numbers) so the input can be
  // temporarily empty while the seller is typing without fighting them.
  const [sizeStock, setSizeStock] =
    useState<Record<string, string>>({});

  const hydratedRef = useRef(false);

  // Load an existing product's color + per-size stock into the form once,
  // on first mount, so editing shows exactly what's already saved instead
  // of an empty selector. Guarded to run only once — without the guard,
  // every onChange() call from Save below would feed the new `variants`
  // prop straight back in and re-hydrate mid-edit, clobbering whatever
  // the seller had just typed.
  useEffect(() => {
    if (!isColorSizeFlow || hydratedRef.current) return;
    if (variants.length === 0) return;

    hydratedRef.current = true;

    const firstColor = variants
      .map((v) => v.attributes[colorField!.name])
      .find(Boolean);

    if (!firstColor) return;

    setSelectedValues((previous) => ({
      ...previous,
      [colorField!.name]: firstColor,
    }));

    const stockBySize: Record<string, string> = {};

    variants
      .filter((v) => v.attributes[colorField!.name] === firstColor)
      .forEach((v) => {
        const size = v.attributes[sizeField!.name];
        if (size) stockBySize[size] = String(v.stock);
      });

    setSizeStock(stockBySize);
    // Only ever needs to run once, when the existing variants first
    // arrive — not on every subsequent variants/onChange cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isColorSizeFlow, variants]);

  const toggleSize = (size: string) => {
    setSizeStock((previous) => {
      if (size in previous) {
        const { [size]: _removed, ...rest } = previous;
        return rest;
      }
      return { ...previous, [size]: "" };
    });
  };

  const updateSizeStock = (size: string, value: string) => {
    setSizeStock((previous) => ({ ...previous, [size]: value }));
  };

  const totalInventory = Object.values(sizeStock).reduce(
    (sum, value) => sum + (Number(value) > 0 ? Number(value) : 0),
    0
  );

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

    // Some categories (e.g. Beauty) use "Shade" instead of "Color" — both
    // draw from the same custom-values list so a shade added under one
    // label is recognized under the other too.
    if (
      fieldName === "Color" ||
      fieldName === "Shade"
    ) {
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
  // Add custom Color / Shade
  // ==========================================

  const addColor = () => {
    const color = newColor.trim();

    if (!color) {
      alert("Please enter a color or shade.");
      return;
    }

    const existingValues = [
      ...getFieldValues("Color"),
      ...getFieldValues("Shade"),
    ];

    const alreadyExists =
      existingValues.some(
        (item) =>
          item.toLowerCase() ===
          color.toLowerCase()
      );

    if (alreadyExists) {
      alert("This color/shade already exists.");
      return;
    }

    setCustomColors((previous) => [
      ...previous,
      color,
    ]);

    // Immediately select the newly added value under whichever of
    // Color/Shade this category actually uses, so the seller doesn't
    // have to re-pick what they just typed.
    const shadeField = fields.find(
      (field) => field.name === "Shade"
    );

    const colorFieldMatch = fields.find(
      (field) => field.name === "Color"
    );

    if (shadeField) {
      setSelectedValues((previous) => ({
        ...previous,
        Shade: color,
      }));
    } else if (colorFieldMatch) {
      setSelectedValues((previous) => ({
        ...previous,
        Color: color,
      }));
    }

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

    // Immediately check the newly added size with an empty stock value,
    // same spirit as addColor above.
    setSizeStock((previous) =>
      size in previous ? previous : { ...previous, [size]: "" }
    );

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
  // Add variant (non Color+Size categories only —
  // Mobiles, Laptops, Furniture, ... one variant per click, unchanged)
  // ==========================================

  const makeVariantId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  const isDuplicate = (
    attributes: Record<string, string>,
    against: ProductVariant[]
  ) =>
    against.some((variant) =>
      fields.every(
        (field) =>
          variant.attributes[field.name] === attributes[field.name]
      )
    );

  const addVariant = () => {
    const attributes: Record<string, string> = {};

    for (const field of fields) {
      const value = selectedValues[field.name];

      if (!value) {
        alert(`Please select ${field.name}.`);
        return;
      }

      attributes[field.name] = value;
    }

    if (isDuplicate(attributes, variants)) {
      alert("This variant already exists.");
      return;
    }

    onChange([
      ...variants,
      { id: makeVariantId(), attributes, stock: 0, price: 0 },
    ]);

    setSelectedValues({});
  };

  // ==========================================
  // Save variants (Color+Size categories only) —
  // replaces the product's whole variant list with exactly the checked
  // sizes and their entered stock for the selected color, matching the
  // "one color, many sizes" model. Unchecking a size and saving here is
  // how a size gets removed.
  // ==========================================

  const saveColorSizeVariants = () => {
    const color = selectedValues[colorField!.name];

    if (!color) {
      alert(`Please select a ${colorField!.name.toLowerCase()}.`);
      return;
    }

    const sizes = Object.keys(sizeStock);

    if (sizes.length === 0) {
      alert("Please select at least one size.");
      return;
    }

    for (const size of sizes) {
      const raw = sizeStock[size];
      const parsed = Number(raw);

      if (raw.trim() === "" || Number.isNaN(parsed) || parsed < 0) {
        alert(`Please enter a valid stock quantity for size ${size}.`);
        return;
      }
    }

    const newVariants: ProductVariant[] = sizes.map((size) => {
      const existing = variants.find(
        (v) =>
          v.attributes[colorField!.name] === color &&
          v.attributes[sizeField!.name] === size
      );

      return {
        id: existing?.id ?? makeVariantId(),
        attributes: { [colorField!.name]: color, [sizeField!.name]: size },
        stock: Number(sizeStock[size]),
        // Product-level MRP/Selling Price is used for every size — no
        // per-variant price in this flow.
        price: 0,
      };
    });

    onChange(newVariants);
  };

  // ==========================================
  // Update variant (non Color+Size categories only)
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
  // Remove variant (non Color+Size categories only)
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

            const isColorField =
              field.name === "Color" ||
              field.name === "Shade";

            const isSizeField =
              field.name === "Size";

            return (
              <div
                key={field.name}
                className={isSizeField && isColorSizeFlow ? "md:col-span-2" : undefined}
              >

                <label className="mb-2 block font-semibold text-gray-800">
                  {field.name}
                </label>

                {isSizeField ? (
                  <div className="flex flex-wrap gap-3">
                    {values.map((option, index) => {
                      const checked = option in sizeStock;
                      return (
                        <div
                          key={`${field.name}-${option}-${index}`}
                          className={`
                            flex items-center gap-2 rounded-lg border px-3 py-2
                            ${
                              checked
                                ? "border-blue-600 bg-blue-50"
                                : "border-gray-300 bg-white"
                            }
                          `}
                        >
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSize(option)}
                              className="h-4 w-4 accent-blue-600"
                            />
                            {option}
                          </label>

                          {checked && isColorSizeFlow && (
                            <input
                              type="number"
                              min="0"
                              value={sizeStock[option]}
                              onChange={(e) =>
                                updateSizeStock(option, e.target.value)
                              }
                              placeholder="Stock"
                              className="
                                w-20 rounded-md border border-gray-300 p-1
                                text-sm focus:border-blue-600 focus:outline-none
                              "
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
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
                      (option, index) => (
                        <option
                          key={`${field.name}-${option}-${index}`}
                          value={option}
                        >
                          {option}
                        </option>
                      )
                    )}

                  </select>
                )}

                {/* ====================== */}
                {/* ADD COLOR / SHADE */}
                {/* ====================== */}

                {isColorField && (
                  <div className="mt-3 flex gap-2">

                    <input
                      type="text"
                      value={newColor}
                      onChange={(e) =>
                        setNewColor(
                          e.target.value
                        )
                      }
                      placeholder={
                        field.name === "Shade"
                          ? "Enter custom shade"
                          : "Enter custom color"
                      }
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
                      + Add{" "}
                      {field.name === "Shade"
                        ? "Shade"
                        : "Color"}
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

        {isColorSizeFlow && (
          <p className="mt-4 text-sm font-semibold text-gray-700">
            Total Inventory: {totalInventory}
          </p>
        )}

        {/* ================================= */}
        {/* ADD / SAVE VARIANT */}
        {/* ================================= */}

        <button
          type="button"
          onClick={isColorSizeFlow ? saveColorSizeVariants : addVariant}
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
          {isColorSizeFlow ? "Save Sizes & Stock" : "+ Add Variant"}
        </button>

      </div>

      {/* ================================== */}
      {/* VARIANT TABLE — non Color+Size categories only. For the */}
      {/* Color+Size flow, the checkboxes above already are the editable */}
      {/* view of the current variants, so a second table would just */}
      {/* duplicate the same information. */}
      {/* ================================== */}

      {!isColorSizeFlow && variants.length > 0 && (
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
