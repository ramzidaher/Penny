/**
 * Account Deletion Cloud Function
 *
 * Scheduled function that purges user data after the deletion grace period.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const deleteCollection = async (collectionPath: string, batchSize = 500): Promise<number> => {
  let totalDeleted = 0;

  while (true) {
    const snapshot = await db.collection(collectionPath).limit(batchSize).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snapshot.size;

    if (snapshot.size < batchSize) break;
  }

  return totalDeleted;
};

const deleteUserData = async (userId: string): Promise<Record<string, number>> => {
  const paths = [
    `users/${userId}/accounts`,
    `users/${userId}/transactions`,
    `users/${userId}/budgets`,
    `users/${userId}/subscriptions`,
    `users/${userId}/debts`,
    `users/${userId}/chatThreads`,
    `users/${userId}/memories`,
    `users/${userId}/advisorProgress`,
    `users/${userId}/settings`,
    `users/${userId}/security`,
    `users/${userId}/categoryLearning`,
    `users/${userId}/tokens`,
    `users/${userId}/plaid_items`,
    `users/${userId}/plaid_link_tokens`,
    `users/${userId}/transaction_summaries`,
  ];

  const results: Record<string, number> = {};
  for (const path of paths) {
    results[path] = await deleteCollection(path);
  }

  return results;
};

export const processAccountDeletions = functions.pubsub
  .schedule('0 3 * * *') // Daily at 3 AM UTC
  .timeZone('UTC')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const usersSnap = await db
      .collection('users')
      .where('accountStatus', '==', 'deletion_pending')
      .where('scheduledDeletionAt', '<=', now.toDate().toISOString())
      .limit(200)
      .get();

    if (usersSnap.empty) {
      functions.logger.info('No accounts pending deletion.');
      return null;
    }

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      try {
        const deletionResults = await deleteUserData(userId);
        await userDoc.ref.set(
          {
            accountStatus: 'deleted',
            deletedAt: now.toDate().toISOString(),
            purgedAt: now.toDate().toISOString(),
            deletionSummary: deletionResults,
          },
          { merge: true }
        );
        functions.logger.info(`Deleted user data for ${userId}`, deletionResults);
      } catch (error) {
        functions.logger.error(`Failed to delete user data for ${userId}`, error as Error);
      }
    }

    return null;
  });

