import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, initFirebase } from './firebase';

export type CannyPostSummary = {
  id: string;
  title: string;
  details?: string;
  status?: string;
  score?: number;
  commentCount?: number;
  created?: string;
  url?: string;
};

export const listCannyPosts = async (args: { boardToken: string; limit?: number; skip?: number }) => {
  await initFirebase();
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error('Firebase functions not initialized');

  const fn = httpsCallable(functions, 'cannyListPosts');
  const res = await fn(args);
  return res.data as { posts: CannyPostSummary[]; hasMore: boolean };
};

export const createCannyPost = async (args: {
  boardToken: string;
  title: string;
  details: string;
  categoryID?: string;
}) => {
  await initFirebase();
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error('Firebase functions not initialized');

  const fn = httpsCallable(functions, 'cannyCreatePost');
  const res = await fn(args);
  return res.data as { id: string };
};
