// ==========================================
// YOMICO Marketplace
// lib/products/inventory.ts
// ==========================================

export interface Inventory {

  stock: number;

  reservedStock: number;

  availableStock: number;

  lowStockThreshold: number;

  trackInventory: boolean;

  allowBackorder: boolean;

  stockStatus:
    | "IN_STOCK"
    | "LOW_STOCK"
    | "OUT_OF_STOCK";

}

// ------------------------------------------
// Available Stock
// ------------------------------------------

export function getAvailableStock(

  stock: number,

  reservedStock: number = 0

): number {

  return Math.max(

    stock - reservedStock,

    0

  );

}

// ------------------------------------------
// Stock Status
// ------------------------------------------

export function getStockStatus(

  availableStock: number,

  lowStockThreshold: number = 5

): "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" {

  if (availableStock <= 0)

    return "OUT_OF_STOCK";

  if (availableStock <= lowStockThreshold)

    return "LOW_STOCK";

  return "IN_STOCK";

}

// ------------------------------------------
// Increase Stock
// ------------------------------------------

export function increaseStock(

  currentStock: number,

  quantity: number

): number {

  return currentStock + quantity;

}

// ------------------------------------------
// Decrease Stock
// ------------------------------------------

export function decreaseStock(

  currentStock: number,

  quantity: number

): number {

  return Math.max(

    currentStock - quantity,

    0

  );

}

// ------------------------------------------
// Reserve Stock
// ------------------------------------------

export function reserveStock(

  reservedStock: number,

  quantity: number

): number {

  return reservedStock + quantity;

}

// ------------------------------------------
// Release Reserved Stock
// ------------------------------------------

export function releaseReservedStock(

  reservedStock: number,

  quantity: number

): number {

  return Math.max(

    reservedStock - quantity,

    0

  );

}

// ------------------------------------------
// Can Purchase
// ------------------------------------------

export function canPurchase(

  availableStock: number,

  quantity: number

): boolean {

  return availableStock >= quantity;

}