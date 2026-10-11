/**
 * Top-level cron job definitions using node-cron.
 * Must be imported at module top-level before serve().
 */
import cron from 'node-cron';
import { createLogger } from '../logger/index.ts';

const log = createLogger('jobs');

cron.schedule(
  '0 * * * *',
  async () => {
    try {
      const { evaluateAllBadges } = await import('../../modules/badge/service.ts');
      await evaluateAllBadges();
    } catch (err) {
      log.error({ err, job: 'evaluate-badges' }, 'Cron job failed');
    }
  },
  { name: 'evaluate-badges' },
);
