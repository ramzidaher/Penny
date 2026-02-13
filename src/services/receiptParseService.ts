import axios from 'axios';
import type { ParsedReceipt, ReceiptLineItem } from '../types/receipt';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

/** Use this to show a specific message when receipt parsing is not configured. */
export function isReceiptParsingConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

const RECEIPT_EXTRACTION_PROMPT = `You are a receipt parser. Analyze this receipt image (restaurant, cafe, bar, or shop) from any country and extract structured data.

Return ONLY a valid JSON object (no markdown, no code block) with this exact structure:
{
  "items": [
    { "id": "1", "description": "Item name", "amount": 4.50, "quantity": 1, "unitPrice": 4.50 }
  ],
  "subtotal": 25.00,
  "tax": 2.50,
  "serviceCharge": 3.00,
  "total": 30.50,
  "currency": "GBP",
  "merchant": "Cafe Name"
}

RULES:
- items: every line item the customer can be charged for (food, drinks, etc.). Each needs "id" (string "1","2",...), "description", "amount" (number: total for that line). IMPORTANT for splitting fairly: when a line has multiple units (e.g. "4 Beers £20"), you MUST include "quantity" (e.g. 4) and "unitPrice" (e.g. 5.00) so each unit can be assigned to different people. Single items can have quantity 1 and unitPrice equal to amount.
- subtotal: sum of items or the subtotal line on the receipt.
- tax: VAT/sales tax amount if shown (number or omit).
- serviceCharge: service charge / tip if shown (number or omit).
- total: grand total on the receipt.
- currency: always use ISO 4217 three-letter code (e.g. USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, BRL, MXN, KRW, THB, ZAR, SEK, NOK, DKK, PLN, TRY, RUB, HKD, SGD, NZD, ILS, CZK, HUF, RON, BGN, etc.). If the receipt shows only a symbol (£ € $ ¥ ₹ R$ ₩ ฿ etc.), infer the code from context or location. For any other currency use its ISO 4217 code.
- merchant: business name if visible.

Use numbers only for amounts (no currency symbols in values). If tax or service is included in line items and not broken out, set tax/serviceCharge to 0 or omit.`;

function validateParsedReceipt(raw: unknown): ParsedReceipt | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const itemsRaw = o.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return null;
  const total = typeof o.total === 'number' ? o.total : 0;
  const currencyRaw = typeof o.currency === 'string' ? o.currency.trim() || 'USD' : 'USD';
  const currency = currencyRaw.length >= 2 ? currencyRaw.toUpperCase() : 'USD';
  const subtotal = typeof o.subtotal === 'number' ? o.subtotal : total;
  const items: ReceiptLineItem[] = [];
  itemsRaw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const it = item as Record<string, unknown>;
    const description = typeof it.description === 'string' ? it.description.trim() : '';
    let amount = typeof it.amount === 'number' && Number.isFinite(it.amount) ? it.amount : 0;
    if (!description) return;
    let qty: number | undefined = typeof it.quantity === 'number' && Number.isFinite(it.quantity) ? it.quantity : undefined;
    let unitPrice: number | undefined = typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice) ? it.unitPrice : undefined;
    if (qty !== undefined && (qty < 1 || !Number.isInteger(qty))) {
      qty = 1;
    }
    if (qty !== undefined && qty > 1 && (unitPrice === undefined || unitPrice <= 0)) {
      unitPrice = amount / qty;
    }
    if (unitPrice !== undefined && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      unitPrice = undefined;
    }
    items.push({
      id: typeof it.id === 'string' ? it.id : String(i + 1),
      description,
      amount,
      quantity: qty,
      unitPrice,
    });
  });
  if (items.length === 0) return null;
  return { items, subtotal, tax: typeof o.tax === 'number' ? o.tax : undefined, serviceCharge: typeof o.serviceCharge === 'number' ? o.serviceCharge : undefined, total, currency, merchant: typeof o.merchant === 'string' ? o.merchant.trim() || undefined : undefined };
}

