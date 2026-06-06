import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('like');

export const likeAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Response('Missing or invalid route parameter: id', { status: 400 });
  }

  logger.debug({ id }, 'likeAction started');

  try {
    await recipeApi.like(id);
    logger.debug({ id }, 'likeAction completed');
    return null;
  } catch (err: unknown) {
    logger.error({ err, id }, 'likeAction failed');
    throw err;
  }
};
