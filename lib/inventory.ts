export interface InventoryItem {

  productId: string;

  productName: string;

  sku?: string;

  stock: number;

  reservedStock: number;

  sold: number;

  lowStockThreshold: number;

  status:
    | "In Stock"
    | "Low Stock"
    | "Out of Stock";

}

export function reduceStock(

  item: InventoryItem,

  quantity: number

): InventoryItem {

  if (quantity <= 0) {

    throw new Error(
      "Quantity must be greater than zero."
    );

  }

  if (item.stock < quantity) {

    throw new Error(
      "Insufficient stock."
    );

  }

  const updatedStock =
    item.stock - quantity;

  return {

    ...item,

    stock: updatedStock,

    sold: item.sold + quantity,

    status:
      updatedStock <= 0
        ? "Out of Stock"
        : updatedStock <= item.lowStockThreshold
        ? "Low Stock"
        : "In Stock",

  };

}

export function increaseStock(

  item: InventoryItem,

  quantity: number

): InventoryItem {

  if (quantity <= 0) {

    throw new Error(
      "Quantity must be greater than zero."
    );

  }

  const updatedStock =
    item.stock + quantity;

  return {

    ...item,

    stock: updatedStock,

    status:
      updatedStock <= item.lowStockThreshold
        ? "Low Stock"
        : "In Stock",

  };

}

export function reserveStock(

  item: InventoryItem,

  quantity: number

): InventoryItem {

  if (quantity > item.stock) {

    throw new Error(
      "Not enough stock available."
    );

  }

  return {

    ...item,

    reservedStock:
      item.reservedStock + quantity,

  };

}

export function releaseReservedStock(

  item: InventoryItem,

  quantity: number

): InventoryItem {

  return {

    ...item,

    reservedStock: Math.max(
      0,
      item.reservedStock - quantity
    ),

  };

}

export function isAvailable(

  item: InventoryItem,

  quantity: number

): boolean {

  return item.stock >= quantity;

}

export function isLowStock(
  item: InventoryItem
): boolean {

  return (
    item.stock <=
    item.lowStockThreshold
  );

}

export function isOutOfStock(
  item: InventoryItem
): boolean {

  return item.stock <= 0;

}