# Telos

*Telos (τέλος): ultimate purpose or end goal.* An adaptive training app that
**programs** workouts around your goal instead of just logging them. Two users
with different goals get meaningfully different training — intensity,
frequency, volume, and structure all come from a goal-driven training profile
feeding a server-side adaptive engine.

Docs: [prompt.md](prompt.md) (scope/architecture) · [design.md](design.md) (visual system).

## Architecture

```
web/      React 19 + TS + Tailwind v4 PWA  (thin client, offline-first)
server/   Go API — ALL domain logic lives here (shared brain for V1 web + V2 Android)
          ├─ internal/domain/engine     adaptive engine (pure, unit-tested)
          ├─ internal/domain/profile    goal → training-profile data
          ├─ internal/domain/analytics  e1RM, trends (pure)
          ├─ internal/app               orchestration: plan materialization, sync, dashboard
          ├─ internal/store             Postgres (pgx) + embedded migrations
          ├─ internal/cache             Redis (optional — degrades to no-op)
          ├─ internal/auth              Firebase ID-token verification (+ fenced dev mode)
          └─ internal/seed              exercise library (80 exercises, validated at boot)
```

**Key decisions (rationale):**
- **All programming logic is server-side Go** behind `/api/v1` — the V2
  React Native client reuses it wholesale; V2 is a new front end, not a rewrite.
- **Engine is pure**: inputs (user, profile, program state, history, check-ins,
  today) → outputs (program state, planned week, notes). No clocks, no SQL,
  no HTTP. Deterministic by design, fully unit-tested.
- **Program state is one anchor date** (`started_at`); phase/week derive from
  `today − anchor`. An early deload just re-anchors — no counters to drift.
- **Offline sync = outbox + LWW.** Every client write (online or not) goes to
  an IndexedDB outbox and flushes to `POST /sync` as idempotent ops with
  client UUIDs and client timestamps. Conflict policy: last write wins per
  record on `updated_at`; client timestamps are capped at server time. After
  a flush that touches engine inputs, the server re-plans and the client
  refetches.
- **Loads are stored in kg only** (`load_kg`); the user's kg/lb preference is
  display-level. (Deviation from the brief's "load + unit per set" sketch —
  one canonical unit keeps aggregation and the engine unit-safe.)
- **Re-planning never clobbers the user:** workouts that are started,
  completed, skipped, or user-`edited` are never replaced by the engine.
- **Redis is an optimization, not a dependency** — `REDIS_ADDR=off` runs the
  whole stack straight off Postgres (used in local dev).

## Running locally

Prereqs: Node 20+ and Go 1.24+. **This machine has no virtualization
(WSL2/Docker unavailable), so the standard dev setup uses a user-level
Postgres and runs without Redis** — the cache layer degrades to a no-op by
design (`REDIS_ADDR=off`).

```powershell
# 1) Postgres (user-level Zonky binaries at %LOCALAPPDATA%\TelosPg, port 5433):
.\scripts\dev-db.ps1 start

# 2) API (real Firebase auth — the default):
cd server
$env:AUTH_MODE           = "firebase"
$env:FIREBASE_PROJECT_ID = "travel-2d1bd"
$env:REDIS_ADDR          = "off"
$env:DATABASE_URL        = "postgres://telos@localhost:5433/postgres?sslmode=disable"
go run ./cmd/api                      # :8080 — migrates + seeds on boot

# 3) Web (PWA dev server, proxies /api to :8080):
cd web
npm install
npm run dev                           # http://localhost:5173 — sign in with Google or email
```

**Auth modes.** Firebase auth needs no service-account key: ID-token
signatures verify against Google's public certs, so the server runs with just
the project ID (set `GOOGLE_APPLICATION_CREDENTIALS` only if you later need
Admin SDK user management). Google sign-in and email/password are both
enabled on the project. For tokenless local development, switch BOTH sides:
`VITE_AUTH_MODE=dev` in `web/.env` and `AUTH_MODE=insecure-dev` on the server
(refused when `TELOS_ENV=production`).

**With Docker** (e.g. on the deployment server): `docker compose up -d`
starts Postgres on :5433 and Redis on :6380; use
`DATABASE_URL=postgres://telos:telos_dev@localhost:5433/telos?sslmode=disable`
and drop `REDIS_ADDR=off`.

## Tests

```powershell
cd server
go test ./...        # engine: goal differentiation, autoregulation,
                     # deloads (scheduled/stall/recovery), volume bands,
                     # equipment selection, substitutes, determinism
cd ..\web
npm run build        # tsc -b + vite build + PWA assets
```

## API surface (v1)

All routes under `/api/v1`, `Authorization: Bearer <Firebase ID token>`
(dev mode: `Bearer dev:<uid>[:email]`).

| Route | Purpose |
|---|---|
| `GET/PUT /me` | training profile (onboarding & settings) — PUT re-plans on engine-relevant change |
| `GET /profiles` | the 4 goal profiles (goal cards) |
| `GET /exercises`, `GET /exercises/{id}` | library (Redis-cached) |
| `GET /exercises/{id}/substitute` | first substitute performable with the user's equipment |
| `GET /program` | active program + current week (lazy re-plan on week rollover) |
| `POST /program/regenerate` | explicit re-plan (preserves completed/edited) |
| `GET /workouts?from&to`, `GET /workouts/{id}` | history / detail |
| `POST /sync` | the offline write queue: batched idempotent LWW ops |
| `GET /dashboard` | recent workouts, weight trend (EMA), weekly volume, e1RM, recovery |
| `GET /me/bodyweight`, `GET /me/checkins` | raw logs |

## Localization (i18n)

UI language is a **client** concern: the server ships stable codes, never
display text — engine notes (`deload_recovery`…), per-exercise guidance
(`note_code`: `first_time`, `backoff`…), warmup move names, and generated
workout names are all translated client-side via i18next (namespaced JSON in
`web/src/i18n/locales/{en,nl}`). Language picker lives in Profile →
Preferences (device preference, `localStorage['telos-lang']`).

**Known localization debt:** exercise library content (names, form cues,
common mistakes) is English-only reference data for now — translating it is a
content effort (likely a `translations` jsonb column on `exercises` keyed by
locale) planned separately. Dutch (`nl`) screen translations were machine-
drafted and deserve a native read-through.

## Deployment notes

- API rate limiting is in-memory per-IP (15 rps, burst 40) — fine for the
  single-instance deployment; swap for a Redis-backed limiter behind the same
  middleware seam if Telos ever scales out.
- Re-planning updates planned workouts **in place**, so workout IDs stay
  stable across engine runs; only the exercise rows within them rotate.
- Every generated session includes a **dynamic warmup** (jsonb on `workouts`,
  engine-generated, read-only for clients) matched to the day's movement
  patterns.
- Users may override the split style (Profile → Workout split): full-body,
  upper/lower, push/pull/legs, or **muscle-group pairs** (chest+triceps,
  back+biceps…) — applied when compatible with their weekly frequency,
  otherwise the goal profile's default quietly wins.
- The daily-energy estimate may sit slightly below maintenance (small
  deficits allowed per owner decision; adjustment clamped to −15%…+25%).

## V2 (Android) notes

- The token set in `web/src/globals.css` is Material-3 tonal and ports to
  React Native directly; only platform primitives change.
- Health Connect lands in V2 against the same API; nothing in the schema
  assumes manual entry is the only writer (entries carry client UUIDs and
  timestamps already).
- Camera form-check (§12) stays exploratory; nothing blocks a later
  on-device pose module.
