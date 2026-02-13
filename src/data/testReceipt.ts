import type { ReceiptLineItem } from '../types/receipt';

/** Test receipt items for the gamified split flow (no image/API yet). */
export const TEST_RECEIPT_ITEMS: ReceiptLineItem[] = [
  { id: '1', description: 'Coffee', amount: 3.5 },
  { id: '2', description: 'Croissant', amount: 4.0 },
  { id: '3', description: 'Avocado toast', amount: 12.0 },
  { id: '4', description: 'Orange juice', amount: 4.5 },
  { id: '5', description: 'Full breakfast', amount: 14.0 },
  { id: '6', description: 'Latte', amount: 4.25 },
  { id: '7', description: 'Muffin', amount: 3.75 },
  { id: '8', description: 'Soup of the day', amount: 6.5 },
];

export const TEST_RECEIPT_CURRENCY = 'GBP';
