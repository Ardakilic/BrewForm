import * as model from './model.ts';

export async function createReport(reporterId: string, entityType: string, entityId: string, reason: string) {
  return model.create(reporterId, entityType, entityId, reason);
}

export async function listReports(status: string | undefined, page: number, perPage: number) {
  return model.findMany(status, page, perPage);
}

export async function resolveReport(id: string, resolvedBy: string) {
  const report = await model.findById(id);
  if (!report) throw new Error('REPORT_NOT_FOUND');
  if (report.status === 'resolved') throw new Error('REPORT_ALREADY_RESOLVED');
  return model.resolve(id, resolvedBy);
}