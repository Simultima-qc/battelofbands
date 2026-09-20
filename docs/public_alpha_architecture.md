# Public Alpha Architecture Decision

**Status:** Accepted and deployed for public alpha  
**Issue:** #22 — Public Alpha Foundation  
**Date:** 2026-09-19  
**Parent roadmap:** #17 — Public Alpha Roadmap  
**Deployment:** #31 — Neon + Netlify public alpha

## 1. Decision summary

Battle of Bands public alpha will use the smallest architecture that preserves the current product contract while making the application publicly reachable and its state durable:

- **Frontend:** React/Vite static build on Netlify.
- **API:** the existing Express application adapted to a **Netlify Function**, exposed behind the existing same-origin `/api/*` path.
- **Database:** **Neon hosted Postgres**.
- **Runtime DB access:** server-side SQL through a Postgres driver, using Neon's pooled Postgres endpoint for serverless traffic.
- **Authentication:** none for the public alpha.
- **Client API contract:** keep `/api` relative in production.
- **Secrets:** provider-managed environment variables; no secrets committed to the repository.
- **Production deployment:** one Netlify site, one Neon project.

This topology is now deployed for the public alpha. Local development still defaults to SQLite; production uses Netlify + Neon.

## 2. Why this topology

The current client already calls a relative API base:

```js
const BASE = '/api'
```

Local Vite development proxies `/api` to `http://localhost:3001`.

That means a same-origin production deployment is the lowest-friction path: Netlify can serve the Vite build and rewrite `/api/*` into one Express-backed Netlify Function. The client does not need to learn a separate production API host.

Netlify documents Express deployment through Netlify Functions using an Express adapter and a rewrite from `/api/*` to the function.

Supabase provides hosted Postgres and explicitly recommends its transaction-mode pooler for serverless/edge runtimes. The runtime DB client must be created at module scope, use a very small application-side pool, disable prepared statements when required by the driver/pooler combination, and require TLS.

Provider references checked for this decision:

- Netlify Express guide: https://docs.netlify.com/build/frameworks/framework-setup-guides/express/
- Netlify Functions configuration: https://docs.netlify.com/build/functions/configuration/
- Neon Postgres connection guide: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase pooling guide: https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits
- Supabase stale-connection troubleshooting: https://supabase.com/docs/guides/troubleshooting/troubleshooting-connect_timeout-or-hanging-queries-in-vercel-serverless-functions-775f92

## 3. Current repository map

### 3.1 Client

The browser application is React 18 + Vite.

Relevant current behavior:

- `client/src/api.js` uses a fixed relative base of `/api`.
- `client/vite.config.js` proxies local `/api` requests to `http://localhost:3001`.
- `client/src/App.jsx` restores the active tournament by anonymous browser session.
- the session identifier is browser-local and no account is required.
- `TournamentPage` loads tournament state after each vote.
- `RankingsPage` reads aggregate application rankings from the API.

**Public-alpha implication:** keep the browser API path same-origin. No `VITE_API_URL` is required for the selected topology unless a later architecture change separates the API host.

### 3.2 API

The backend is Node.js/CommonJS + Express.

`server/index.js` currently:

- creates the Express app through `createApp()`;
- initializes SQLite only when `startServer()` runs;
- listens on `process.env.PORT || 3001`;
- mounts:
  - `/api/artists`
  - `/api/tournament`
  - `/api/rankings`
  - `/api/health`;
- allows only localhost Vite origins through CORS.

**Public-alpha implication:** keep `createApp()` as the reusable application boundary. A Netlify Function should import/create the app instead of calling `listen()`.

### 3.3 Local persistence

`server/db/database.js` is tightly coupled to `better-sqlite3`:

- a process-global synchronous database handle;
- a writable file at `server/db/battleofbands.db` by default;
- optional override through `BATTLE_OF_BANDS_DB_PATH`;
- SQLite WAL mode;
- SQLite foreign-key pragma;
- schema creation at process startup;
- ad-hoc schema migration through `ALTER TABLE ...` wrapped in `try/catch`;
- synchronous `.prepare().get() / .all() / .run()`;
- synchronous `db.transaction(...)`.

This design **cannot be carried into a serverless deployment using a local database file**. The function filesystem is not the durable application database.

### 3.4 Schema and persisted state

Current tables:

#### artists

