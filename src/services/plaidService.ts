import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, initFirebase } from './firebase';

export type PlaidEnvironment = 'sandbox' | 'production';

export interface PlaidItemSummary {
  item_id: string;
  environment: PlaidEnvironment;
  institution_id: string | null;
  institution_name: string | null;
  createdAt: any | null;
  updatedAt: any | null;
}

export const createPlaidHostedLinkToken = async (environment: PlaidEnvironment = 'sandbox') => {
  await initFirebase();
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error('Firebase functions not initialized');

  const fn = httpsCallable(functions, 'createPlaidHostedLinkToken');
  const res = await fn({ environment });
  return res.data as {
    link_token: string;
    hosted_link_url?: string;
    expiration: string;
    request_id: string;
  };
};

export const plaidLinkTokenGet = async (link_token: string) => {
  await initFirebase();
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error('Firebase functions not initialized');

  const fn = httpsCallable(functions, 'plaidLinkTokenGet');
  const res = await fn({ link_token });
  return res.data as any;
};

export const exchangePlaidPublicToken = async (args: {
  public_token: string;
  environment: PlaidEnvironment;
  institution?: { institution_id?: string; name?: string };
}) => {
  await initFirebase();
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error('Firebase functions not initialized');

  const fn = httpsCallable(functions, 'exchangePlaidPublicToken');
  const res = await fn(args);
  return res.data as { item_id: string; request_id: string; accounts_upserted?: number };
};

export const listPlaidItems = async (): Promise<PlaidItemSummary[]> => {
  await initFirebase();
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error('Firebase functions not initialized');

  const fn = httpsCallable(functions, 'listPlaidItems');
  const res = await fn({});
  return (res.data as { items: PlaidItemSummary[] }).items || [];
};

export const removePlaidItem = async (item_id: string) => {
  await initFirebase();
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error('Firebase functions not initialized');

  const fn = httpsCallable(functions, 'removePlaidItem');
  const res = await fn({ item_id });
  return res.data as { ok: boolean };
};

