import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const badge = new Hono<AppEnv>();

badge.get('/', async (c) => {
  const badges = await service.listBadges();
  return success(c, badges);
});

badge.get('/user/:userId', async (c) => {
  const userId = c.req.param('userId')!;
  const badges = await service.getUserBadges(userId);
  return success(c, badges);
});

badge.post('/evaluate/:userId', authMiddleware, adminMiddleware, async (c) => {
  const userId = c.req.param('userId')!;
  await service.evaluateBadges(userId);
  return success(c, { message: 'Badge evaluation completed' });
});

export default badge;