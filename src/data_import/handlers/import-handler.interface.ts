export interface ImportRowResult {
  row: number;
  success: boolean;
  email?: string;
  id?: number;
  error?: string;
}

export interface ImportBatchResult {
  entity_name: string;
  total_rows: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  results: ImportRowResult[];
}

export interface EntityImportHandler {
  readonly entityName: string;
  getRequiredHeaders(): string[];
  getOptionalHeaders(): string[];
  importRows(
    rows: Record<string, string>[],
    user: any,
  ): Promise<ImportBatchResult>;
}
