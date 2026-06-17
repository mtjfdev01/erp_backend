import { Injectable } from "@nestjs/common";
import { DonationBoxService } from "../../dms/donation_box/donation-box.service";
import {
  BoxStatus,
  BoxType,
  CollectionFrequency,
} from "../../dms/donation_box/entities/donation-box.entity";
import {
  EntityImportHandler,
  ImportBatchResult,
  ImportRowResult,
} from "./import-handler.interface";

const HEADER_ALIASES: Record<string, string> = {
  collection_frequency: "frequency",
  route: "route_name",
  assigned_user_id: "assigned_user_ids",
};

@Injectable()
export class DonationBoxImportHandler implements EntityImportHandler {
  readonly entityName = "donation_box";

  constructor(private readonly donationBoxService: DonationBoxService) {}

  getRequiredHeaders(): string[] {
    return ["shop_name"];
  }

  getOptionalHeaders(): string[] {
    return [
      "key_no",
      "route_id",
      "route_name",
      "city_id",
      "city_name",
      "shopkeeper",
      "cell_no",
      "landmark_marketplace",
      "box_type",
      "status",
      "frequency",
      "collection_frequency",
      "active_since",
      "notes",
      "assigned_user_ids",
      "frd_officer_reference",
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

  private parseOptionalInt(value: string | undefined): number | undefined {
    if (!value || String(value).trim() === "") return undefined;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }

  private parseIdList(value: string | undefined): number[] {
    if (!value?.trim()) return [];
    return value
      .split(/[,;|]/)
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  }

  private normalizeEnum<T extends string>(
    value: string | undefined,
    allowed: readonly T[],
    fallback: T,
  ): T {
    const v = String(value || "")
      .trim()
      .toLowerCase() as T;
    return allowed.includes(v) ? v : fallback;
  }

  private todayDateString(): string {
    return new Date().toISOString().split("T")[0];
  }

  async importRows(
    rows: Record<string, string>[],
    user: any,
  ): Promise<ImportBatchResult> {
    const results: ImportRowResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const seenKeyNos = new Set<string>();

    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = i + 2;
      const row = this.mapRow(rows[i]);
      const shopName = String(row.shop_name || "").trim();
      const keyNo = String(row.key_no || "").trim();

      if (!shopName && !keyNo && !row.route_id && !row.route_name) {
        skippedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          error: "Empty row skipped",
        });
        continue;
      }

      if (!shopName) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          error: "shop_name is required",
        });
        continue;
      }

      const routeId = this.parseOptionalInt(row.route_id);
      const routeName = row.route_name?.trim();
      if (!routeId && !routeName) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          email: shopName,
          error: "route_id or route_name is required",
        });
        continue;
      }

      if (keyNo) {
        const keyLower = keyNo.toLowerCase();
        if (seenKeyNos.has(keyLower)) {
          failedCount += 1;
          results.push({
            row: rowNumber,
            success: false,
            email: shopName,
            error: `Duplicate key_no in import file: ${keyNo}`,
          });
          continue;
        }
        seenKeyNos.add(keyLower);
      }

      const payload: Record<string, unknown> = {
        shop_name: shopName,
        key_no: keyNo || undefined,
        route_id: routeId,
        route_name: routeName,
        city_id: this.parseOptionalInt(row.city_id),
        city_name: row.city_name?.trim() || undefined,
        shopkeeper: row.shopkeeper?.trim() || undefined,
        cell_no: row.cell_no?.trim() || undefined,
        landmark_marketplace: row.landmark_marketplace?.trim() || undefined,
        box_type: this.normalizeEnum(
          row.box_type,
          Object.values(BoxType),
          BoxType.MEDIUM,
        ),
        status: this.normalizeEnum(
          row.status,
          Object.values(BoxStatus),
          BoxStatus.ACTIVE,
        ),
        frequency: this.normalizeEnum(
          row.frequency,
          Object.values(CollectionFrequency),
          CollectionFrequency.WEEKLY,
        ),
        active_since: row.active_since?.trim() || this.todayDateString(),
        notes: row.notes?.trim() || undefined,
        frd_officer_reference: row.frd_officer_reference?.trim() || undefined,
        assigned_user_ids: this.parseIdList(row.assigned_user_ids),
      };

      try {
        const saved = await this.donationBoxService.importDonationBoxRow(
          payload,
          user,
        );
        successCount += 1;
        results.push({
          row: rowNumber,
          success: true,
          email: shopName,
          id: saved.id,
        });
      } catch (err: any) {
        failedCount += 1;
        results.push({
          row: rowNumber,
          success: false,
          email: shopName,
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
