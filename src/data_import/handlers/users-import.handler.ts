import { Injectable } from "@nestjs/common";
import { UsersService } from "../../users/users.service";
import {
  EntityImportHandler,
  ImportBatchResult,
  ImportRowResult,
} from "./import-handler.interface";

@Injectable()
export class UsersImportHandler implements EntityImportHandler {
  readonly entityName = "users";

  constructor(private readonly usersService: UsersService) {}

  getRequiredHeaders(): string[] {
    return ["first_name", "last_name", "email", "department", "role"];
  }

  getOptionalHeaders(): string[] {
    return [
      "password",
      "phone",
      "user_code",
      "dob",
      "address",
      "cnic",
      "gender",
      "joining_date",
      "emergency_contact",
      "blood_group",
      "isActive",
      "manager_id",
    ];
  }

  private mapRow(raw: Record<string, string>): Record<string, string> {
    const mapped: Record<string, string> = {};
    Object.entries(raw).forEach(([key, value]) => {
      mapped[key.trim().toLowerCase().replace(/\s+/g, "_")] = value;
    });
    return mapped;
  }

  async importRows(
    rows: Record<string, string>[],
    user: any,
  ): Promise<ImportBatchResult> {
    const results: ImportRowResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const seenEmails = new Set<string>();

    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = i + 2;
      const row = this.mapRow(rows[i]);

      const first_name = String(row.first_name || "").trim();
      const last_name = String(row.last_name || "").trim();
      const email = String(row.email || "")
        .trim()
        .toLowerCase();
      const department = String(row.department || "")
        .trim()
        .toLowerCase();
      const role = String(row.role || "")
        .trim()
        .toLowerCase();

      if (!first_name && !last_name && !email) {
        skippedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          error: "Empty row skipped",
        });
        continue;
      }

      if (!first_name || !last_name) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          email: email || undefined,
          error: "first_name and last_name are required",
        });
        continue;
      }

      if (!email) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          error: "email is required",
        });
        continue;
      }

      if (!department || !role) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          email,
          error: "department and role are required",
        });
        continue;
      }

      if (seenEmails.has(email)) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          email,
          error: "Duplicate email in import file",
        });
        continue;
      }
      seenEmails.add(email);

      const payload: Record<string, unknown> = {
        first_name,
        last_name,
        email,
        department,
        role,
        password: row.password?.trim() || undefined,
        phone: row.phone?.trim() || undefined,
        user_code: row.user_code?.trim() || undefined,
        dob: row.dob?.trim() || undefined,
        address: row.address?.trim() || undefined,
        cnic: row.cnic?.trim() || undefined,
        gender: row.gender?.trim() || undefined,
        joining_date: row.joining_date?.trim() || undefined,
        emergency_contact: row.emergency_contact?.trim() || undefined,
        blood_group: row.blood_group?.trim() || undefined,
        isActive: row.isactive ?? row.is_active,
        manager_id: row.manager_id?.trim() || undefined,
      };

      try {
        const saved = await this.usersService.importUserRow(payload, user);
        successCount += 1;
        results.push({
          row: rowNumber,
          success: true,
          email,
          id: saved.id,
        });
      } catch (err: any) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          email,
          error: err?.message || "Import failed",
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
