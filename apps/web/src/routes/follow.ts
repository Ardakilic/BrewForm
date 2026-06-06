import type { ActionFunctionArgs } from 'react-router';
import { followApi } from '../api/index.ts';

export const followAction = async ({ params, request }: ActionFunctionArgs) => {
  const userId = params.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Response('Missing or invalid userId', { status: 400 });
  }
  if (request.method === 'DELETE') {
    await followApi.unfollow(userId);
  } else {
    await followApi.follow(userId);
  }
  return null;
};
