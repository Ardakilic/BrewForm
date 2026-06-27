/**
 * @module
 * Compose-config guard: asserts the local-dev Deno cache mount and pinned images in the
 * repo-root `compose.yml` so the d32 reconciliation fixes cannot silently regress.
 */
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

/**
 * Reads the repo-root `compose.yml` as raw text. This file lives at `packages/shared/src/`,
 * three levels below the workspace root, so the path is resolved from `import.meta.url`
 * (independent of the `deno test` working directory).
 * @returns The full text of `compose.yml`.
 */
async function readComposeFile(): Promise<string> {
  return await Deno.readTextFile(new URL('../../../compose.yml', import.meta.url));
}

describe('compose.yml local-dev invariants', () => {
  it('mounts the Deno cache at the image DENO_DIR (/deno-dir)', async () => {
    const compose = await readComposeFile();
    expect(compose).toContain('deno_cache:/deno-dir');
    expect(compose).not.toContain('deno_cache:/root/.cache/deno');
  });

  it('pins the preview Caddy image to match Dockerfile.web', async () => {
    const compose = await readComposeFile();
    expect(compose).toContain('caddy:2.11.4-alpine');
    expect(compose).not.toContain('image: caddy:2-alpine');
  });
});
