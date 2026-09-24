#!/bin/sh
set -eu
# Runs once in the isolated PostgreSQL entrypoint, not in the app.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-psqlrc --set ON_ERROR_STOP=1 <<'SQL'
\getenv migration_password MIGRATION_PASSWORD
\getenv app_password APP_DB_PASSWORD
\getenv worker_password WORKER_DB_PASSWORD
\getenv backup_password BACKUP_DB_PASSWORD
CREATE ROLE imx_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE imx_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE imx_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE imx_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
SELECT format('ALTER ROLE imx_migrate PASSWORD %L', :'migration_password') \gexec
SELECT format('ALTER ROLE imx_app PASSWORD %L', :'app_password') \gexec
SELECT format('ALTER ROLE imx_worker PASSWORD %L', :'worker_password') \gexec
SELECT format('ALTER ROLE imx_backup PASSWORD %L', :'backup_password') \gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO imx_migrate;
GRANT USAGE ON SCHEMA public TO imx_app, imx_worker, imx_backup;
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO imx_migrate, imx_app, imx_worker, imx_backup', current_database()) \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO imx_migrate', current_database()) \gexec
ALTER DEFAULT PRIVILEGES FOR ROLE imx_migrate IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO imx_app, imx_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE imx_migrate IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO imx_app, imx_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE imx_migrate IN SCHEMA public GRANT SELECT ON TABLES TO imx_backup;
ALTER ROLE imx_app SET statement_timeout = '60s';
ALTER ROLE imx_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE imx_worker SET idle_in_transaction_session_timeout = '120s';
SQL
