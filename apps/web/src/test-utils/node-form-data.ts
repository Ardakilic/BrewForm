import { vi } from 'vitest';

/** Node's `node:buffer` module, reached without Node type declarations (the web tsconfig has none). */
type NodeBufferModule = { File: typeof File; Blob: typeof Blob };

/**
 * Swaps jsdom's `File`, `Blob` and `FormData` globals for Node's for the current test.
 * Multipart route actions read their body with `request.formData()`, and Node's multipart
 * parser rejects jsdom's file objects (a browser handles both sides natively), so tests that
 * submit or parse files through a `Request` install Node's implementations first. Call it in
 * `beforeEach` and restore with `vi.unstubAllGlobals()` in `afterEach`.
 */
export async function installNodeFormDataGlobals(): Promise<void> {
  const nodeBuffer = (
    globalThis as unknown as { process: { getBuiltinModule(id: string): NodeBufferModule } }
  ).process.getBuiltinModule('node:buffer');
  const form = await new Response('a=1', {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  }).formData();
  vi.stubGlobal('File', nodeBuffer.File);
  vi.stubGlobal('Blob', nodeBuffer.Blob);
  vi.stubGlobal('FormData', form.constructor);
}
