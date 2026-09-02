-- Repair migration for deployments that already contain a relation named
-- projects_id_org_id_unique but do not have the required composite key on
-- projects(id, org_id).
--
-- This is deliberately separate from 028 because 028 may already be recorded
-- in schema_migrations. The migration is safe to run on both clean and legacy
-- databases and never drops or renames an existing application relation.

DO $$
DECLARE
  existing_index regclass;
  existing_index_unique boolean;
  existing_index_expected boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'projects'::regclass
      AND conname = 'projects_id_org_id_unique'
  ) THEN
    SELECT
      c.oid::regclass,
      i.indisunique,
      (
        i.indrelid = 'projects'::regclass
        AND pg_get_indexdef(c.oid) ~* '\\(id, org_id\\)'
      )
    INTO existing_index, existing_index_unique, existing_index_expected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE c.relname = 'projects_id_org_id_unique'
      AND n.nspname = current_schema()
      AND c.relkind = 'i'
    LIMIT 1;

    IF existing_index IS NOT NULL
       AND existing_index_unique
       AND existing_index_expected THEN
      -- Reuse a valid unique index instead of trying to create another
      -- relation with the same name. PostgreSQL supports converting an
      -- existing unique b-tree index into a UNIQUE constraint.
      EXECUTE format(
        'ALTER TABLE projects ADD CONSTRAINT projects_id_org_id_unique UNIQUE USING INDEX %I',
        existing_index::text
      );
    ELSIF existing_index IS NULL THEN
      -- No conflicting relation exists; use the canonical constraint name.
      ALTER TABLE projects
        ADD CONSTRAINT projects_id_org_id_unique UNIQUE (id, org_id);
    ELSE
      -- A conflicting index exists but is not a valid unique index for the
      -- required key. Keep the existing object untouched and create the
      -- required uniqueness under a non-conflicting constraint name.
      ALTER TABLE projects
        ADD CONSTRAINT projects_id_org_id_key UNIQUE (id, org_id);
    END IF;
  END IF;
END $$;
