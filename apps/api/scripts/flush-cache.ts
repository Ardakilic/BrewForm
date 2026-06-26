/**
 * Clear all Deno KV cache entries.
 *
 * Usage:
 *   deno run --allow-env --allow-read --allow-write --allow-net apps/api/scripts/flush-cache.ts
 *   make flush-cache
 *
 * Connects to the remote denokv server at DENO_KV_URL (default http://denokv:4512),
 * so --allow-net is required.
 */

try {
  const kv = await Deno.openKv(Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512');
  console.log('Clearing Deno KV cache...');
  let count = 0;
  const entries = kv.list({ prefix: [] });
  for await (const entry of entries) {
    await kv.delete(entry.key);
    count++;
  }
  kv.close();
  if (count === 0) {
    console.log('No KV entries found to clear.');
  } else {
    console.log(`Cleared ${count} KV entries successfully.`);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Could not clear Deno KV: ${message}`);
  console.warn('This is expected if KV is not initialized or the data directory is not mounted.');
}