/**
 * Expand items with quantity > 1 into one line per unit, so the split game can assign each unit to a different person (e.g. 4 beers → 4 claimable lines of 1 beer each).
 * Edge cases: invalid/zero quantity → treat as 1; missing unitPrice → derive from amount/qty; fractional qty → floor to integer.
 */
export function expandItemsByQuantity(items: ReceiptLineItem[]): ReceiptLineItem[] {
  const out: ReceiptLineItem[] = [];
  for (const item of items) {
    let qty = item.quantity ?? 1;
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 1) {
      qty = 1;
    }
    qty = Math.floor(qty);
    if (qty <= 1) {
      out.push({ ...item, quantity: 1 });
      continue;
    }
    let perUnit = item.unitPrice;
    if (typeof perUnit !== 'number' || !Number.isFinite(perUnit) || perUnit <= 0) {
      perUnit = item.amount / qty;
    }
    if (!Number.isFinite(perUnit) || perUnit <= 0) {
      perUnit = 0.01;
    }
    const roundedUnit = Math.round(perUnit * 100) / 100;
    for (let n = 1; n <= qty; n++) {
      out.push({
        id: `${item.id}-${n}`,
        description: item.description,
        amount: roundedUnit,
      });
    }
  }
  return out;
}

const GEMINI_RATE_LIMIT_RETRY_DELAY_MS = 3000;

/**
 * Parse a receipt image via Gemini vision. imageBase64 should be JPEG/PNG base64 (no data URL prefix).
 * On 429 (rate limit), retries once after a short delay, then throws so the UI can show "try again later".
 */
export async function parseReceiptFromImage(imageBase64: string, mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<ParsedReceipt | null> {
  if (!GEMINI_API_KEY) {
    console.warn('[receiptParseService] No Gemini API key');
    return null;
  }

  const callApi = async (): Promise<ParsedReceipt | null> => {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: RECEIPT_EXTRACTION_PROMPT },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GEMINI_API_KEY,
        },
      }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!text) return null;

    let jsonStr = text;
    const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) jsonStr = codeMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as unknown;
    return validateParsedReceipt(parsed);
  };

  try {
    return await callApi();
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 429) {
      console.warn('[receiptParseService] Rate limited (429), retrying once after', GEMINI_RATE_LIMIT_RETRY_DELAY_MS, 'ms');
      await new Promise((r) => setTimeout(r, GEMINI_RATE_LIMIT_RETRY_DELAY_MS));
      try {
        return await callApi();
      } catch (retryErr: unknown) {
        const retryStatus = (retryErr as { response?: { status?: number } })?.response?.status;
        if (retryStatus === 429) {
          const rateLimitError = new Error('Rate limited') as Error & { code: string };
          rateLimitError.code = 'RATE_LIMIT';
          throw rateLimitError;
        }
        console.warn('[receiptParseService] Retry failed:', retryErr);
        return null;
      }
    }
    console.warn('[receiptParseService] Parse failed:', err);
    return null;
  }
}

/**
 * Compute "your share" when user has selected some items: selected items total + proportional tax/service.
 */
export function computeSelectedTotal(
  receipt: ParsedReceipt,
  selectedItemIds: Set<string>
): { itemsTotal: number; taxShare: number; serviceShare: number; total: number } {
  const selectedItems = receipt.items.filter((it) => selectedItemIds.has(it.id));
  const itemsTotal = selectedItems.reduce((sum, it) => sum + it.amount, 0);
  const subtotal = receipt.subtotal || receipt.items.reduce((s, it) => s + it.amount, 0);
  const tax = receipt.tax ?? 0;
  const service = receipt.serviceCharge ?? 0;
  const ratio = subtotal > 0 ? itemsTotal / subtotal : 0;
  const taxShare = tax * ratio;
  const serviceShare = service * ratio;
  const total = itemsTotal + taxShare + serviceShare;
  return { itemsTotal, taxShare, serviceShare, total };
}
