/**
 * Audit-log type definition shared between API and frontend.
 */

/** Records an administrative action for compliance and traceability. */
export interface AuditLog {
  /** UUID primary key */
  id: string;
  /** FK to the admin who performed the action */
  adminId: string;
  /** Machine-readable action name (e.g. "ban_user", "delete_recipe") */
  action: string;
  /** Affected entity type (e.g. "user", "recipe") */
  entity: string;
  /** FK to the affected entity, or `null` for global actions */
  entityId: string | null;
  /** Additional JSON-encoded context */
  details: string | null;
  createdAt: Date;
}
