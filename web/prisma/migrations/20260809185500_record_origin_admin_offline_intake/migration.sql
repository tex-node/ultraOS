-- Postgres forbids using a new enum value in the same transaction that adds it,
-- so this value addition must ship as its own migration ahead of the
-- AdminOfflineIntake table migration that defaults to it.
ALTER TYPE "RecordOrigin" ADD VALUE 'ADMIN_OFFLINE_INTAKE';
