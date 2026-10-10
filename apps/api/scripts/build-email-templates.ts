/**
 * Build script: compiles all .mjml templates to TypeScript modules.
 * Run with: pnpm run email-build
 * Re-run whenever a .mjml template is modified.
 */
import { ensureDir, mkdirSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// MJML must be available as a build-time dependency via npm:
const { default: mjml2html } = await import('mjml');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const templateDir = join(scriptDir, '..', 'src', 'templates', 'email');
const outputDir = join(scriptDir, '..', 'src', 'templates', 'email', 'generated');

mkdirSync(outputDir, { recursive: true });

for (const entry of await readdir(templateDir, { withFileTypes: true })) {
  if (!entry.name.endsWith('.mjml')) continue;

  const name = entry.name.replace('.mjml', '');
  const mjmlPath = join(templateDir, entry.name);
  const mjmlContent = await readFile(mjmlPath, 'utf8');

  const { html, errors } = await mjml2html(mjmlContent);
  if (errors?.length > 0) {
    throw new Error(
      `MJML validation failed for ${entry.name}: ${
        // biome-ignore lint/suspicious/noExplicitAny: MJML error objects are untyped
        errors.map((e: any) => (e as any).formattedMessage ?? (e as any).message).join(', ')
      }`,
    );
  }

  const tsContent = `// Auto-generated from ${entry.name}
// Do not edit manually. Run: pnpm run email-build

export const template = \`${escapeBackticks(html)}\`;
`;

  await writeFile(join(outputDir, `${name}.ts`), tsContent);
}

/**
 * Escapes characters significant inside a JS template literal so a raw HTML/MJML string can be
 * embedded safely between backticks: backslashes, backticks, and `$` (which would otherwise begin
 * a `${...}` interpolation).
 * @param str Raw string to escape.
 * @returns The escaped string, safe to embed in a template literal.
 */
function escapeBackticks(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

console.log('Email templates compiled successfully.');
