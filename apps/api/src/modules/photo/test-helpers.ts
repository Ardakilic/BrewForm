/**
 * Shared harness for the photo route tests (`index.test.ts`,
 * `index.s3.test.ts`): the real photo router behind a request-id middleware
 * and the global error handler, a seeded recipe author with a real access
 * token, and a multipart body builder.
 */
import { db } from '@brewform/db';
import { photos, recipes, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { errorHandler } from '../../middleware/errorHandler.ts';
import type { AppEnv } from '../../types/hono.ts';
import { signAccessToken } from '../auth/jwt.ts';
import photoRouter from './index.ts';

/** UUIDv4 pattern (lower-case) used by server-generated storage keys. */
export const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/** Build the photo router behind a request-id middleware and `app.onError(errorHandler)`, as `main.ts` does. */
export function createPhotoTestApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.onError(errorHandler);
  app.route('/api/v1/photos', photoRouter);
  return app;
}

/** A seeded user, the recipe they author, and a Bearer token for them. */
export interface PhotoAuthor {
  userId: string;
  recipeId: string;
  token: string;
}

/** Insert a user and a public recipe they author, and sign an access token for the user. */
export async function seedPhotoAuthor(prefix: string): Promise<PhotoAuthor> {
  const userId = crypto.randomUUID();
  const recipeId = crypto.randomUUID();
  const [user] = await db
    .insert(users)
    .values({
      id: userId,
      email: `${prefix}-${userId}@example.com`,
      username: `${prefix}-${userId.slice(0, 8)}`,
      passwordHash: 'hash',
      emailVerifiedAt: new Date(),
    })
    .returning();
  await db.insert(recipes).values({
    id: recipeId,
    slug: `${prefix}-${recipeId}`,
    title: `${prefix} ${recipeId.slice(0, 8)}`,
    authorId: userId,
    visibility: 'public',
  });
  const token = await signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: false,
  });
  return { userId, recipeId, token };
}

/** Delete the photos, recipe and user created by {@link seedPhotoAuthor}. */
export async function cleanupPhotoAuthor(author: PhotoAuthor): Promise<void> {
  await db.delete(photos).where(eq(photos.recipeId, author.recipeId));
  await db.delete(recipes).where(eq(recipes.id, author.recipeId));
  await db.delete(users).where(eq(users.id, author.userId));
}

/** One multipart part: bytes, the multipart filename and the declared Content-Type. */
export interface PartInput {
  bytes: Uint8Array;
  filename: string;
  type?: string;
}

/** Build the multipart body of a photo upload (`recipeId`, `file`, optional `thumbnail`). */
export function buildUploadForm(
  recipeId: string,
  file: PartInput,
  thumbnail?: PartInput,
): FormData {
  const form = new FormData();
  form.append('recipeId', recipeId);
  form.append(
    'file',
    new File([file.bytes as BlobPart], file.filename, { type: file.type ?? 'image/jpeg' }),
  );
  if (thumbnail) {
    form.append(
      'thumbnail',
      new File([thumbnail.bytes as BlobPart], thumbnail.filename, {
        type: thumbnail.type ?? 'image/jpeg',
      }),
    );
  }
  return form;
}

/** POST a multipart photo upload with the author's Bearer token. */
export function postUpload(app: Hono<AppEnv>, token: string, form: FormData): Promise<Response> {
  return Promise.resolve(
    app.request('/api/v1/photos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }),
  );
}
