"use client";

import { useMemo } from "react";

import { CATEGORY_BRANDS as catalogBrands } from "@/lib/catalog/brands";

interface BrandSelectorProps {

  category?: string;

  value: string;

  onChange: (brand: string) => void;

}

export default function BrandSelector({

  category = "",

  value,

  onChange,

}: BrandSelectorProps) {

  type BrandItem = {
  id: string;
  name: string;
  slug: string;
  featured?: boolean;
};

const brandList = useMemo<BrandItem[]>(() => {

  if (!category) return [];

  return (catalogBrands[
    category as keyof typeof catalogBrands
  ] ?? []) as BrandItem[];

}, [category]);
  return (

    <select

      value={value}

      onChange={(e) => onChange(e.target.value)}

      disabled={!category}

      className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-600 focus:outline-none disabled:bg-gray-100"

    >

      <option value="">

        {category

          ? "Select Brand"

          : "Select Category First"}

      </option>

     {brandList.map((brand) => (

        <option

          key={brand.id}

          value={brand.name}

        >

          {brand.name}

        </option>

      ))}

    </select>

  );

}