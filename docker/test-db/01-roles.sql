-- Role bootstrap for the local E2E database.
--
-- The migrations GRANT to `ultraos_app` (the role the application connects as, which is subject to the RLS policies) and
-- reference `ultraos_staging` in a few older grants. On the server those roles already exist; in a fresh container they do
-- not, and `prisma migrate deploy` fails on the first GRANT with:
--
--   ERROR: role "ultraos_app" does not exist
--
-- Creating them here keeps the local database shaped like the one the app actually runs against - which matters, because RLS
-- behaving differently under the owner account is precisely the class of bug the multi-tenant spec exists to catch.

CREATE ROLE ultraos_app LOGIN PASSWORD 'test' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE ultraos_staging NOLOGIN NOSUPERUSER NOBYPASSRLS;

GRANT ALL PRIVILEGES ON DATABASE ultraleagueos_test TO ultraos_app;
