/**
 * Slug-exhaustion tests (spec: recipe-slug, "Exhausted slug candidates return
 * 409 SLUG_CONFLICT"). `randomSlugSuffix` is mocked to always return `bbbbbb`,
 * so a title has exactly two candidates (`<base>` and `<base>-bbbbbb`); once
 * both are taken, create and fork must answer `409 SLUG_CONFLICT`, never 500.
 */
import '../../test-setup.ts';
import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, log as errorHandlerLog } from '../../middleware/errorHandler.ts';
import type { AppEnv } from '../../types/hono.ts';
import { ConflictError } from '../../utils/errors.ts';
import recipeRouter, { deps } from './index.ts';
import * as service from './service.ts';
import { recipeInput, SlugFixtures, slugMarker } from './test-helpers.ts';

vi.mock('@brewform/shared/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@brewform/shared/utils')>()),
  randomSlugSuffix: () => 'bbbbbb',
}));

const originalAuthMiddleware = deps.authMiddleware;

/**
 * Build an app with the real recipe router, a stubbed auth guard that injects
 * `userId`, and the global error handler.
 *
 * @param userId - The authenticated caller.
 */
function createApp(userId: string) {
  deps.authMiddleware = async (_c: Context, next: Next) => {
    await next();
  };
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('userId', userId);
    c.set('user', {
      id: userId,
      isAdmin: false,
      emailVerifiedAt: new Date(),
      // biome-ignore lint/suspicious/noExplicitAny: partial user stub for the route context
    } as any);
    await next();
  });
  app.route('/api/v1/recipes', recipeRouter);
  app.onError(errorHandler);
  return app;
}

describe('recipe slug exhaustion', () => {
  const fixtures = new SlugFixtures();
  let author: Awaited<ReturnType<SlugFixtures['user']>>;
  let other: Awaited<ReturnType<SlugFixtures['user']>>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    author = await fixtures.user('exhaust-author');
    other = await fixtures.user('exhaust-other');
  });

  beforeEach(() => {
    errorSpy = vi.spyOn(errorHandlerLog, 'error');
  });

  afterEach(() => {
    // No escaped error may reach the generic 500 branch.
    const unhandled = errorSpy.mock.calls.filter(
      (call: unknown[]) => call[1] === 'Unhandled error',
    );
    expect(unhandled).toEqual([]);
    errorSpy.mockRestore();
    deps.authMiddleware = originalAuthMiddleware;
  });

  afterAll(async () => {
    await fixtures.cleanup();
  });

  it('rejects the third create with ConflictError SLUG_CONFLICT', async () => {
    const title = `Exhaust ${slugMarker()}`;
    const first = await service.createRecipe(author.id, recipeInput(title));
    const second = await service.createRecipe(author.id, recipeInput(title));
    expect(second!.slug).toBe(`${first!.slug}-bbbbbb`);

    const third = service.createRecipe(author.id, recipeInput(title));
    await expect(third).rejects.toBeInstanceOf(ConflictError);
    await expect(third).rejects.toMatchObject({ code: 'SLUG_CONFLICT', status: 409 });
  });

  it('answers the third POST /api/v1/recipes with 409 SLUG_CONFLICT', async () => {
    const app = createApp(author.id);
    const title = `Exhaust ${slugMarker()}`;
    const post = () =>
      app.request('/api/v1/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          visibility: 'draft',
          brewMethod: 'v60',
          drinkType: 'pour_over',
          preparationNotes: 'Bloom 45s',
        }),
      });

    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('SLUG_CONFLICT');
    expect(body.error.message).toBe('Could not allocate a unique recipe slug');
  });

  it('answers the third untitled fork with 409 SLUG_CONFLICT', async () => {
    const source = await service.createRecipe(author.id, recipeInput(`Exhaust ${slugMarker()}`));
    const app = createApp(other.id);
    const fork = () =>
      app.request(`/api/v1/recipes/${source!.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

    expect((await fork()).status).toBe(201);
    expect((await fork()).status).toBe(201);
    const res = await fork();
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('SLUG_CONFLICT');
  });
});
