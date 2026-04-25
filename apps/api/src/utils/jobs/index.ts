import { createLogger } from '../logger/index.ts';

const log = createLogger('jobs');

export interface ScheduledJob {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
}

const jobs: ScheduledJob[] = [];
let intervals: ReturnType<typeof setInterval>[] = [];

export function registerJob(job: ScheduledJob): void {
  jobs.push(job);
  log.info({ job: job.name, intervalMs: job.intervalMs }, 'Job registered');
}

export function startJobs(): void {
  for (const job of jobs) {
    log.info({ job: job.name }, 'Starting job');
    const interval = setInterval(async () => {
      try {
        await job.handler();
      } catch (err) {
        log.error({ err, job: job.name }, 'Job failed');
      }
    }, job.intervalMs);
    intervals.push(interval);
  }
}

export function stopJobs(): void {
  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals = [];
  log.info('All jobs stopped');
}