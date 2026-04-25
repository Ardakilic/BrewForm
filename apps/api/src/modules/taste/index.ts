import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { TasteNoteFilterSchema } from '@brewform/shared/schemas';
import { authMiddleware, adminMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error } from '../../utils/response/index.ts';
import { cacheProvider } from '../../main.ts';
import type { AppEnv } from '../../types/hono.ts';

const taste = new Hono<AppEnv>();

taste.get('/hierarchy', async (c) => {
  const hierarchy = await service.getHierarchy(cacheProvider!);
  return success(c, hierarchy);
});

taste.get('/search', zValidator('query', TasteNoteFilterSchema), async (c) => {
  const { search } = c.req.valid('query');
  if (!search) {
    const allNotes = await service.getFlatList(cacheProvider!);
    return success(c, allNotes);
  }
  try {
    const results = await service.searchTasteNotes(search, cacheProvider!);
    return success(c, results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'QUERY_TOO_SHORT') {
      return error(c, 'QUERY_TOO_SHORT', 'Search query must be at least 3 characters', 400);
    }
    throw err;
  }
});

taste.get('/flat', async (c) => {
  const allNotes = await service.getFlatList(cacheProvider!);
  return success(c, allNotes);
});

taste.post('/', authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json();
  const note = await service.createTasteNote(body, cacheProvider!);
  return success(c, note, 201);
});

taste.patch('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const body = await c.req.json();
  const note = await service.updateTasteNote(id, body, cacheProvider!);
  return success(c, note);
});

taste.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id')!;
  await service.deleteTasteNote(id, cacheProvider!);
  return success(c, { message: 'Taste note deleted' });
});

export default taste;