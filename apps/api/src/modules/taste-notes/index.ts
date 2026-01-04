/**
 * BrewForm Taste Notes Routes
 * API endpoints for taste notes search and retrieval
 * All routes require authentication
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { tasteNoteService } from './service.js';
import { authMiddleware, requireAuth } from '../../middleware/auth.js';

const tasteNotes = new Hono();

// Apply authentication middleware to all taste-notes routes
tasteNotes.use('*', authMiddleware);
tasteNotes.use('*', requireAuth);

/**
 * Search query schema
 */
const searchQuerySchema = z.object({
  q: z.string().min(3).max(100),
});

/**
 * GET /taste-notes
 * Get all taste notes (cached)
 * Requires authentication
 */
tasteNotes.get('/', async (c) => {
  const notes = await tasteNoteService.getAllTasteNotesWithPaths();

  return c.json({
    success: true,
    data: notes,
  });
});

/**
 * GET /taste-notes/hierarchy
 * Get taste notes in hierarchical structure (cached)
 */
tasteNotes.get('/hierarchy', async (c) => {
  const hierarchy = await tasteNoteService.getTasteNotesHierarchy();

  return c.json({
    success: true,
    data: hierarchy,
  });
});

/**
 * GET /taste-notes/search
 * Search taste notes by query (minimum 3 characters)
 * Returns matching notes and their children
 */
tasteNotes.get('/search', zValidator('query', searchQuerySchema), async (c) => {
  const { q } = c.req.valid('query');
  const results = await tasteNoteService.searchTasteNotes(q);

  return c.json({
    success: true,
    data: results,
  });
});

/**
 * GET /taste-notes/:id
 * Get a single taste note by ID
 */
tasteNotes.get('/:id', async (c) => {
  const { id } = c.req.param();
  const note = await tasteNoteService.getTasteNoteById(id);

  if (!note) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Taste note not found' },
    }, 404);
  }

  return c.json({
    success: true,
    data: note,
  });
});

export default tasteNotes;
