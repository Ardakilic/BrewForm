/**
 * @module
 * Generates raster PNG app icons from `apps/web/public/favicon.svg` using resvg. Run via
 * `make generate-icons`; writes the sized PNGs into the web public assets directory.
 */
import { Resvg } from 'npm:@resvg/resvg-js';
import { join } from 'jsr:@std/path';

const svgData = await Deno.readTextFile(
  join(import.meta.dirname!, '..', 'apps', 'web', 'public', 'favicon.svg'),
);
const outDir = join(import.meta.dirname!, '..', 'apps', 'web', 'public');

const sizes: [number, string][] = [
  [32, 'favicon-32.png'],
  [180, 'apple-touch-icon.png'],
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
];

for (const [size, name] of sizes) {
  const resvg = new Resvg(svgData, { fitTo: { mode: 'width', value: size } });
  await Deno.writeFile(join(outDir, name), resvg.render().asPng());
  console.log(`Generated ${name} (${size}x${size})`);
}
