/**
 * Backfill Service - Link existing transactions to subscriptions/debts
 * 
 * This service helps link transactions that were categorized before auto-linking was implemented
 */

import { getTransactions, updateTransaction } from '../database/db';
import { getSubscriptions, getDebts } from '../database/db';
import { Transaction, Subscription, Debt } from '../database/schema';
import { isFirebaseAvailable } from './firebase';

/**
 * Backfill subscription links for transactions categorized as "Subscription"
 * This is a one-time operation to link existing transactions
 */
export const backfillSubscriptionLinks = async (): Promise<{ linked: number; skipped: number }> => {
  if (!isFirebaseAvailable()) {
    console.log('[backfillService] Firebase not available, skipping backfill');
    return { linked: 0, skipped: 0 };
  }

  try {
    const [transactions, subscriptions] = await Promise.all([
      getTransactions(),
      getSubscriptions(),
    ]);

    // Find transactions that are categorized as Subscription but don't have subscriptionId
    const unlinkedTransactions = transactions.filter(
      t => t.category === 'Subscription' && !t.subscriptionId
    );

    console.log(`[backfillService] Found ${unlinkedTransactions.length} unlinked subscription transactions`);

    let linked = 0;
    let skipped = 0;

    // Log available subscriptions for debugging
    const subscriptionNames = subscriptions.map(s => s.name);
    console.log(`[backfillService] Available subscriptions: ${subscriptionNames.join(', ')}`);

    for (const transaction of unlinkedTransactions) {
      if (!transaction.description) {
        skipped++;
        continue;
      }

      // Clean description
      const cleanDesc = transaction.description
        .replace(/^Subscription:\s*/i, '')
        .replace(/^Payment\s+to\s+/i, '')
        .replace(/^Payment\s+/i, '')
        .replace(/^PURCHASE\s*-\s*/i, '')
        .replace(/^RECURRENT\s+TRANSACTION\s+AT\s+/i, '')
        .replace(/^GOOGLE\s+PAY\s+IN-APP\s+AT\s+/i, '')
        .replace(/\s+AT\s+.*$/i, '') // Remove "AT London GBR..." suffix
        .replace(/\s+OF\s+\d+\.\d+\s+\w+\s+ON\s+.*$/i, '') // Remove "OF 33.32 GBP ON 2026-01-11" suffix
        .trim();

      const cleanDescLower = cleanDesc.toLowerCase();
      const descLower = transaction.description.toLowerCase();
      
      // Extract merchant name variations
      const merchantName = cleanDesc.split(/[,\s-]/)[0].trim().toLowerCase();
      const firstTwoWords = cleanDesc.split(/\s+/).slice(0, 2).join(' ').trim().toLowerCase();
      const firstThreeWords = cleanDesc.split(/\s+/).slice(0, 3).join(' ').trim().toLowerCase();

      // Find matching subscription using multiple strategies
      const matchingSubscription = subscriptions.find(sub => {
        const subNameLower = sub.name.toLowerCase().trim();
        
        // Strategy 1: Exact match with cleaned description
        if (subNameLower === cleanDescLower) {
          console.log(`[backfillService] Exact match: "${sub.name}" === "${cleanDesc}"`);
          return true;
        }
        
        // Strategy 2: Subscription name is contained in description or vice versa
        if (cleanDescLower.includes(subNameLower) || subNameLower.includes(cleanDescLower)) {
          console.log(`[backfillService] Contains match: "${sub.name}" in "${cleanDesc}"`);
          return true;
        }
        
        // Strategy 3: First word matches
        if (merchantName.length >= 2 && (subNameLower === merchantName || subNameLower.includes(merchantName) || merchantName.includes(subNameLower))) {
          console.log(`[backfillService] First word match: "${sub.name}" matches "${merchantName}"`);
          return true;
        }
        
        // Strategy 4: First two words match
        if (firstTwoWords.length >= 2 && (subNameLower === firstTwoWords || subNameLower.includes(firstTwoWords) || firstTwoWords.includes(subNameLower))) {
          console.log(`[backfillService] Two words match: "${sub.name}" matches "${firstTwoWords}"`);
          return true;
        }
        
        // Strategy 5: First three words match (for "Google One" type names)
        if (firstThreeWords.length >= 2 && (subNameLower === firstThreeWords || subNameLower.includes(firstThreeWords) || firstThreeWords.includes(subNameLower))) {
          console.log(`[backfillService] Three words match: "${sub.name}" matches "${firstThreeWords}"`);
          return true;
        }
        
        // Strategy 6: Full description contains subscription name
        if (descLower.includes(subNameLower) || subNameLower.includes(descLower)) {
          console.log(`[backfillService] Full description match: "${sub.name}" in "${transaction.description}"`);
          return true;
        }
        
        return false;
      });

      if (matchingSubscription) {
        try {
          await updateTransaction(transaction.id, {
            subscriptionId: matchingSubscription.id,
          });
          linked++;
          console.log(`[backfillService] ✅ Linked transaction "${transaction.description}" to subscription "${matchingSubscription.name}"`);
        } catch (error) {
          console.error(`[backfillService] Error linking transaction ${transaction.id}:`, error);
          skipped++;
        }
      } else {
        skipped++;
        console.log(`[backfillService] ⚠️ No match found for transaction: "${transaction.description}" (cleaned: "${cleanDesc}")`);
      }
    }

    console.log(`[backfillService] Backfill complete: ${linked} linked, ${skipped} skipped`);
    return { linked, skipped };
  } catch (error) {
    console.error('[backfillService] Error during backfill:', error);
    return { linked: 0, skipped: 0 };
  }
};

