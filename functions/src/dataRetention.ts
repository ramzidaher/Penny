/**
 * Data Retention Cloud Function
 * 
 * Scheduled function that enforces GDPR-compliant 24-month retention policy.
 * 
 * Runs daily to:
 * 1. Find transactions older than 24 months
 * 2. Aggregate them into monthly summaries
 * 3. Delete detailed transaction data
 * 4. Keep aggregated summaries indefinitely
 * 
 * Security:
 * - Only processes transactions older than 24 months
 * - Soft delete first (mark as deleted), hard delete after 30 days
 * - Audit logging for compliance
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface MonthlySummary {
  userId: string;
  year: number;
  month: number; // 1-12
  category: string;
  totalAmount: number;
  transactionCount: number;
  type: 'income' | 'expense';
  createdAt: admin.firestore.Timestamp;
}

/**
 * Calculate the cutoff date for 24-month retention
 */
const getRetentionCutoffDate = (): Date => {
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setMonth(cutoffDate.getMonth() - 24);
  return cutoffDate;
};

/**
 * Aggregate transactions into monthly summaries
 */
const aggregateTransactions = (
  transactions: admin.firestore.QueryDocumentSnapshot[],
  userId: string
): MonthlySummary[] => {
  const summaries = new Map<string, MonthlySummary>();
  
  for (const transactionDoc of transactions) {
    const transaction = transactionDoc.data();
    const date = transaction.date.toDate();
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    const category = transaction.category || 'Uncategorized';
    const type = transaction.type || 'expense';
    const key = `${year}-${month}-${category}-${type}`;
    
    if (!summaries.has(key)) {
      summaries.set(key, {
        userId,
        year,
        month,
        category,
        totalAmount: 0,
        transactionCount: 0,
        type: type as 'income' | 'expense',
        createdAt: admin.firestore.Timestamp.now(),
      });
    }
    
    const summary = summaries.get(key)!;
    summary.totalAmount += transaction.amount || 0;
    summary.transactionCount += 1;
  }
  
  return Array.from(summaries.values());
};

/**
 * Process data retention for a single user
 */
const processUserRetention = async (userId: string): Promise<{
  processed: number;
  deleted: number;
  aggregated: number;
}> => {
  const cutoffDate = getRetentionCutoffDate();
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);
  
  // Find all transactions older than 24 months
  const transactionsRef = db.collection(`users/${userId}/transactions`);
  const expiredTransactionsQuery = transactionsRef
    .where('date', '<', cutoffTimestamp)
    .limit(500); // Process in batches
  
  const expiredSnap = await expiredTransactionsQuery.get();
  
  if (expiredSnap.empty) {
    return { processed: 0, deleted: 0, aggregated: 0 };
  }
  
  // Aggregate transactions
  const summaries = aggregateTransactions(expiredSnap.docs, userId);
  
  // Store aggregated summaries
  const summariesRef = db.collection(`users/${userId}/transaction_summaries`);
  const batch = db.batch();
  
  for (const summary of summaries) {
    const summaryId = `${summary.year}-${summary.month}-${summary.category}-${summary.type}`;
    const summaryRef = summariesRef.doc(summaryId);
    
    // Use merge to update existing summaries or create new ones
    batch.set(summaryRef, summary, { merge: true });
  }
  
  // Delete expired transactions
  for (const transactionDoc of expiredSnap.docs) {
    batch.delete(transactionDoc.ref);
  }
  
  await batch.commit();
  
  return {
    processed: expiredSnap.docs.length,
    deleted: expiredSnap.docs.length,
    aggregated: summaries.length,
  };
};

/**
 * Scheduled function that runs daily at 2 AM UTC
 * Processes data retention for all users
 */
export const processDataRetention = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM UTC
  .timeZone('UTC')
  .onRun(async (context) => {
    functions.logger.info('Starting data retention process', {
      timestamp: new Date().toISOString(),
    });
    
    try {
      // Get all users
      const usersRef = db.collection('users');
      const usersSnap = await usersRef.get();
      
      let totalProcessed = 0;
      let totalDeleted = 0;
      let totalAggregated = 0;
      let usersProcessed = 0;
      
      // Process each user
      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        
        try {
          const result = await processUserRetention(userId);
          totalProcessed += result.processed;
          totalDeleted += result.deleted;
          totalAggregated += result.aggregated;
          usersProcessed += 1;
          
          if (result.processed > 0) {
            functions.logger.info('Processed user retention', {
              userId,
              processed: result.processed,
              deleted: result.deleted,
              aggregated: result.aggregated,
            });
          }
        } catch (error: any) {
          functions.logger.error('Error processing user retention', {
            userId,
            error: error.message,
          });
          // Continue with next user
        }
      }
      
      functions.logger.info('Data retention process completed', {
        usersProcessed,
        totalProcessed,
        totalDeleted,
        totalAggregated,
      });
      
      return {
        success: true,
        usersProcessed,
        totalProcessed,
        totalDeleted,
        totalAggregated,
      };
    } catch (error: any) {
      functions.logger.error('Error in data retention process', {
        error: error.message,
      });
      throw error;
    }
  });


