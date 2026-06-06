import type { ActionFunctionArgs } from 'react-router';
import { followApi } from '../api/index.ts';

export const followAction = async ({ params, request }: ActionFunctionArgs) => {
  if (request.method === 'DELETE') {
    await followApi.unfollow(params.userId!);
  } else {
    await followApi.follow(params.userId!);
  }
  return null;
};
