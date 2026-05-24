/**
 * Content report business logic for BrewForm.
 *
 * Orchestrates report creation, paginated listing with optional status filter,
 * and resolution with guard against double-resolving.
 */
import * as model from './model.ts';

/** Create a new content report submitted by a user. */
export async function createReport(
  reporterId: string,
  entityType: string,
  entityId: string,
  reason: string,
) {
  return model.create(reporterId, entityType, entityId, reason);
}

/** List reports with optional status filter and pagination. */
export async function listReports(status: string | undefined, page: number, perPage: number) {
  return model.findMany(status, page, perPage);
}

/**
 * Resolve a report by an admin.
 *
 * @param resolvedBy - The admin user ID resolving the report
 * @throws REPORT_NOT_FOUND if the report doesn't exist
 * @throws REPORT_ALREADY_RESOLVED if the report was already resolved
 */
export async function resolveReport(id: string, resolvedBy: string) {
  const report = await model.findById(id);
  if (!report) throw new Error('REPORT_NOT_FOUND');
  if (report.status === 'resolved') throw new Error('REPORT_ALREADY_RESOLVED');
  return model.resolve(id, resolvedBy);
}
