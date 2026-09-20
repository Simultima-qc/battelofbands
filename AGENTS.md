# AGENTS.md — Battle of Bands

**Authority:** This is the authoritative source for Battle of Bands project-specific execution rules and verified operational facts.

**Cross-project policy:** All workflow, merge strategy, validation, release and security policy not explicitly documented here defers to [`Simultima-qc/AI-Development-Playbook`](https://github.com/Simultima-qc/AI-Development-Playbook). Do not duplicate Playbook policy into this file.

---

## Product Invariants

Agents must preserve these invariants unless an Issue explicitly authorizes a change:

- **MVP tournament size:** 16 artists
- **MVP decisions per tournament:** 15 forced choices
- **MVP tournament structure:** 4 rounds (Round of 16 → Quarterfinals → Semifinals → Final)
- **Artist selection:** popularity-weighted random sampling without duplicate identities
- **Abandoned tournament accounting:** abandoned tournaments do not count as completed/played
- **Result semantics:** personal result (one player's tournament) remains distinct from aggregate app rankings (accumulated application-wide outcomes)

**Reference:** [Core Game Loop — MVP Contract](docs/core_game_loop.md)

---

## Repository Topology

- **Default branch:** `main`
- **Production branch:** `main`
- **Integration branch:** none (direct PRs to main)
- **Delivery mode:** DIRECT (PR → review → merge to main)
- **Active deployment:** Netlify production at `https://battle-of-bands-xjca.netlify.app`; production data is Neon Postgres; local development still defaults to SQLite

---

## Architecture

### Application Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend:** React 18 + Vite + React Router
- **Persistence:** adapter-backed persistence; local development defaults to SQLite, production uses Neon hosted Postgres through `DATABASE_URL`
- **Postgres migrations:** versioned SQL under `server/db/migrations/`; application routes must remain database-agnostic
- **Netlify:** active production site serving the Vite client and Express API through a Netlify Function

### Directory Structure

```
server/
  ├── index.js           # Local Express server + reusable createApp() boundary
  ├── runtime.js         # Single-flight serverless store initialization
  ├── netlify/functions/ # Netlify Function adapter (code-only until provisioning)
  ├── db/
  │   ├── schema.js      # Schema definition
  │   └── seed.js        # 726-artist dataset loader
  ├── routes/            # API endpoints
  │   ├── artists.js
  │   ├── tournament.js
  │   └── rankings.js
  └── tests/             # Backend tests (Node.js native)

client/
  ├── src/
  │   ├── pages/         # HomePage, TournamentPage, RankingsPage
  │   ├── components/    # Header, MatchView, Bracket, WinnerScreen
  │   ├── App.jsx
  │   └── index.css
  ├── index.html
  └── tests/             # Client tests (Node.js native)
```

---

## Canonical Commands

### Development

```bash
# Backend: Install, seed database, start server
cd server
npm install
npm run seed        # Populate 726 artists into local SQLite
npm run dev         # Start on http://localhost:3000 (nodemon auto-reload)

# Frontend: Install, start dev server
cd client
npm install
npm run dev         # Start on http://localhost:5173 (Vite)
```

### Testing

```bash
cd server && npm test    # Backend unit tests (Node.js native)
cd client && npm test    # Client unit tests (Node.js native)
```

### Build

```bash
cd client && npm run build    # Production bundle to dist/
```

### Validation

Postgres schema changes use versioned SQL migrations under `server/db/migrations/`.

```bash
cd server
DATABASE_MIGRATION_URL=<disposable-or-admin-postgres-url> npm run migrate
```

Local development may continue to use SQLite without cloud credentials. The server CI validates the Postgres contract against an ephemeral Postgres service.

---

## API Contract

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/artists/categories` | List all available categories (genre, country, language) |
| GET | `/api/artists/random?category_type=<type>&category_value=<value>` | Popularity-weighted sample of eligible artists (32 by default; not tournament-size binding) |
| POST | `/api/tournament/start` | Create MVP tournament: 16 artists / 15 decisions / 4 rounds |
| POST | `/api/tournament/:id/match` | Record one match vote and advance tournament state |
| GET | `/api/tournament/:id` | Fetch tournament state (bracket, completed rounds, current match) |
| GET | `/api/rankings` | Aggregate app rankings (artist win rates across all completed tournaments) |

**Note:** `/api/artists/random` is a utility endpoint for sampling and does not define tournament size. Tournament size is fixed by `/api/tournament/start`.

---

## CI/CD

### Current CI Workflows

Two separate workflows run on PR and push:

- **server-tests.yml:** runs `cd server && npm test` on server changes
- **client-tests.yml:** runs `cd client && npm test` and `cd client && npm run build` on client changes

### Workflow Facts

- Both workflows target **Node.js 22**
- Both use **npm ci** (clean install from package-lock.json)
- No integration tests or end-to-end testing in CI
- Production deployment is currently manual through Netlify CLI; there is no automatic Git-to-Netlify production pipeline yet
- PR checks run on all PRs; branch-specific push triggers exist for feature branches

---

## Environment Contract

Interpretation of these variables is centralized in `server/config.js`; do not read `process.env` directly for them elsewhere. Production is active on Netlify and connects server-side to Neon Postgres.

**Client:** the production browser build calls the relative path `/api` (see `client/src/api.js`). There is no `VITE_API_URL`/`VITE_API_BASE`. Local Vite dev proxies `/api` to `http://localhost:3001` (see `client/vite.config.js`) and this must keep working unmodified.

### Required at production runtime

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Secret. Neon pooled/serverless Postgres connection string used by the Netlify Function. |

`server/config.js`'s `resolveStoreProvider()` fails safe: it throws instead of falling back to SQLite whenever `DATABASE_URL` is missing in a **deployed runtime**. A deployed runtime is detected as `NODE_ENV=production` **or** `SITE_ID` present — `SITE_ID` is used because Netlify Functions do not inherit `netlify.toml`'s `[build.environment]` (build-time only) and do not reliably set `NODE_ENV` at runtime, but always expose `SITE_ID`. Local development and tests (neither signal present) still fall back to SQLite.

### Optional runtime

| Variable | Purpose |
|----------|---------|
| `NODE_ENV=production` | Standard runtime mode flag. |
| `DATABASE_SSL` | Set to `false` to disable TLS; any other value (including unset) requires TLS. |
| `ALLOWED_ORIGINS` | Comma-separated explicit CORS allow-list for cross-origin API access. Only needed if the API must be reachable from an origin other than the same-origin production site. Local Vite dev origins (`http://localhost:5173`, `http://127.0.0.1:5173`) are always trusted regardless of this variable. |

### Administrative only

| Variable | Purpose |
|----------|---------|
| `DATABASE_MIGRATION_URL` | Secret. Used by `npm run migrate` / seed tooling only. Falls back to `DATABASE_URL` if unset. Must never be read by the request-serving runtime path. |

**Never commit real values for any secret variable above.**

### CORS policy

- No wildcard (`*`) origin in any environment.
- Local Vite dev origins are always accepted.
- Any additional origin must be explicitly listed in `ALLOWED_ORIGINS`; there is no implicit trust of arbitrary request origins.
- The selected production topology is same-origin (`/api/*` on the same Netlify site as the client), so production browser traffic does not depend on CORS at all.

### Error responses

The global Express error handler (`server/index.js`) only forwards `err.message` to the client when the error is an `HttpError` (`server/lib/http.js`) — i.e. a deliberately raised, API-safe message. Any other error (driver failures, unexpected exceptions) returns a generic `"Internal server error."` so connection strings or internals can never leak into a response.

---

## Data & Categories

**Artist dataset:** 726 pre-seeded artists (rock, pop, metal, hip-hop, jazz, country, electronic, etc.)

**Eligible category dimensions:** genre, country, language

**Eligibility rule:** A category value must have ≥16 unique eligible artists to appear in MVP tournament selection. Values with <16 artists must not be surfaced as normal options.

---

## Implementation Constraints

- Do not change the MVP game loop (16/15/4, forced choices, no skips, no ties, immediate advancement).
- Do not change ranking semantics (personal result ≠ aggregate ranking).
- Do not change completion accounting (abandoned tournaments do not count).
- Do not introduce hidden deployment/environment facts (if a deployment provider is chosen later, it becomes a new Issue).
- Do not add authentication, accounts, analytics, multiplayer, or monetization to the MVP.
- Do not provision or switch a deployed database/environment without an explicit Issue. Issue #25 authorizes the code-level Postgres data-layer migration only; cloud provisioning remains separate.

---

## Secrets & Security

- **No secrets in this repository.** All configuration is local and non-sensitive.
- CI workflows do not access external services or credentials.
- No cloud database credentials exist in the repository. Local SQLite requires none; Postgres credentials are supplied only through environment variables.
- Future database or deployment secrets must be added through [Playbook-defined secret management](https://github.com/Simultima-qc/AI-Development-Playbook), not hardcoded into files.

---

## Playbook Deference

For all topics not covered above, refer to:

**[Simultima-qc/AI-Development-Playbook](https://github.com/Simultima-qc/AI-Development-Playbook)**

including:

- merge strategy and commit message conventions;
- PR/Issue labeling and workflow;
- code review standards;
- release process and versioning;
- security incident response;
- change tracking and validation evidence.

---

## Document Versions

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | 2026-09-19 | Claude Haiku 4.5 | Initial repository workflow adoption (Issue #18) |
| 1.1 | 2026-09-19 | ChatGPT | Document adapter-backed SQLite/Postgres persistence and versioned migrations (Issue #25) |
| 1.2 | 2026-09-19 | ChatGPT | Record code-level Netlify Function adapter with no active deployment (Issue #27) |
| 1.3 | 2026-09-19 | Claude Sonnet 5 | Document explicit runtime environment contract, allow-listed CORS, and safe error responses; no deployment provisioned (Issue #29) |


## Deployment Status — Issue #31

- Public alpha is live on Netlify at `https://battle-of-bands-xjca.netlify.app`.
- Production persistence is Neon hosted Postgres, project `lingering-hall-47497343`, branch `production`.
- Migration `001_initial_postgres.sql` is applied and the canonical 726-artist catalog is seeded.
- Basic production smoke is green for `/`, `/api/health`, and `/api/artists/categories`.
- Full durable tournament/retry/cold-start validation remains Slice E work.
