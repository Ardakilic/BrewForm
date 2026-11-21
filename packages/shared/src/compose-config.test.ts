/**
 * @module
 * Compose-config guard: asserts the local-dev Node/pnpm wiring and pinned images in the
 * repo-root `compose.yml` so the node24 migration cannot silently regress: the `app` and
 * `web-dev` dev services build the `deps` stage and keep dependencies in the `node_modules`
 * named volume at `/app/node_modules` (local-dev-environment). Text-based on purpose (no YAML
 * parser): service blocks are cut out by indentation.
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

/** The dev services that run the API and web dev servers from the `deps` image stage. */
const DEV_SERVICES = ['app', 'web-dev'];

/**
 * Cuts one top-level entry out of a Compose section (text-based): the `  <name>:` line at
 * two-space indentation under the `<section>:` key and every following line up to the next
 * entry or top-level key.
 * @param compose The raw text of a Compose file.
 * @param section The top-level key, e.g. `services` or `volumes`.
 * @param name The entry name, e.g. `app`.
 * @returns The entry's lines joined by newlines, or `undefined` when the entry is absent.
 */
function composeEntry(compose: string, section: string, name: string): string | undefined {
  const lines = compose.split('\n');
  const sectionStart = lines.findIndex((line) => line === `${section}:`);
  if (sectionStart === -1) return undefined;
  let sectionEnd = sectionStart + 1;
  while (sectionEnd < lines.length && !/^[^\s#]/.test(lines[sectionEnd])) sectionEnd++;
  const start = lines.findIndex(
    (line, i) => i > sectionStart && i < sectionEnd && new RegExp(`^  ${name}:\\s*$`).test(line),
  );
  if (start === -1) return undefined;
  let end = start + 1;
  while (end < sectionEnd && !/^ {0,2}[^\s#]/.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
}

describe('compose.yml local-dev invariants', () => {
  it.each(DEV_SERVICES)(
    '%s builds target: deps and mounts node_modules:/app/node_modules',
    async (name) => {
      const service = composeEntry(await readComposeFile(), 'services', name);
      expect(service, `compose.yml must define the ${name} service`).toBeDefined();
      expect(service, `${name} must build the deps stage of Dockerfile`).toMatch(
        /^\s+target:\s*deps\s*$/m,
      );
      expect(service, `${name} must mount the node_modules volume at /app/node_modules`).toMatch(
        /^\s+-\s*['"]?node_modules:\/app\/node_modules['"]?\s*$/m,
      );
    },
  );

  it('declares the node_modules named volume', async () => {
    const volume = composeEntry(await readComposeFile(), 'volumes', 'node_modules');
    expect(volume, 'compose.yml must declare the node_modules volume').toBeDefined();
  });

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
    expect(compose).toContain('caddy:2.11.9-alpine');
    expect(compose).not.toContain('image: caddy:2-alpine');
  });
});

describe('composeEntry (inline fixtures)', () => {
  const fixture = [
    'services:',
    '  app:',
    '    build:',
    '      target: deps',
    '    # a comment',
    '  web-dev:',
    '    image: x',
    'volumes:',
    '  node_modules:',
    '  app:',
  ].join('\n');

  it('cuts a service block up to the next service', () => {
    expect(composeEntry(fixture, 'services', 'app')).toBe(
      ['  app:', '    build:', '      target: deps', '    # a comment'].join('\n'),
    );
    expect(composeEntry(fixture, 'services', 'web-dev')).toBe('  web-dev:\n    image: x');
  });

  it('looks only inside the requested section', () => {
    expect(composeEntry(fixture, 'volumes', 'app')).toBe('  app:');
    expect(composeEntry(fixture, 'volumes', 'web-dev')).toBeUndefined();
    expect(composeEntry(fixture, 'networks', 'app')).toBeUndefined();
  });
});
