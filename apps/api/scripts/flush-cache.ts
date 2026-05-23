/**
 * Clear all Deno KV cache entries.
 *
 * Usage:
 *   deno run --allow-env --allow-read --allow-write apps/api/scripts/flush-cache.ts
 *   make flush-cache
 */

let count = 0;

try {
  const kv = await Deno.openKv();
  console.log('Clearing Deno KV cache...');
  const entries = kv.list({ prefix: [] });
  for await (const entry of entries) {
    await kv.delete(entry.key);
    count++;
  }
  kv.close();
  console.log(`Cleared ${count} KV entries successfully.`);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Could not clear Deno KV: ${message}`);
  console.warn('This is expected if KV is not initialized or the data directory is not mounted.');
}

if (count === 0) {
  console.log('No KV entries found to clear.');
}
