/**
 * @module
 * Compose-config guard: asserts the local-dev Node/pnpm wiring and pinned images in the
 * repo-root `compose.yml` so the node24 migration cannot silently regress.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/**
 * Reads the repo-root `compose.yml` as raw text. This file lives at `packages/shared/src/`,
 * three levels below the workspace root, so the path is resolved from `import.meta.url`
 * (independent of the vitest working directory).
 * @returns The full text of `compose.yml`.
 */
async function readComposeFile(): Promise<string> {
  return await readFile(new URL('../../../compose.yml', import.meta.url), 'utf8');
}

/**
 * Reads a workspace `package.json` as raw text, resolved from `import.meta.url`
 * (independent of the vitest working directory).
 * @param relativePath Path from the workspace root (e.g. `apps/api/package.json`).
 * @returns The full text of the `package.json`.
 */
async function readPackageJson(relativePath: string): Promise<string> {
  return await readFile(new URL(`../../../${relativePath}`, import.meta.url), 'utf8');
}

describe('compose.yml local-dev invariants', () => {
  it('has no Deno remnants (cache volume, kv sidecar, env, commands)', async () => {
    const compose = await readComposeFile();
    expect(compose).not.toContain('deno_cache');
    expect(compose).not.toContain('denokv');
    expect(compose).not.toContain('DENO_KV_');
    expect(compose).not.toContain('deno run');
    expect(compose).not.toContain('denoland/deno');
  });

  it('runs the API and web dev servers via pnpm workspace filters', async () => {
    const compose = await readComposeFile();
    expect(compose).toContain('pnpm');
    expect(compose).toContain('@brewform/api');
    expect(compose).toContain('@brewform/web');
    expect(compose).toContain('target: deps');
  });

  it('runs the API dev server with tsx watch and the web dev server with vite', async () => {
    const apiPackageJson = JSON.parse(await readPackageJson('apps/api/package.json')) as {
      scripts: Record<string, string>;
    };
    expect(apiPackageJson.scripts['dev']).toContain('tsx --watch');
    const webPackageJson = JSON.parse(await readPackageJson('apps/web/package.json')) as {
      scripts: Record<string, string>;
    };
    expect(webPackageJson.scripts['dev']).toContain('vite');
  });

  it('pins the preview Caddy image to match Dockerfile.web', async () => {
    const compose = await readComposeFile();
    expect(compose).toContain('caddy:2.11.4-alpine');
    expect(compose).not.toContain('image: caddy:2-alpine');
  });
});
