-- Block hard DELETE on critical tables (same pattern as donations.prevent_delete).
-- Safe / additive: does not drop or change existing rows.
-- Soft-archive via UPDATE is_archived = true remains allowed.

-- donations (ensure rule exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE schemaname = 'public'
      AND tablename = 'donations'
      AND rulename = 'prevent_delete'
  ) THEN
    CREATE RULE prevent_delete AS
      ON DELETE TO donations
      DO INSTEAD NOTHING;
  END IF;
END $$;

-- recurring_donations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE schemaname = 'public'
      AND tablename = 'recurring_donations'
      AND rulename = 'prevent_delete'
  ) THEN
    CREATE RULE prevent_delete AS
      ON DELETE TO recurring_donations
      DO INSTEAD NOTHING;
  END IF;
END $$;

-- users (table may be named "users" or "user" depending on TypeORM metadata)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND rulename = 'prevent_delete'
  ) THEN
    CREATE RULE prevent_delete AS
      ON DELETE TO users
      DO INSTEAD NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE schemaname = 'public'
      AND tablename = 'user'
      AND rulename = 'prevent_delete'
  ) THEN
    CREATE RULE prevent_delete AS
      ON DELETE TO "user"
      DO INSTEAD NOTHING;
  END IF;
END $$;
