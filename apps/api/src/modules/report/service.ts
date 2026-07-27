/**
 * Content report business logic for BrewForm.
 *
 * Orchestrates report creation, paginated listing with optional status filter,
 * and resolution with guard against double-resolving.
 */
import * as model from './model.ts';
import { createLogger } from '../../utils/logger/index.ts';

/**
 * Report service.
 *
 * Provides creation, listing, and resolution of user-submitted content reports.
 */
export const log = createLogger('report-service');

/** Create a new content report submitted by a user. */
export async function createReport(
  reporterId: string,
  entityType: string,
  entityId: string,
  reason: string,
) {
  log.debug({ reporterId, entityType, entityId }, 'createReport started');
  const result = await model.create(reporterId, entityType, entityId, reason);
  log.debug(
    { reporterId, entityType, entityId, reportId: result.id },
    'createReport completed',
  );
  return result;
}

/** List reports with optional status filter and pagination. */
export async function listReports(status: string | undefined, page: number, perPage: number) {
  log.debug({ status, page, perPage }, 'listReports started');
  const result = await model.findMany(status, page, perPage);
  log.debug({ status, page, perPage, total: result.total }, 'listReports completed');
  return result;
}

/**
 * Resolve a report by an admin.
 *
 * @param resolvedBy - The admin user ID resolving the report
 * @throws REPORT_NOT_FOUND if the report doesn't exist
 * @throws REPORT_ALREADY_RESOLVED if the report was already resolved
 */
export async function resolveReport(id: string, resolvedBy: string) {
  log.debug({ id, resolvedBy }, 'resolveReport started');
  const report = await model.findById(id);
  if (!report) {
    const err = new Error('REPORT_NOT_FOUND');
    log.error({ err, id, resolvedBy }, 'resolveReport failed: report not found');
    throw err;
  }
  if (report.status === 'resolved') {
    log.warn({ id, resolvedBy }, 'resolveReport failed: report already resolved');
    throw new Error('REPORT_ALREADY_RESOLVED');
  }
  const result = await model.resolve(id, resolvedBy);
  log.debug({ id, resolvedBy }, 'resolveReport completed');
  return result;
}
