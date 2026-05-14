/**
 * Top-level cron job definitions using Deno.cron().
 * Must be imported at module top-level before Deno.serve().
 * The platform extracts Deno.cron() definitions at deployment time.
 */
import { createLogger } from '../logger/index.ts';

const log = createLogger('jobs');

Deno.cron('evaluate-badges', '0 * * * *', async () => {
  try {
    const { evaluateAllBadges } = await import('../../modules/badge/service.ts');
    await evaluateAllBadges();
  } catch (err) {
    log.error({ err, job: 'evaluate-badges' }, 'Cron job failed');
  }
});
