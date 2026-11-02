export interface AidAuditChange {
  field: string;
  old_value: string | number | boolean | null;
  new_value: string | number | boolean | null;
}

export interface LogAidAuditParams {
  applicationId: number;
  applicationNo?: string | null;
  action: string;
  source?: string;
  changes: AidAuditChange[];
  performedByUserId?: number | null;
  metadata?: Record<string, unknown> | null;
}
