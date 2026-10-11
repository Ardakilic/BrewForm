/**
 * Cron-based job scheduling using node-cron.
 * Works wherever the Node runtime runs (local dev and production alike).
 *
 * Cron jobs are defined at module top-level in cron.ts so importing the module
 * registers them exactly once via the module cache. Dynamic imports inside
 * handlers keep the implementation logic in its existing module.
 */
