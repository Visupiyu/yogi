"use client";

import { useMemo } from "react";

import { catalogTree } from "@/lib/catalog/catalogTree";

interface CategorySelectorProps {

  value: string;

  onChange: (categoryId: string) => void;

}

export default function CategorySelector({

  value,

  onChange,

}: CategorySelectorProps) {

  const categories = useMemo(() => {

    const list: {

      id: string;

      name: string;

    }[] = [];

    catalogTree.forEach((category) => {

      list.push({

        id: category.id,

        name: category.name,

      });

    });

    return list;

  }, []);

  return (

    <select

      value={value}

      onChange={(e) =>

        onChange(e.target.value)

      }

      className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-600 focus:outline-none"

    >

      <option value="">

        Select Category

      </option>

      {categories.map((category) => (

        <option

          key={category.id}

          value={category.id}

        >

          {category.name}

        </option>

      ))}

    </select>

  );

}