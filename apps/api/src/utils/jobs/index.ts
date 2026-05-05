/**
 * Cron-based job scheduling using Deno.cron().
 * Works in both Deno CLI (local dev) and Deno Deploy (production).
 */
import { createLogger } from '../logger/index.ts';

const log = createLogger('jobs');

export type CronHandler = () => Promise<void>;

export interface CronJob {
  name: string;
  schedule: string;
  handler: CronHandler;
}

const jobs: CronJob[] = [];

export function registerJob(job: CronJob): void {
  jobs.push(job);
  log.info({ job: job.name, schedule: job.schedule }, 'Job registered');
}

export function startCronJobs(): void {
  for (const job of jobs) {
    log.info({ job: job.name }, 'Registering cron job');
    Deno.cron(job.name, job.schedule, async () => {
      try {
        await job.handler();
      } catch (err) {
        log.error({ err, job: job.name }, 'Cron job failed');
      }
    });
  }
}

export function stopCronJobs(): void {
  // Deno.cron() jobs are managed by the runtime; no manual stop needed.
  // In local dev with Deno CLI, jobs terminate when the process exits.
  log.info('Cron jobs stopping (process exit)');
}
