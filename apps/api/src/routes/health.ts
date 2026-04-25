import { Hono } from 'hono';
import { prisma } from '@brewform/db';

const health = new Hono();

health.get('/health', (c) => c.json({ status: 'ok' }));

health.get('/ready', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: 'ready', db: 'connected' });
  } catch {
    return c.json({ status: 'not_ready', db: 'disconnected' }, 503);
  }
});

export default health;