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

function getPort(env = process.env) {
  return env.PORT || 3001;
}

// DATABASE_SSL=false is the only opt-out; anything else (including unset)
// requires TLS, matching Supabase's pooled-connection requirements.
function resolveDatabaseSsl(env = process.env) {
  return env.DATABASE_SSL === 'false' ? false : 'require';
}

module.exports = {
  DEV_ORIGINS,
  parseAllowedOrigins,
  getAllowedOrigins,
  isProduction,
  getPort,
  resolveDatabaseSsl,
};
