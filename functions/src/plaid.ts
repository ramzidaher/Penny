import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

type PlaidEnvironment = 'sandbox' | 'production';
type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number;
  name?: string;
  merchant_name?: string;
  logo_url?: string; // Plaid merchant logo (100x100 PNG)
  date?: string;
  authorized_date?: string;
};
type PlaidTransactionsSyncResponse = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
};

const PLAID_CLIENT_ID = defineSecret('PLAID_CLIENT_ID');
const PLAID_SECRET_SANDBOX = defineSecret('PLAID_SECRET_SANDBOX');
const PLAID_SECRET_PRODUCTION = defineSecret('PLAID_SECRET_PRODUCTION');

const getPlaidBaseUrl = (env: PlaidEnvironment): string => {
  switch (env) {
    case 'production':
      return 'https://production.plaid.com';
    case 'sandbox':
    default:
      return 'https://sandbox.plaid.com';
  }
};

const getPlaidCredentials = (env: PlaidEnvironment): { clientId: string; secret: string } => {
  // Use Firebase Functions secrets (also available as env vars at runtime)
  const clientId = (PLAID_CLIENT_ID.value() || '').trim();
  const sandboxSecret = (PLAID_SECRET_SANDBOX.value() || '').trim();
  const productionSecret = (PLAID_SECRET_PRODUCTION.value() || '').trim();
  const secret = env === 'production' ? productionSecret : sandboxSecret;
  if (!clientId || !secret) {
    throw new HttpsError(
      'failed-precondition',
      'Missing Plaid credentials. Set PLAID_CLIENT_ID and the correct PLAID_SECRET_* for the requested environment.'
    );
  }
  return { clientId, secret };
};

