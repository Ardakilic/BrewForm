export interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: Date;
}