- `id` — text primary key
- `name`
- `country`
- `language`
- `genres` — JSON serialized into text
- `image_url`
- `mbid` — unique when present
- `popularity`

#### tournaments

- `id` — UUID generated in Node
- `user_session`
- `category_type`
- `category_value`
- `status` — `in_progress | completed`
- `created_at`
- `completed_at`
- `winner_id`

#### tournament_matches

- `id` — UUID generated in Node
- `tournament_id`
- `round`
- `match_index`
- `artist1_id`
- `artist2_id`
- `winner_id`
- `played_at`

#### rankings

- one row per artist;
- points;
- wins;
- finals;
- semis;
- quarters;
- tournaments_played.

### 3.5 Seed data

`server/db/seed.js` loads the checked-in `server/data/artists.json` catalog and upserts artists.

The seed also ensures a ranking row exists for each inserted artist.

**Public-alpha implication:** the hosted database must receive this same canonical artist dataset through a repeatable seed step. Seed execution is an administrative/migration concern, not something the public function should run on every cold start.

## 4. Product invariants that the migration must preserve

The architecture must not change the validated game:

- 16 artists;
- 15 decisions;
- 4 rounds;
- popularity-weighted random sampling without duplicate artist identities;
- no skip/tie in the current MVP contract;
- abandoned tournaments do not increment `tournaments_played`;
- ranking effects are applied only when the full tournament completes;
- personal tournament result remains distinct from aggregate application rankings;
- same-category replay remains available;
- anonymous browser session continuity remains available.

The unknown-vs-unknown product iteration observed in #16 is separate work and is not part of this architecture Issue.

## 5. Selected production topology

```text
Browser
  |
  | HTTPS same origin
  v
Netlify site
  |
  |-- Vite static client
  |
  |-- /api/* rewrite
          |
          v
     Netlify Function
     Express application
          |
          | TLS / pooled Postgres connection
          v
     Neon Postgres
```

### 5.1 Netlify

One Netlify site owns:

- frontend build;
- production URL;
- Netlify Function containing the Express API;
- `/api/*` rewrite to that function;
- runtime environment variables;
- function logs/basic error visibility.

The implementation slice should preserve local development separately:

- Vite remains on 5173;
- Express local server remains on 3001;
- Vite proxy remains useful;
- local CORS may continue allowing the local Vite origins.

### 5.2 Express function shape

The future implementation should introduce a small serverless entrypoint that:

1. initializes/reuses the Postgres data layer;
2. imports `createApp()`;
3. wraps the Express app using the Netlify-supported Express function pattern;
4. exports the function handler;
5. does **not** call `app.listen()`.

The ordinary `npm run dev` server can continue calling `startServer()` locally.

### 5.3 Same-origin API routing

Production should retain:

```text
https://<public-host>/api/...
```

rather than exposing a second public API hostname for the alpha.

Benefits:

- current client contract survives;
- no production client API environment variable is necessary;
- browser CORS disappears from the normal production request path;
- fewer deployment components;
- easier smoke testing;
- future domain/subdomain mapping can move the whole site together.

## 6. Database decision

### 6.1 Neon hosted Postgres

Neon Postgres is the selected durable store for the public alpha.

The application will continue to own its server-side API and business logic. The browser will **not** talk directly to Supabase for application data in this phase.

Reasons:

- minimal conceptual change to the existing API architecture;
- no need to introduce browser-side database credentials;
- no need to design RLS/auth before accounts have earned their place;
- current Express validation and tournament semantics stay centralized;
- durable shared state works across serverless invocations.

### 6.2 Runtime connection

The Netlify Function connects through the Neon pooled endpoint.

Runtime configuration should follow serverless-safe connection behavior:

- DB client created once at module scope;
- very small application-side pool (target: 1 connection per warm function instance unless evidence requires more);
- TLS required;
- prepared statements disabled if the selected driver/pooler combination requires it;
- stale-connection resilience for frozen/resumed serverless instances.

Supabase documents that persistent clients such as Postgres.js can retain a TCP socket that becomes stale while a serverless function is frozen. On resume, reusing that socket can produce `CONNECT_TIMEOUT` errors or requests that hang until the function limit.

The implementation must therefore include one bounded recovery strategy for transactional Postgres access, such as:

- a short liveness preflight (for example `SELECT 1` raced against a short timeout) with client recycle on failure; or
- narrowly scoped retry/reconnect handling for stale-socket / connection-timeout failures.