const plaidPost = async <TResponse>(
  env: PlaidEnvironment,
  path: string,
  body: Record<string, unknown>
): Promise<TResponse> => {
  const { clientId, secret } = getPlaidCredentials(env);
  const url = `${getPlaidBaseUrl(env)}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      secret,
      ...body,
    }),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const errorMessage =
      json?.error_message ||
      json?.error_code ||
      `Plaid API request failed (${res.status})`;
    throw new HttpsError('internal', errorMessage, { status: res.status, plaid: json });
  }
  return json as TResponse;
};

const mapPlaidTransaction = (tx: PlaidTransaction) => {
  const amount = Math.abs(tx.amount || 0);
  const type: 'income' | 'expense' = tx.amount < 0 ? 'income' : 'expense';
  const description = tx.merchant_name || tx.name || 'Transaction';
  const rawDate = tx.date || tx.authorized_date || new Date().toISOString().slice(0, 10);
  const date = admin.firestore.Timestamp.fromDate(new Date(rawDate));
  return { amount, type, description, date };
};

const syncPlaidTransactionsForItem = async (args: {
  uid: string;
  itemId: string;
  env: PlaidEnvironment;
  accessToken: string;
}): Promise<{ upserted: number; removed: number }> => {
  const { uid, itemId, env, accessToken } = args;
  const db = admin.firestore();

  const accountsSnap = await db.collection(`users/${uid}/accounts`).where('plaidItemId', '==', itemId).get();
  const accountIdByPlaidAccountId = new Map<string, string>();
  accountsSnap.docs.forEach((doc) => {
    const data = doc.data() as { plaidAccountId?: string };
    if (data.plaidAccountId) {
      accountIdByPlaidAccountId.set(data.plaidAccountId, doc.id);
    }
  });

  const existingSnap = await db.collection(`users/${uid}/transactions`).where('plaidItemId', '==', itemId).get();
  const existingCreatedAt = new Map<string, FirebaseFirestore.Timestamp>();
  existingSnap.docs.forEach((doc) => {
    const data = doc.data() as { createdAt?: FirebaseFirestore.Timestamp };
    if (data.createdAt) {
      existingCreatedAt.set(doc.id, data.createdAt);
    }
  });

  const privateRef = db.doc(`plaid_private/${uid}/items/${itemId}`);
  const privateSnap = await privateRef.get();
  let cursor = (privateSnap.data()?.transactions_cursor as string | undefined) || null;

  let hasMore = true;
  let upserted = 0;
  let removed = 0;
  let page = 0;

  while (hasMore && page < 10) {
    const resp = await plaidPost<PlaidTransactionsSyncResponse>(env, '/transactions/sync', {
      access_token: accessToken,
      cursor,
      count: 500,
    });

    const batch = db.batch();
    const transactions = [...(resp.added || []), ...(resp.modified || [])];

    for (const tx of transactions) {
      const accountId = accountIdByPlaidAccountId.get(tx.account_id);
      if (!accountId) continue;

      const docId = `plaid_${itemId}_${tx.transaction_id}`;
      const { amount, type, description, date } = mapPlaidTransaction(tx);
      const createdAt = existingCreatedAt.get(docId) || admin.firestore.FieldValue.serverTimestamp();

      batch.set(
        db.doc(`users/${uid}/transactions/${docId}`),
        {
          accountId,
          amount,
          type,
          category: 'Other',
          description,
          date,
          createdAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          plaidTransactionId: tx.transaction_id,
          plaidAccountId: tx.account_id,
          plaidItemId: itemId,
          ...(tx.logo_url && { merchantLogoUrl: tx.logo_url }),
        },
        { merge: true }
      );
      upserted++;
    }

    for (const tx of resp.removed || []) {
      const docId = `plaid_${itemId}_${tx.transaction_id}`;
      batch.delete(db.doc(`users/${uid}/transactions/${docId}`));
      removed++;
    }

    if (transactions.length > 0 || (resp.removed || []).length > 0) {
      await batch.commit();
    }

    cursor = resp.next_cursor;
    hasMore = resp.has_more;
    page++;
  }

  await privateRef.set(
    {
      transactions_cursor: cursor,
      transactions_synced_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { upserted, removed };
};

export const createPlaidHostedLinkToken = onCall(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET_SANDBOX, PLAID_SECRET_PRODUCTION] },
  async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be authenticated.');
  }

  const requestedEnv = (request.data?.environment as PlaidEnvironment | undefined) || 'sandbox';
  const env: PlaidEnvironment = requestedEnv === 'production' ? 'production' : 'sandbox';

  const completionRedirectUri =
    (process.env.PLAID_COMPLETION_REDIRECT_URI || '').trim() || 'penny://plaid-callback';
  // IMPORTANT:
  // - `completion_redirect_uri` can be a custom scheme and does NOT need to be registered with Plaid.
  // - `redirect_uri` MUST be registered in the Plaid Dashboard (OAuth redirect URIs).
  // To avoid blocking Sandbox testing, only include `redirect_uri` when explicitly configured.
  const redirectUri = (process.env.PLAID_REDIRECT_URI || '').trim();
  const clientName = (process.env.PLAID_CLIENT_NAME || '').trim() || 'Penny';

  const countryCodes = (process.env.PLAID_COUNTRY_CODES || 'US')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  const requestBody: Record<string, unknown> = {
    client_name: clientName,
    // Use allowed country codes for your Plaid access level.
    country_codes: countryCodes.length ? countryCodes : ['US'],
    language: 'en',
    user: { client_user_id: uid },
    products: ['transactions'],
    hosted_link: {
      completion_redirect_uri: completionRedirectUri,
      // NOTE:
      // Setting this to true requires also providing `redirect_uri` (must be https and registered in Plaid Dashboard).
      // For sandbox testing without configuring an OAuth redirect URL, keep this false.
      is_mobile_app: false,
    },
  };

  if (redirectUri) {
    requestBody.redirect_uri = redirectUri;
  }

  const resp = await plaidPost<{
    link_token: string;
    hosted_link_url?: string;
    expiration: string;
    request_id: string;
  }>(env, '/link/token/create', requestBody);

  // Store link_token so the client can safely call /link/token/get later.
  const db = admin.firestore();
  await db.doc(`users/${uid}/plaid_link_tokens/${resp.link_token}`).set(
    {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      environment: env,
      expiration: resp.expiration,
      hosted_link_url: resp.hosted_link_url || null,
    },
    { merge: true }
  );

  return resp;
});

export const plaidLinkTokenGet = onCall(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET_SANDBOX, PLAID_SECRET_PRODUCTION] },
  async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be authenticated.');
  }

  const linkToken = (request.data?.link_token as string | undefined)?.trim();
  if (!linkToken) {
    throw new HttpsError('invalid-argument', 'link_token is required.');
  }

  const db = admin.firestore();
  const tokenDoc = await db.doc(`users/${uid}/plaid_link_tokens/${linkToken}`).get();
  if (!tokenDoc.exists) {
    throw new HttpsError('permission-denied', 'Unknown link_token for this user.');
  }

  const env = ((tokenDoc.data()?.environment as PlaidEnvironment | undefined) || 'sandbox') as PlaidEnvironment;
  const resp = await plaidPost<any>(env, '/link/token/get', { link_token: linkToken });
  return resp;
});

export const exchangePlaidPublicToken = onCall(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET_SANDBOX, PLAID_SECRET_PRODUCTION] },
  async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be authenticated.');
  }

  const publicToken = (request.data?.public_token as string | undefined)?.trim();
  if (!publicToken) {
    throw new HttpsError('invalid-argument', 'public_token is required.');
  }

  const environment = (request.data?.environment as PlaidEnvironment | undefined) || 'sandbox';
  const env: PlaidEnvironment = environment === 'production' ? 'production' : 'sandbox';

  const resp = await plaidPost<{
    access_token: string;
    item_id: string;
    request_id: string;
  }>(env, '/item/public_token/exchange', { public_token: publicToken });

  const institution = request.data?.institution as { institution_id?: string; name?: string } | undefined;

  const db = admin.firestore();

  // SECURITY: store access_token outside of /users/{uid}/... so clients can't read it.
  await db.doc(`plaid_private/${uid}/items/${resp.item_id}`).set(
    {
      uid,
      item_id: resp.item_id,
      access_token: resp.access_token,
      environment: env,
      institution_id: institution?.institution_id || null,
      institution_name: institution?.name || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Public metadata for UI listing.
  await db.doc(`users/${uid}/plaid_items/${resp.item_id}`).set(
    {
      item_id: resp.item_id,
      environment: env,
      institution_id: institution?.institution_id || null,
      institution_name: institution?.name || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Fetch Plaid accounts and upsert "sub-accounts" into app Accounts collection.
  const accountsResp = await plaidPost<{ accounts: any[]; request_id: string }>(env, '/accounts/get', {
    access_token: resp.access_token,
  });

  const nowIso = new Date().toISOString();
  const batch = db.batch();
  let upserted = 0;

  const mapAccountType = (plaidType: string | undefined): 'bank' | 'card' | 'cash' | 'investment' => {
    switch ((plaidType || '').toLowerCase()) {
      case 'credit':
        return 'card';
      case 'investment':
        return 'investment';
      case 'loan':
        return 'bank';
      case 'depository':
      default:
        return 'bank';
    }
  };

  for (const acct of accountsResp.accounts || []) {
    const plaidAccountId: string | undefined = acct?.account_id;
    if (!plaidAccountId) continue;

    const docId = `plaid_${resp.item_id}_${plaidAccountId}`;
    const accountRef = db.doc(`users/${uid}/accounts/${docId}`);

    const isoCurrency =
      acct?.balances?.iso_currency_code || acct?.balances?.unofficial_currency_code || 'GBP';
    const currency = String(isoCurrency || 'GBP').toUpperCase();

    const current = typeof acct?.balances?.current === 'number' ? acct.balances.current : null;
    const available = typeof acct?.balances?.available === 'number' ? acct.balances.available : null;
    const balance = current ?? available ?? 0;

    const institutionName = institution?.name || null;
    const nameParts = [institutionName, acct?.name || acct?.official_name || null, acct?.mask ? `••${acct.mask}` : null]
      .filter(Boolean) as string[];
    const name = nameParts.length ? nameParts.join(' ') : 'Bank Account';

    batch.set(
      accountRef,
      {
        name,
        type: mapAccountType(acct?.type),
        balance,
        currency,
        isSynced: true,
        lastSyncedAt: nowIso,

        // Plaid fields (for linking/syncing)
        plaidItemId: resp.item_id,
        plaidAccountId,
        plaidInstitutionId: institution?.institution_id || null,
        plaidInstitutionName: institution?.name || null,
        plaidAccountType: acct?.type || null,
        plaidAccountSubtype: acct?.subtype || null,

        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    upserted++;
  }

  if (upserted > 0) {
    await batch.commit();
  }

  const txSync = await syncPlaidTransactionsForItem({
    uid,
    itemId: resp.item_id,
    env,
    accessToken: resp.access_token,
  });

  return {
    item_id: resp.item_id,
    request_id: resp.request_id,
    accounts_upserted: upserted,
    transactions_upserted: txSync.upserted,
  };
});

export const listPlaidItems = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be authenticated.');
  }

  const db = admin.firestore();
  const snap = await db.collection(`users/${uid}/plaid_items`).get();
  const items = snap.docs.map((d) => {
    const data = d.data();
    return {
      item_id: d.id,
      environment: data.environment || 'sandbox',
      institution_id: data.institution_id || null,
      institution_name: data.institution_name || null,
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
    };
  });
  return { items };
});

export const removePlaidItem = onCall(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET_SANDBOX, PLAID_SECRET_PRODUCTION] },
  async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be authenticated.');
  }

  const itemId = (request.data?.item_id as string | undefined)?.trim();
  if (!itemId) {
    throw new HttpsError('invalid-argument', 'item_id is required.');
  }

  const db = admin.firestore();

  // Read the access_token from the private storage doc.
  const privateRef = db.doc(`plaid_private/${uid}/items/${itemId}`);
  const privateSnap = await privateRef.get();
  const env = ((privateSnap.data()?.environment as PlaidEnvironment | undefined) || 'sandbox') as PlaidEnvironment;
  const accessToken = privateSnap.data()?.access_token as string | undefined;

  if (accessToken) {
    await plaidPost(env, '/item/remove', { access_token: accessToken });
  }

  // Delete app "sub-accounts" for this Plaid item.
  const accountsRef = db.collection(`users/${uid}/accounts`);
  const accountsSnap = await accountsRef.where('plaidItemId', '==', itemId).get();
  if (!accountsSnap.empty) {
    const batch = db.batch();
    accountsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // Delete Plaid transactions for this item.
  const txSnap = await db.collection(`users/${uid}/transactions`).where('plaidItemId', '==', itemId).get();
  if (!txSnap.empty) {
    const batch = db.batch();
    txSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // Delete public + private item docs.
  await db.doc(`users/${uid}/plaid_items/${itemId}`).delete().catch(() => {});
  await privateRef.delete().catch(() => {});

  return { ok: true };
});

export const syncPlaidTransactions = onCall(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET_SANDBOX, PLAID_SECRET_PRODUCTION] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'You must be authenticated.');
    }    const itemId = (request.data?.item_id as string | undefined)?.trim();
    const db = admin.firestore();

    const itemsSnap = itemId
      ? await db.doc(`plaid_private/${uid}/items/${itemId}`).get().then((doc) => [doc])
      : await db.collection(`plaid_private/${uid}/items`).get().then((snap) => snap.docs);

    const results: Array<{ item_id: string; upserted: number; removed: number }> = [];

    for (const docSnap of itemsSnap) {
      if (!docSnap.exists) continue;
      const data = docSnap.data() as { access_token?: string; environment?: PlaidEnvironment; item_id?: string };
      const accessToken = data.access_token;
      const env = (data.environment || 'sandbox') as PlaidEnvironment;
      const resolvedItemId = data.item_id || docSnap.id;
      if (!accessToken) continue;

      const result = await syncPlaidTransactionsForItem({
        uid,
        itemId: resolvedItemId,
        env,
        accessToken,
      });
      results.push({ item_id: resolvedItemId, upserted: result.upserted, removed: result.removed });
    }

    return { items: results };
  }
);
