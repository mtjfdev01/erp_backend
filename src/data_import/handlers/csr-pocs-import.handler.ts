import { Injectable } from "@nestjs/common";
import { CsrPocsService } from "../../dms/organizations/csr-pocs.service";
import { OrganizationsService } from "../../dms/organizations/organizations.service";
import {
  EntityImportHandler,
  ImportBatchResult,
  ImportRowResult,
} from "./import-handler.interface";

const HEADER_ALIASES: Record<string, string> = {
  csr_donor_id: "csr_donor_id",
  organization_id: "csr_donor_id",
  organization: "csr_donor_name",
  organization_name: "csr_donor_name",
  company_name: "csr_donor_name",
  contact_person: "name",
  type: "role",
};

@Injectable()
export class CsrPocsImportHandler implements EntityImportHandler {
  readonly entityName = "csr_pocs";

  constructor(
    private readonly csrPocsService: CsrPocsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  getRequiredHeaders(): string[] {
    return ["name"];
  }

  getOptionalHeaders(): string[] {
    return [
      "csr_donor_id",
      "csr_donor_name",
      "email",
      "phone",
      "cnic",
      "role",
      "branch_id",
      "is_primary",
      "business_type",
      "business_type_other",
      "area_of_interest",
      "notes",
      "is_active",
    ];
  }

  private mapRow(raw: Record<string, string>): Record<string, string> {
    const mapped: Record<string, string> = {};
    Object.entries(raw).forEach(([key, value]) => {
      const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, "_");
      const target = HEADER_ALIASES[normalizedKey] || normalizedKey;
      mapped[target] = value;
    });
    return mapped;
  }

  private parseBool(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined || value === null || String(value).trim() === "") {
      return defaultValue;
    }
    const v = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(v)) return true;
    if (["false", "0", "no", "n"].includes(v)) return false;
    return defaultValue;
  }

  private parseOptionalInt(value: string | undefined): number | undefined {
    if (!value || String(value).trim() === "") return undefined;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }

  async importRows(
    rows: Record<string, string>[],
    user: any,
  ): Promise<ImportBatchResult> {
    const results: ImportRowResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = i + 2;
      const row = this.mapRow(rows[i]);

      const name = row.name?.trim();
      const emailRaw = String(row.email || "").trim().toLowerCase();
      const phone = String(row.phone || "").trim();

      if (!name && !emailRaw && !phone && !row.csr_donor_name) {
        skippedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          error: "Empty row skipped",
        });
        continue;
      }

      if (!name) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          error: "Name is required",
        });
        continue;
      }

      if (!emailRaw && !phone) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          error: "Either email or phone is required",
        });
        continue;
      }

      try {
        let csrDonorId = this.parseOptionalInt(row.csr_donor_id);
        if (!csrDonorId && row.csr_donor_name?.trim()) {
          const org = await this.organizationsService.findOrCreateFromCompanyFields(
            { company_name: row.csr_donor_name.trim() },
          );
          csrDonorId = org?.id;
        }

        if (!csrDonorId) {
          failedCount += 1;
          results.push({
            row: rowNumber,
            success: false,
            error: "csr_donor_id or csr_donor_name is required",
          });
          continue;
        }

        const saved = await this.csrPocsService.create(
          {
            csr_donor_id: csrDonorId,
            name,
            email: emailRaw || undefined,
            phone: phone || undefined,
            cnic: row.cnic?.trim() || undefined,
            role: row.role?.trim() || undefined,
            branch_id: this.parseOptionalInt(row.branch_id),
            is_primary: this.parseBool(row.is_primary, false),
            business_type: row.business_type?.trim() || undefined,
            business_type_other: row.business_type_other?.trim() || undefined,
            area_of_interest: row.area_of_interest?.trim() || undefined,
            notes: row.notes?.trim() || undefined,
            is_active: this.parseBool(row.is_active, true),
          },
          user,
        );

        successCount += 1;
        results.push({
          row: rowNumber,
          success: true,
          email: emailRaw || undefined,
          id: saved.id,
        });
      } catch (err) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          email: emailRaw || undefined,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      entity_name: this.entityName,
      total_rows: rows.length,
      success_count: successCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      results,
    };
  }
}