Do **not** add broad automatic retries around completed business transactions. Recovery must not create duplicate votes, rounds, tournament completion, or ranking effects. The exact mechanism belongs to Slice A/B and must preserve the idempotency/concurrency requirements in section 7.7.

### 6.3 SQL client

Preferred implementation choice: use a lightweight server-side Postgres driver such as `postgres` (Postgres.js), not `@supabase/supabase-js` for core database access.

Reason:

- the existing application already uses direct SQL;
- no Supabase Auth/Data API behavior is needed;
- transaction boundaries remain explicit;
- fewer application-layer semantics change at once.

This is an implementation preference, not a requirement to preserve a specific package forever.

## 7. SQLite → Postgres migration boundary

This is a real data-access migration, not a connection-string swap.

### 7.1 Async conversion

`better-sqlite3` is synchronous. Postgres access will be asynchronous.

The migration must therefore convert route/data-access operations from patterns such as:

- `.prepare(...).get()`
- `.prepare(...).all()`
- `.prepare(...).run()`
- `db.transaction(fn)`

to async Postgres equivalents.

Route handlers that perform DB work will become async.

### 7.2 Placeholder syntax

Current SQL uses SQLite placeholders:

- `?`
- `@name`

The Postgres implementation must use the selected driver's parameterization mechanism. Do not concatenate user-controlled values into SQL.

The existing dynamic ranking sort remains safe only because the sort column and order are allow-listed. Preserve that discipline.

### 7.3 SQLite-specific SQL

Known SQLite-specific constructs include:

- `INSERT OR IGNORE`;
- `INSERT ... ON CONFLICT(id) DO UPDATE` syntax whose exact Postgres form must be verified;
- SQLite pragmas;
- implicit SQLite typing behavior;
- current text-based JSON handling;
- WAL/local-file behavior.

Postgres equivalents must be explicit.

### 7.4 Genres representation

For the first migration, prefer **behavior preservation over schema beautification**.

A low-risk option is to keep `genres` semantically compatible with the current API and selection logic, even if a later cleanup converts it to native `jsonb`.

If the implementation chooses `jsonb` immediately, it must prove that:

- category matching remains case-insensitive and correct;
- API responses keep returning the same array shape;
- seed behavior is deterministic;
- no product behavior changes.

Do not combine an unnecessary catalog-model redesign with the hosting migration.

### 7.5 IDs

Tournament and match IDs are currently UUID strings generated by Node's `uuid` package.

The public-alpha migration may preserve application-generated UUIDs. Moving UUID generation into Postgres is not necessary for this phase.

Artist IDs must remain stable because the checked-in catalog, rankings, matches and tournament history reference them.

### 7.6 Timestamps

Postgres should use a durable timestamp representation, preferably `timestamptz`, while keeping the JSON API ISO-compatible.

Behavior to preserve:

- creation time;
- played time;
- completion time;
- ordering of active tournaments by creation time.

### 7.7 Transactions and concurrency

The following operations require real Postgres transaction boundaries:

#### Tournament creation

One transaction should:

- insert the tournament;
- ensure ranking rows;
- create all eight first-round matches.

A partial tournament must not be externally visible.

#### Vote / bracket advance

One transaction should:

- validate/lock the match/tournament state as needed;
- record the winner once;
- detect round completion safely;
- create the next round exactly once;
- or complete the tournament exactly once;
- apply aggregate rankings exactly once.

This matters more in a public/serverless environment because retries or concurrent requests are more plausible than in the current single-user local flow.

The migration should use conditional updates and/or row locking so duplicate vote requests cannot create duplicate next-round matches or apply completion/ranking effects twice.

#### Completion accounting

The invariant remains:

> abandoned tournaments do not count as played.

`tournaments_played`, match points and champion bonus must only be committed when the tournament becomes completed, and only once.

### 7.8 Schema migrations

The hosted schema must no longer be created opportunistically by application startup.

Introduce explicit SQL migrations in a repository path such as:

```text
server/db/migrations/
```

The first migration should create:

- tables;
- checks;
- foreign keys;
- indexes;
- uniqueness constraints.

Future schema changes must be new ordered migrations.

### 7.9 Seed process

Keep `server/data/artists.json` as the alpha catalog source of truth.

The future seed command should:

