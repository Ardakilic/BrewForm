import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { VendorCreateSchema, VendorUpdateSchema, PaginationSchema } from '@brewform/shared/schemas';
import { authMiddleware, adminMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error, paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const vendor = new Hono<AppEnv>();

vendor.get('/', zValidator('query', PaginationSchema), async (c) => {
  const { page, perPage } = c.req.valid('query');
  const result = await service.listVendors(page, perPage);
  return paginated(c, result.vendors, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

vendor.get('/search', async (c) => {
  const q = c.req.query('q') || '';
  if (q.length < 2) return success(c, []);
  const results = await service.searchVendors(q);
  return success(c, results);
});

vendor.post('/', authMiddleware, zValidator('json', VendorCreateSchema), async (c) => {
  const body = c.req.valid('json');
  const v = await service.createVendor(body);
  return success(c, v, 201);
});

vendor.get('/:id', async (c) => {
  const id = c.req.param('id')!;
  try {
    const v = await service.getVendor(id);
    return success(c, v);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'VENDOR_NOT_FOUND') return error(c, 'NOT_FOUND', 'Vendor not found', 404);
    throw err;
  }
});

vendor.patch('/:id', authMiddleware, zValidator('json', VendorUpdateSchema), async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  try {
    const v = await service.updateVendor(userId, id, body);
    return success(c, v);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'VENDOR_NOT_FOUND') return error(c, 'NOT_FOUND', 'Vendor not found', 404);
    throw err;
  }
});

vendor.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id')!;
  try {
    await service.deleteVendor(id);
    return success(c, { message: 'Vendor deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'VENDOR_NOT_FOUND') return error(c, 'NOT_FOUND', 'Vendor not found', 404);
    throw err;
  }
});

export default vendor;