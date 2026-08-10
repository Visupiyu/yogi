"use client";

import { useEffect, useMemo, useState } from "react";
import { catalogTree } from "@/lib/catalog/catalogTree";

interface CategorySelectorProps {
  value: string;

  onChange: (
    categoryId: string,
    path: string[]
  ) => void;
}

interface CategoryNode {
  id: string;
  name: string;
  active?: boolean;
  children?: CategoryNode[];
}

export default function CategorySelector({
  value,
  onChange,
}: CategorySelectorProps) {
  const tree = catalogTree as CategoryNode[];

  const [selectedPath, setSelectedPath] =
    useState<string[]>([]);

  // ==========================================
  // Find complete category path
  // ==========================================

  const findPath = (
    nodes: CategoryNode[],
    targetId: string,
    path: string[] = []
  ): string[] | null => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return [...path, node.id];
      }

      if (
        node.children &&
        node.children.length > 0
      ) {
        const result = findPath(
          node.children,
          targetId,
          [...path, node.id]
        );

        if (result) {
          return result;
        }
      }
    }

    return null;
  };

  // ==========================================
  // Load existing category
  // ==========================================

  useEffect(() => {
    if (!value) {
      setSelectedPath([]);
      return;
    }

    const path = findPath(tree, value);

    if (path) {
      setSelectedPath(path);
    }
  }, [value]);

  // ==========================================
  // Find node by ID
  // ==========================================

  const findNode = (
    nodes: CategoryNode[],
    targetId: string
  ): CategoryNode | null => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return node;
      }

      if (
        node.children &&
        node.children.length > 0
      ) {
        const found = findNode(
          node.children,
          targetId
        );

        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  // ==========================================
  // Get options for level
  // ==========================================

  const getOptionsForLevel = (
    level: number
  ): CategoryNode[] => {
    if (level === 0) {
      return tree.filter(
        (category) =>
          category.active !== false
      );
    }

    const parentId =
      selectedPath[level - 1];

    if (!parentId) {
      return [];
    }

    const parent = findNode(
      tree,
      parentId
    );

    return (
      parent?.children?.filter(
        (child) =>
          child.active !== false
      ) || []
    );
  };

  // ==========================================
  // Build dropdown levels
  // ==========================================

  const levels = useMemo(() => {
    const result: CategoryNode[][] = [];

    let level = 0;

    while (true) {
      const options =
        getOptionsForLevel(level);

      if (options.length === 0) {
        break;
      }

      result.push(options);

      if (!selectedPath[level]) {
        break;
      }

      const selectedNode =
        options.find(
          (item) =>
            item.id ===
            selectedPath[level]
        );

      if (
        !selectedNode?.children ||
        selectedNode.children.length === 0
      ) {
        break;
      }

      level++;
    }

    return result;
  }, [selectedPath]);

  // ==========================================
  // Handle category change
  // ==========================================

  const handleChange = (
    level: number,
    categoryId: string
  ) => {
    if (!categoryId) {
      const newPath =
        selectedPath.slice(0, level);

      setSelectedPath(newPath);

      // IMPORTANT:
      // Always keep TOP LEVEL category
      // as categoryId.

      onChange(
        newPath[0] || "",
        newPath
      );

      return;
    }

    const newPath = [
      ...selectedPath.slice(0, level),
      categoryId,
    ];

    setSelectedPath(newPath);

    // IMPORTANT:
    // categoryId is ALWAYS the first
    // item in the path.

    onChange(
      newPath[0] || "",
      newPath
    );
  };

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="grid grid-cols-1 gap-5">

      {levels.map(
        (options, level) => {
          const selectedValue =
            selectedPath[level] || "";

          return (
            <div key={level}>

              <label className="mb-2 block text-sm font-semibold text-gray-700">
                {level === 0
                  ? "Category"
                  : level === 1
                  ? "Sub Category"
                  : `Sub Category ${"I".repeat(
                      level - 1
                    )}`}
              </label>

              <select
                value={selectedValue}
                onChange={(e) =>
                  handleChange(
                    level,
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
                  Select{" "}
                  {level === 0
                    ? "Category"
                    : "Sub Category"}
                </option>

                {options.map(
                  (category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name}
                    </option>
                  )
                )}

              </select>

            </div>
          );
        }
      )}

    </div>
  );
}