- be repeatable/idempotent;
- upsert stable artist IDs;
- update mutable catalog attributes such as popularity as intended;
- ensure ranking rows exist;
- run as an administrative step, not on every request/cold start.

## 8. Production configuration contract

No secret values belong in Git.

### Required runtime configuration

#### `DATABASE_URL`

Secret.

Purpose:

- runtime Postgres connection;
- points at the Neon pooled/serverless Postgres endpoint.

Stored in Netlify environment variables.

### Recommended administrative configuration

#### `DATABASE_MIGRATION_URL`

Secret, if the migration tooling needs a separate direct/session connection.

Purpose:

- schema migrations;
- seed/admin operations.

This value does not need to be exposed to the runtime function if deployment tooling can keep it separate.

### Optional/derived configuration

#### `NODE_ENV=production`

Standard runtime mode.

#### `ALLOWED_ORIGINS`

Only required if the API is intentionally reachable cross-origin.

For the selected same-origin production topology, normal browser traffic should not depend on CORS. Local development can retain explicit localhost origins.

### Not required for selected topology

#### `VITE_API_BASE`

Not required because production keeps `/api` same-origin.

Do not add a production frontend environment variable unless the API host is deliberately separated later.

## 9. CORS policy

Current CORS is localhost-only.

For the selected same-origin alpha:

- production client → production API does not require cross-origin access;
- local Vite → local Express still does;
- do not replace localhost CORS with `*`;
- if direct function/API cross-origin access becomes necessary, use an explicit allow-list from environment/config.

Credentials are not currently needed for authentication, because no accounts/cookies are part of the alpha contract.

## 10. Error visibility

Minimum alpha observability:

- Netlify Function logs for uncaught/request errors;
- existing Express error handler retained/adapted;
- `GET /api/health` remains available;
- database connection failures must produce a server error without leaking credentials or raw connection strings.

Do not introduce a full observability vendor before external alpha usage justifies it.

## 11. Rejected alternatives

### 11.1 SQLite inside Netlify Functions

**Rejected.**

Reason:

- local function filesystem is not the durable shared state required for tournaments/rankings;
- concurrency and multi-instance behavior would be unsafe;
- directly conflicts with #17.

### 11.2 Netlify frontend + separate persistent API host

Examples: a separate container/service host for Express.

**Viable but rejected for the first alpha.**

Reason:

- adds a second deployment/runtime to operate;
- requires public API URL configuration;
- introduces production CORS;
- increases cost/operational surface without a demonstrated need.

Reconsider if Netlify Function limits become a measured problem.

### 11.3 Browser directly to Supabase Data API

**Rejected for the first alpha.**

Reason:

- requires a larger client/data-access rewrite;
- requires RLS/security design now;
- duplicates or relocates Express business rules;
- gives no product benefit for the current anonymous alpha.

### 11.4 Supabase Edge Functions

**Rejected for the first alpha.**

Reason:

- changes runtime model away from the current Node/Express code;
- unnecessary rewrite for a small alpha.

### 11.5 New standalone domain as prerequisite

**Rejected as a deployment prerequisite.**

Follow #17: use the provider URL or an existing owned-domain/subdomain strategy first. Independent branding/domain can be reconsidered after external evidence.

## 12. Deployment validation contract

The eventual deployment is not considered usable until all of the following pass.

### Automated/local validation

- `cd server && npm test`
- `cd client && npm test`
- `cd client && npm run build`
- migration applies cleanly to an empty Postgres database;
- seed loads the canonical artist catalog;
- migration/seed can be re-run according to their documented idempotency rules.

### Production API validation

- `GET /api/health` returns success;
- categories load;
- eligible-category counts remain correct;
- a tournament starts with exactly 16 unique artists;
- weighted selection path remains in use;
- tournament can be re-fetched from another request/invocation;
- every vote persists;
- next rounds are generated exactly once;
- completed tournament persists;
- champion/finalist/Top 4/completed bracket remain correct;
- same-category replay works;
- rankings survive new function invocations;
- abandoned tournament does not increment tournaments played.

### Durability validation

A completed tournament and ranking result must still be present after:

- browser refresh;
- later API request;
- function cold start/new invocation;
- function freeze/resume or reuse of a warm instance after idle time, including recovery from a stale pooled TCP connection without hanging the request;
- redeploy of application code that does not intentionally reset the database.

### Concurrency/retry validation

