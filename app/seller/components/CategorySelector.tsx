"use client";

import { useEffect, useMemo, useState } from "react";
import { catalogTree } from "@/lib/catalog/catalogTree";
import { flattenTree } from "@/lib/catalog/categoryUtils";

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
  level: number;
  parentId?: string;
  children?: CategoryNode[];
}

export default function CategorySelector({
  value,
  onChange,
}: CategorySelectorProps) {
  // The catalog data file has bracket-nesting mistakes in places — some
  // nodes claim (via their own level/parentId fields) to be nested under
  // a parent but are physically siblings in the array instead. Rather
  // than trust the JS object nesting (children), flatten the whole tree
  // once and rebuild the hierarchy purely from each node's own level/
  // parentId metadata, which stays correct regardless of where a node
  // physically sits.
  const allNodes = useMemo(
    () => flattenTree(catalogTree) as CategoryNode[],
    []
  );

  const [selectedPath, setSelectedPath] =
    useState<string[]>([]);

  // "Other (please specify)" fallback: the predefined catalog can never
  // cover every product type. When a seller picks this, they type their
  // own category name instead of being blocked. The typed text is stored
  // directly as that level's path entry (prefixed so it's unambiguous),
  // so anything downstream that resolves a category id back to a display
  // name and falls back to the raw value when no match is found (as the
  // product page already does) still shows something readable.
  const CUSTOM_OPTION = "__OTHER__";
  const CUSTOM_PREFIX = "CUSTOM:";
  const isCustomValue = (v: string) => v.startsWith(CUSTOM_PREFIX);

  const [customLevels, setCustomLevels] =
    useState<Record<number, boolean>>({});

  // ==========================================
  // Find complete category path (walk up via parentId)
  // ==========================================

  const findPath = (
    targetId: string
  ): string[] | null => {
    const path: string[] = [];
    let current = allNodes.find((n) => n.id === targetId);

    while (current) {
      path.unshift(current.id);
      current = current.parentId
        ? allNodes.find((n) => n.id === current!.parentId)
        : undefined;
    }

    return path.length > 0 ? path : null;
  };

  // ==========================================
  // Load existing category
  // ==========================================

  useEffect(() => {
    if (!value) {
      setSelectedPath([]);
      return;
    }

    const path = findPath(value);

    if (path) {
      setSelectedPath(path);
    }
  }, [value]);

  // ==========================================
  // Get options for level (by declared level/parentId, not JS nesting)
  // ==========================================

  const getOptionsForLevel = (
    level: number
  ): CategoryNode[] => {
    if (level === 0) {
      return allNodes.filter(
        (category) =>
          category.level === 1 && category.active !== false
      );
    }

    const parentId =
      selectedPath[level - 1];

    if (!parentId) {
      return [];
    }

    return allNodes.filter(
      (node) =>
        node.parentId === parentId && node.active !== false
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
    if (categoryId === CUSTOM_OPTION) {
      setCustomLevels((prev) => ({ ...prev, [level]: true }));

      const truncated = selectedPath.slice(0, level);
      setSelectedPath(truncated);
      onChange(truncated[0] || "", truncated);
      return;
    }

    setCustomLevels((prev) => ({ ...prev, [level]: false }));

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

  const handleCustomInput = (
    level: number,
    text: string
  ) => {
    const trimmed = text.trim();

    const newPath = trimmed
      ? [...selectedPath.slice(0, level), `${CUSTOM_PREFIX}${trimmed}`]
      : selectedPath.slice(0, level);

    setSelectedPath(newPath);
    onChange(newPath[0] || "", newPath);
  };

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="grid grid-cols-1 gap-5">

      {levels.map(
        (options, level) => {
          const isCustom = !!customLevels[level] ||
            isCustomValue(selectedPath[level] || "");
          const selectedValue = isCustom
            ? CUSTOM_OPTION
            : selectedPath[level] || "";
          const customText = isCustomValue(selectedPath[level] || "")
            ? (selectedPath[level] || "").slice(CUSTOM_PREFIX.length)
            : "";

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

                <option value={CUSTOM_OPTION}>
                  Other (please specify)
                </option>

              </select>

              {isCustom && (
                <input
                  type="text"
                  autoFocus
                  defaultValue={customText}
                  onChange={(e) =>
                    handleCustomInput(level, e.target.value)
                  }
                  placeholder="Type your category name"
                  className="
                    mt-2
                    w-full
                    rounded-lg
                    border
                    border-blue-300
                    p-3
                    focus:border-blue-600
                    focus:outline-none
                    focus:ring-2
                    focus:ring-blue-100
                  "
                />
              )}

            </div>
          );
        }
      )}

    </div>
  );
}