'use strict';

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const { resolveDatabaseSsl, getMigrationDatabaseUrl } = require('../config');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function resolveSsl(explicitSsl) {
  if (explicitSsl !== undefined) return explicitSsl;
  return resolveDatabaseSsl();
}

async function runMigrations({
  connectionString = getMigrationDatabaseUrl(),
  ssl,
} = {}) {
  if (!connectionString) {
    throw new Error('DATABASE_MIGRATION_URL or DATABASE_URL is required.');
  }

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    ssl: resolveSsl(ssl),
    connect_timeout: 5,
  });

  try {
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS battleofbands');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS battleofbands.schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    const applied = [];

    for (const name of files) {
      const existing = await sql`
        SELECT name
        FROM battleofbands.schema_migrations
        WHERE name = ${name}
      `;

      if (existing.length > 0) continue;

      const source = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');

      await sql.begin(async (tx) => {
        await tx.unsafe(source);
        await tx`
          INSERT INTO battleofbands.schema_migrations (name)
          VALUES (${name})
        `;
      });

      applied.push(name);
    }

    return { applied };
  } finally {
    await sql.end({ timeout: 2 });
  }
}

if (require.main === module) {
  runMigrations()
    .then(({ applied }) => {
      console.log(
        applied.length
          ? `[Migrate] Applied: ${applied.join(', ')}`
          : '[Migrate] Database already up to date.'
      );
    })
    .catch((error) => {
      console.error('[Migrate]', error);
      process.exitCode = 1;
    });
}

module.exports = { runMigrations };
