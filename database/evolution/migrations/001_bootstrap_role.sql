-- EPIS2 Evolab — rol dedicado (ejecutar como superuser epis2 contra DB postgres)

DO $do$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'epis2_evolab') THEN
    CREATE ROLE epis2_evolab WITH LOGIN PASSWORD 'epis2_evolab' NOSUPERUSER NOCREATEDB NOBYPASSRLS;
  ELSE
    ALTER ROLE epis2_evolab WITH LOGIN PASSWORD 'epis2_evolab' NOSUPERUSER NOCREATEDB NOBYPASSRLS;
  END IF;
END
$do$;
