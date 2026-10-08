import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DataSource } from "typeorm";
import { Donation } from "../donations/entities/donation.entity";
import { RecurringDonation } from "../donations/recurring_donations/entities/recurring-donation.entity";
import { User } from "../users/user.entity";

/**
 * Ensures PostgreSQL RULE prevent_delete (DO INSTEAD NOTHING) exists on
 * donations, recurring_donations, and users — same lock as donations.
 * Soft-archive (UPDATE is_archived) remains allowed; hard DELETE is a no-op.
 */
@Injectable()
export class PreventHardDeleteBootstrap implements OnModuleInit {
  private readonly logger = new Logger(PreventHardDeleteBootstrap.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    void this.ensureRules().catch((err) => {
      this.logger.warn(
        `prevent_delete rules not applied: ${err?.message || err}`,
      );
    });
  }

  private tableName(entity: Function): string | null {
    try {
      return this.dataSource.getMetadata(entity)?.tableName || null;
    } catch {
      return null;
    }
  }

  private async ensureRules() {
    if (this.dataSource.options.type !== "postgres") return;

    const tables = new Set(
      [
        this.tableName(Donation) || "donations",
        this.tableName(RecurringDonation) || "recurring_donations",
        this.tableName(User) || "users",
        "donations",
        "recurring_donations",
        "users",
        "user",
      ].filter(Boolean),
    );

    for (const table of tables) {
      const safe = String(table).replace(/[^a-zA-Z0-9_]/g, "");
      if (!safe) continue;

      await this.dataSource.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${safe}'
          ) AND NOT EXISTS (
            SELECT 1 FROM pg_rules
            WHERE schemaname = 'public'
              AND tablename = '${safe}'
              AND rulename = 'prevent_delete'
          ) THEN
            CREATE RULE prevent_delete AS
              ON DELETE TO "${safe}"
              DO INSTEAD NOTHING;
          END IF;
        END $$;
      `);
      this.logger.log(`Hard DELETE lock checked on "${safe}"`);
    }
  }
}
