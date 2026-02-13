/** Single line item from a receipt (e.g. "Coffee £3.50"). */
export interface ReceiptLineItem {
  id: string;
  description: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
}

/** Parsed receipt from AI vision (restaurant, cafe, etc.). */
export interface ParsedReceipt {
  /** Line items to split (each can be checked). */
  items: ReceiptLineItem[];
  /** Subtotal before tax/service (sum of items, or explicit from receipt). */
  subtotal: number;
  /** VAT / tax amount if shown on receipt. */
  tax?: number;
  /** Service charge / tip if shown. */
  serviceCharge?: number;
  /** Grand total. */
  total: number;
  /** Currency code (e.g. GBP, USD). */
  currency: string;
  /** Optional: merchant name. */
  merchant?: string;
}
