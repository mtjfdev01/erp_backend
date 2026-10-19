import { MigrationInterface, QueryRunner } from "typeorm";

export class MigrateTaskReportedToAndDropMeta1760000000031
  implements MigrationInterface
{
  name = "MigrateTaskReportedToAndDropMeta1760000000031";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tasks' AND column_name = 'reported_to' AND data_type = 'integer'
        ) THEN
          ALTER TABLE "tasks" ALTER COLUMN "reported_to" TYPE integer[] USING CASE WHEN "reported_to" IS NOT NULL THEN ARRAY["reported_to"] ELSE NULL END;
        ELSIF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tasks' AND column_name = 'reported_to'
        ) THEN
          ALTER TABLE "tasks" ADD COLUMN "reported_to" integer[];
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tasks' AND column_name = 'reported_to_ids'
        ) THEN
          ALTER TABLE "tasks" ADD COLUMN "reported_to_ids" integer[];
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "tasks" DROP COLUMN IF EXISTS "reported_to_users_meta";
    `);

    // Backfill reported_to and reported_to_ids from user_managers and manager_id for tasks with assigned users
    await queryRunner.query(`
      UPDATE tasks t
      SET 
        reported_to = sub.all_managers,
        reported_to_ids = sub.all_managers
      FROM (
        SELECT 
          t2.id as task_id,
          ARRAY(
            SELECT DISTINCT m_id FROM (
              SELECT um.manager_id AS m_id
              FROM user_managers um
              JOIN "user" mu ON mu.id = um.manager_id
              WHERE um.user_id = ANY(t2.assigned_user_ids)
                AND (mu.is_archived = false OR mu.is_archived IS NULL)
                AND (mu."isActive" = true OR mu."isActive" IS NULL)
              UNION
              SELECT u.manager_id AS m_id
              FROM "user" u
              JOIN "user" mu ON mu.id = u.manager_id
              WHERE u.id = ANY(t2.assigned_user_ids)
                AND u.manager_id IS NOT NULL
                AND (mu.is_archived = false OR mu.is_archived IS NULL)
                AND (mu."isActive" = true OR mu."isActive" IS NULL)
            ) mgrs
          ) AS all_managers
        FROM tasks t2
        WHERE t2.assigned_user_ids IS NOT NULL 
          AND array_length(t2.assigned_user_ids, 1) > 0
      ) sub
      WHERE t.id = sub.task_id 
        AND array_length(sub.all_managers, 1) > 0;
    `);

    await queryRunner.query(`
      UPDATE tasks
      SET reported_to = reported_to_ids
      WHERE (reported_to IS NULL OR array_length(reported_to, 1) IS NULL)
        AND reported_to_ids IS NOT NULL;

      UPDATE tasks
      SET reported_to_ids = reported_to
      WHERE (reported_to_ids IS NULL OR array_length(reported_to_ids, 1) IS NULL)
        AND reported_to IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "reported_to_users_meta" jsonb;
    `);
  }
}
