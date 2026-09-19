'use strict';

// Centralized runtime/environment contract. See AGENTS.md "Environment Contract"
// for the documented meaning of each variable. Do not read process.env directly
// elsewhere for these values — keep interpretation consistent in one place.

const DEV_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function parseAllowedOrigins(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Local Vite dev origins are always trusted so local development keeps working.
// ALLOWED_ORIGINS is the explicit, deterministic opt-in for any additional
// (e.g. cross-origin) production access. There is no wildcard fallback.
function getAllowedOrigins(env = process.env) {
  const configured = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  return Array.from(new Set([...DEV_ORIGINS, ...configured]));
}

function isProduction(env = process.env) {
  return env.NODE_ENV === 'production';
}

// Netlify Functions do not inherit netlify.toml's [build.environment] (that
// only applies to the build step), and do not reliably set NODE_ENV at
// runtime either. SITE_ID, however, is always present when code is running
// inside a Netlify site/function. Treat either signal as "this is a real
// deployed runtime that must have durable storage configured" — checking
// NODE_ENV alone would miss the actual Netlify Function target.
function isDeployedRuntime(env = process.env) {
  return isProduction(env) || Boolean(env.SITE_ID);
}

function getPort(env = process.env) {
  return env.PORT || 3001;
}

// DATABASE_SSL=false is the only opt-out; anything else (including unset)
// requires TLS, matching Supabase's pooled-connection requirements.
function resolveDatabaseSsl(env = process.env) {
  return env.DATABASE_SSL === 'false' ? false : 'require';
}

function getDatabaseUrl(env = process.env) {
  return env.DATABASE_URL;
}

// Administrative-only: schema migrations/seed. Never read by the
// request-serving runtime path. Falls back to DATABASE_URL when no
// separate migration connection is configured.
function getMigrationDatabaseUrl(env = process.env) {
  return env.DATABASE_MIGRATION_URL || env.DATABASE_URL;
}

// Fails safe: a deployed runtime must not silently fall back to a
// non-durable local SQLite file when DATABASE_URL is missing/misconfigured.
// Local development and tests may still omit it and use SQLite.
function resolveStoreProvider({ provider, connectionString, env = process.env } = {}) {
  if (provider) return provider;

  if (connectionString || getDatabaseUrl(env)) return 'postgres';

  if (isDeployedRuntime(env)) {
    throw new Error('DATABASE_URL is required in a deployed/production runtime.');
  }

  return 'sqlite';
}

module.exports = {
  DEV_ORIGINS,
  parseAllowedOrigins,
  getAllowedOrigins,
  isProduction,
  isDeployedRuntime,
  getPort,
  resolveDatabaseSsl,
  getDatabaseUrl,
  getMigrationDatabaseUrl,
  resolveStoreProvider,
};
