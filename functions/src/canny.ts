import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

type CannyBoard = {
  id: string;
  name: string;
  token?: string;
};

type CannyPost = {
  id: string;
  title: string;
  details?: string;
  status?: string;
  score?: number;
  commentCount?: number;
  created?: string;
  url?: string;
};

const CANNY_API_KEY = defineSecret('CANNY_API_KEY');

let cachedBoardToken: string | null = null;
let cachedBoardId: string | null = null;

const getApiKey = (): string => {
  const apiKey = (CANNY_API_KEY.value() || '').trim();
  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'Missing Canny API key. Set CANNY_API_KEY in the Functions environment.'
    );
  }
  return apiKey;
};

const cannyPost = async <TResponse>(path: string, body: Record<string, unknown>): Promise<TResponse> => {
  const apiKey = getApiKey();
  const url = `https://canny.io${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, ...body }),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const message = json?.error || json?.message || `Canny API request failed (${res.status})`;
    throw new HttpsError('internal', message, { status: res.status, canny: json });
  }

  return json as TResponse;
};

const resolveBoardId = async (boardToken?: string): Promise<string> => {
  const token = (boardToken || process.env.CANNY_BOARD_TOKEN || '').trim();
  if (!token) {
    throw new HttpsError('invalid-argument', 'boardToken is required.');
  }

  if (cachedBoardId && cachedBoardToken === token) {
    return cachedBoardId;
  }

  const resp = await cannyPost<{ boards: CannyBoard[] }>('/api/v1/boards/list', {});
  const board = resp.boards?.find((b) => b.token === token);
  if (!board?.id) {
    throw new HttpsError('not-found', 'Board not found for the supplied token.');
  }

  cachedBoardToken = token;
  cachedBoardId = board.id;
  return board.id;
};

const buildUserName = (email?: string | null, name?: string | null, uid?: string | null) => {
  const trimmedName = (name || '').trim();
  if (trimmedName) return trimmedName;
  const trimmedEmail = (email || '').trim();
  if (trimmedEmail) return trimmedEmail.split('@')[0];
  return uid ? `User ${uid.slice(0, 6)}` : 'User';
};

export const cannyListPosts = onCall({ secrets: [CANNY_API_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be authenticated.');
  }

  const limit = Number(request.data?.limit ?? 20);
  const skip = Number(request.data?.skip ?? 0);
  const boardToken = (request.data?.boardToken as string | undefined)?.trim();
  const boardID = await resolveBoardId(boardToken);

  const resp = await cannyPost<{ posts: CannyPost[]; hasMore?: boolean }>(
    '/api/v1/posts/list',
    {
      boardID,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20,
      skip: Number.isFinite(skip) ? Math.max(skip, 0) : 0,
      sort: 'newest',
    }
  );

  return {
    posts: resp.posts || [],
    hasMore: !!resp.hasMore,
  };
});

export const cannyCreatePost = onCall({ secrets: [CANNY_API_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be authenticated.');
  }

  const title = (request.data?.title as string | undefined)?.trim();
  const details = (request.data?.details as string | undefined)?.trim();
  const categoryID = (request.data?.categoryID as string | undefined)?.trim();
  const boardToken = (request.data?.boardToken as string | undefined)?.trim();

  if (!title) {
    throw new HttpsError('invalid-argument', 'title is required.');
  }
  if (!details) {
    throw new HttpsError('invalid-argument', 'details is required.');
  }

  const boardID = await resolveBoardId(boardToken);

  const email = request.auth?.token?.email as string | undefined;
  const name = request.auth?.token?.name as string | undefined;
  const displayName = buildUserName(email, name, uid);

  const userResp = await cannyPost<{ id: string }>('/api/v1/users/create_or_update', {
    userID: uid,
    email: email || undefined,
    name: displayName,
  });

  const postResp = await cannyPost<{ id: string }>('/api/v1/posts/create', {
    authorID: userResp.id,
    boardID,
    title,
    details,
    categoryID: categoryID || undefined,
  });

  return { id: postResp.id };
});
