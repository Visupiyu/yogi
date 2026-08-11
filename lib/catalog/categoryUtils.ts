/**
 * ============================================================
 * YOMICO Catalog Utilities
 * File : categoryUtils.ts
 *
 * Purpose:
 * Shared helper functions for the Catalog Engine.
 *
 * Used by:
 * ✅ Seller Dashboard
 * ✅ Customer Category Pages
 * ✅ Search
 * ✅ Filters
 * ✅ Breadcrumbs
 * ✅ Admin Panel
 * ============================================================
 */

import {
  catalogTree,
  CatalogNode,
} from "./catalogTree";

/**
 * Find category by ID
 */

export function findNodeById(
  id: string,
  nodes: CatalogNode[] = catalogTree
): CatalogNode | undefined {

  for (const node of nodes) {

    if (node.id === id) {
      return node;
    }

    if (node.children) {

      const found = findNodeById(
        id,
        node.children
      );

      if (found) {
        return found;
      }

    }

  }

  return undefined;
}

/**
 * Find category by slug
 */

export function findNodeBySlug(
  slug: string,
  nodes: CatalogNode[] = catalogTree
): CatalogNode | undefined {

  for (const node of nodes) {

    if (node.slug === slug) {
      return node;
    }

    if (node.children) {

      const found =
        findNodeBySlug(
          slug,
          node.children
        );

      if (found) {
        return found;
      }

    }

  }

  return undefined;
}

/**
 * Find category by display name (case-insensitive)
 */

export function findNodeByName(
  name: string,
  nodes: CatalogNode[] = catalogTree
): CatalogNode | undefined {

  const lower = name.toLowerCase();

  // Breadth-first: a shallower match (e.g. the top-level "Beauty" category)
  // must always win over a same-named node buried deeper in the tree (e.g.
  // "Beauty" nested under Fashion > Women), or filtering by name silently
  // resolves to the wrong category.
  let currentLevel = nodes;

  while (currentLevel.length > 0) {

    const match = currentLevel.find(
      (node) => node.name.toLowerCase() === lower
    );

    if (match) {
      return match;
    }

    const nextLevel: CatalogNode[] = [];

    for (const node of currentLevel) {
      if (node.children) {
        nextLevel.push(...node.children);
      }
    }

    currentLevel = nextLevel;
  }

  return undefined;
}

/**
 * Is this node a top-level category? The catalog tree's own `level` field
 * starts at 1 for top-level nodes (not 0) — use this instead of comparing
 * against a raw number so that assumption only has to be correct in one
 * place.
 */

export function isTopLevelCategory(
  node: CatalogNode
): boolean {
  return node.level === 1;
}

/**
 * Get direct children
 */

export function getChildren(
  id: string
): CatalogNode[] {

  const node =
    findNodeById(id);

  return node?.children || [];

}

/**
 * Flatten catalog tree
 */

export function flattenTree(
  nodes: CatalogNode[] = catalogTree
): CatalogNode[] {

  let result: CatalogNode[] = [];

  for (const node of nodes) {

    result.push(node);

    if (node.children) {

      result = result.concat(
        flattenTree(
          node.children
        )
      );

    }

  }

  return result;

}

/**
 * Search Categories
 */

export function searchCategories(
  keyword: string
): CatalogNode[] {

  const lower =
    keyword.toLowerCase();

  return flattenTree().filter(

    (node) =>

      node.name
        .toLowerCase()
        .includes(lower)

  );

}