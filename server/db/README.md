# Database workflow

Battle of Bands supports two persistence modes during the public-alpha migration.

## Local development

With no `DATABASE_URL`, the server keeps using the local SQLite adapter:

```bash
cd server
npm install
npm run seed
npm run dev
```

This preserves the lightweight local workflow while the public alpha is not deployed.

## Postgres / Supabase target

The public runtime uses the Postgres store when `DATABASE_URL` is present.

Required runtime settings:

```text
DATABASE_URL=<Supabase transaction-mode pooler connection string>
DATABASE_SSL=true
```

Do not commit real values.

For Supabase serverless runtime, `DATABASE_URL` should use the shared transaction-mode pooler (port 6543). The Postgres.js client is configured with:

- `max: 1`;
- `prepare: false`;
- TLS required by default;
- bounded liveness checking and client recycling before business work.

There is no broad retry around completed business transactions.

## Migrations

Schema changes are versioned in:

```text
server/db/migrations/
```

Apply them with:

```bash
cd server
DATABASE_MIGRATION_URL=<postgres connection> npm run migrate
```

If `DATABASE_MIGRATION_URL` is absent, the migrator falls back to `DATABASE_URL`.

The migrator records applied files in `battleofbands.schema_migrations` and can be run repeatedly.

For a future Supabase project, prefer the direct/session connection for administrative migration work when practical; runtime traffic still uses transaction pooling.

## Seed

The canonical catalog remains:

```text
server/data/artists.json
```

After migrations:

```bash
DATABASE_URL=<postgres connection> npm run seed
```

The seed is idempotent. It upserts artists by stable ID and ensures ranking rows exist.

## Security boundary

Application tables live in the private `battleofbands` schema.

The initial migration:

- revokes schema/table access from `PUBLIC`;
- explicitly revokes access from Supabase `anon` and `authenticated` roles when those roles exist;
- enables RLS on application tables;
- creates no permissive browser policies.

The browser does not connect directly to Supabase in the public alpha.

## Tests

The GitHub Actions server workflow starts an ephemeral Postgres 16 service and sets:

```text
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/battleofbands_test
DATABASE_SSL=false
```

Local automated tests do not require production Supabase credentials.

To run the Postgres integration contract locally, provide any disposable Postgres database through `TEST_DATABASE_URL` and run:

```bash
cd server
TEST_DATABASE_URL=<disposable-postgres-url> DATABASE_SSL=false npm test
```

Without `TEST_DATABASE_URL`, the Postgres integration test is skipped while the existing SQLite-backed tests still run.
