/**
 * Build script: compiles all .mjml templates to TypeScript modules.
 * Run with: deno run -A apps/api/scripts/build-email-templates.ts
 * Re-run whenever a .mjml template is modified.
 */
import { dirname, fromFileUrl, join } from 'jsr:@std/path';
import { ensureDir } from 'jsr:@std/fs';

// MJML must be available as a build-time dependency via npm:
const { default: mjml2html } = await import('npm:mjml');

const scriptDir = fromFileUrl(dirname(import.meta.url));
const templateDir = join(scriptDir, '..', 'src', 'templates', 'email');
const outputDir = join(scriptDir, '..', 'src', 'templates', 'email', 'generated');

await ensureDir(outputDir);

for await (const entry of Deno.readDir(templateDir)) {
  if (!entry.name.endsWith('.mjml')) continue;

  const name = entry.name.replace('.mjml', '');
  const mjmlPath = join(templateDir, entry.name);
  const mjmlContent = await Deno.readTextFile(mjmlPath);

  const { html, errors } = await mjml2html(mjmlContent);
  if (errors?.length > 0) {
    throw new Error(
      `MJML validation failed for ${entry.name}: ${
        errors.map((e: any) => (e as any).formattedMessage ?? (e as any).message).join(', ')
      }`,
    );
  }

  const tsContent = `// Auto-generated from ${entry.name}
// Do not edit manually. Run: deno run -A apps/api/scripts/build-email-templates.ts

export const template = \`${escapeBackticks(html)}\`;
`;

  await Deno.writeTextFile(join(outputDir, `${name}.ts`), tsContent);
}

function escapeBackticks(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\`/g, '\\`').replace(/\$/g, '\\$');
}

console.log('Email templates compiled successfully.');
