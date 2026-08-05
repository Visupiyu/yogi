export interface InvoiceItem {

  productId: string;

  name: string;

  quantity: number;

  price: number;

  gstRate: number;

}

export interface InvoiceSummary {

  subtotal: number;

  totalGST: number;

  shippingCharge: number;

  discount: number;

  grandTotal: number;

}

export interface InvoiceData {

  invoiceNumber: string;

  orderId: string;

  customerName: string;

  customerPhone: string;

  customerAddress: string;

  sellerName: string;

  sellerGST: string;

  items: InvoiceItem[];

  summary: InvoiceSummary;

  invoiceDate: Date;

}

export function generateInvoiceNumber(): string {

  return `INV-${Date.now()}`;

}

export function calculateItemGST(

  price: number,

  quantity: number,

  gstRate: number

): number {

  return (

    (price * quantity * gstRate) / 100

  );

}

export function calculateInvoiceSummary(

  items: InvoiceItem[],

  shippingCharge: number,

  discount: number

): InvoiceSummary {

  const subtotal = items.reduce(

    (sum, item) =>

      sum + item.price * item.quantity,

    0

  );

  const totalGST = items.reduce(

    (sum, item) =>

      sum +

      calculateItemGST(

        item.price,

        item.quantity,

        item.gstRate

      ),

    0

  );

  const grandTotal =

    subtotal +

    shippingCharge -

    discount;

  return {

    subtotal,

    totalGST,

    shippingCharge,

    discount,

    grandTotal,

  };

}

export function createInvoice(

  orderId: string,

  customerName: string,

  customerPhone: string,

  customerAddress: string,

  sellerName: string,

  sellerGST: string,

  items: InvoiceItem[],

  shippingCharge: number,

  discount: number

): InvoiceData {

  return {

    invoiceNumber:

      generateInvoiceNumber(),

    orderId,

    customerName,

    customerPhone,

    customerAddress,

    sellerName,

    sellerGST,

    items,

    summary:

      calculateInvoiceSummary(

        items,

        shippingCharge,

        discount

      ),

    invoiceDate: new Date(),

  };

}