At minimum, test that duplicate/retried match submissions cannot:

- record two winners;
- create duplicate next-round matches;
- complete a tournament twice;
- double-apply ranking points/tournaments played.

## 13. Ordered implementation slices

After this architecture PR is approved, Gate 2 of #17 should proceed in this order.

### Slice A — Hosted Postgres data layer

**Proposed issue title:**

> Public Alpha DB — migrate SQLite data access and schema to hosted Postgres

Scope:

- Postgres driver/data layer;
- explicit migrations;
- schema;
- seed;
- async route conversion required by DB access;
- transaction/concurrency correctness;
- automated tests against the Postgres data-access contract where practical;
- bounded stale-connection detection/recycle or retry behavior for the selected Postgres driver.

No Netlify provisioning required to complete the code slice.

### Slice B — Netlify serverless API adaptation

**Proposed issue title:**

> Public Alpha API — adapt Express to Netlify Functions

Scope:

- function entrypoint;
- Express serverless adapter;
- `/api/*` rewrite;
- runtime DB initialization;
- health route;
- serverless-safe error behavior;
- integration of the selected DB liveness/recovery path with the function lifecycle;
- local server remains usable.

Depends on Slice A.

### Slice C — Production client/config boundary

**Proposed issue title:**

> Public Alpha Config — production API routing, CORS, and environment contract

Scope:

- preserve same-origin `/api`;
- environment handling;
- local vs production CORS;
- Node/runtime configuration;
- no secrets committed;
- update repository operational metadata only when deployment facts become real.

Depends on A/B as appropriate.

### Slice D — Provision and deploy alpha

**Proposed issue title:**

> Public Alpha Deployment — provision Neon and Netlify and publish the first alpha

Scope:

- create/link Neon project;
- apply migrations;
- seed artists;
- configure secrets;
- create/link Netlify site;
- deploy;
- obtain stable alpha URL;
- basic function-log/error visibility.

Depends on A-C.

### Slice E — Production smoke and release validation

**Proposed issue title:**

> Public Alpha Release Gate — validate durable 16-artist flow in production

Scope:

- execute the validation contract in section 12;
- record evidence;
- validate persistence across requests/cold starts and warm-instance freeze/resume behavior;
- validate stale-connection recovery does not hang requests or duplicate transactional side effects;
- validate abandoned-completion semantics;
- validate replay/rankings;
- declare alpha ready for measurement/external testers or stop with defects.

Depends on D.

### What comes after Gate 2

Only after the deployed alpha is stable:

- #17 Gate 3 — URL/domain decision;
- #17 Gate 4 — GA4 measurement foundation;
- direct-link external playtest;
- then evaluate broader discovery/SEO/product iterations.

## 14. Repository truth after this decision

Until the deployment slices are actually completed:

- `AGENTS.md` remains correct when it says there is no active deployment;
- `.simultima/workflow.yml` remains correct when it records local SQLite/current reality;
- this document records **accepted intended architecture**, not deployed state.

Do not update operational metadata to claim Netlify/Supabase are active merely because this ADR is merged.

Once provisioning/deployment becomes real, update those current-state files in the same scoped implementation/release work that makes the facts true.

## 15. Definition of done for Issue #22

This architecture decision answers:

1. **Frontend:** Netlify static Vite build.
2. **API:** existing Express app adapted into a same-site Netlify Function.
3. **Durable data:** Neon hosted Postgres.
4. **Runtime DB connectivity:** serverless-safe pooled Postgres connection.
5. **Secrets:** Netlify/provider environment variables; none in Git.
6. **SQLite exit:** explicit async SQL/data-access migration with real Postgres transactions and migrations.
7. **Validation:** automated checks plus production durability/concurrency smoke.
8. **Next work:** five ordered implementation slices above.

No runtime code, cloud resource, credential, production URL, database migration or deployment is created by this decision itself.


## 16. Deployed public-alpha state — Issue #31

The public-alpha topology is now live:

- Netlify production site: `https://battle-of-bands-xjca.netlify.app`;
- Neon project: `lingering-hall-47497343`, branch `production`;
- migration `001_initial_postgres.sql` applied;
- canonical 726-artist catalog seeded;
- basic production smoke passed for `/`, `/api/health`, and `/api/artists/categories`.

This closes the provisioning/deployment slice. The full durable 16-artist production release gate remains a separate Slice E.
