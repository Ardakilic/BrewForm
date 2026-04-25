import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { UserProfileUpdateSchema } from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const user = new Hono<AppEnv>();

user.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  try {
    const profile = await service.getProfile(userId);
    return success(c, profile);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'USER_NOT_FOUND') return error(c, 'NOT_FOUND', 'User not found', 404);
    throw err;
  }
});

user.patch('/me', authMiddleware, zValidator('json', UserProfileUpdateSchema), async (c) => {
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  const updated = await service.updateProfile(userId, body);
  return success(c, updated);
});

user.delete('/me', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  await service.deleteAccount(userId);
  return success(c, { message: 'Account deleted' });
});

user.get('/:username', async (c) => {
  const username = c.req.param('username');
  try {
    const profile = await service.getPublicProfile(username);
    return success(c, profile);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'USER_NOT_FOUND') return error(c, 'NOT_FOUND', 'User not found', 404);
    throw err;
  }
});

export default user;