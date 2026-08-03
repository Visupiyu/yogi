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