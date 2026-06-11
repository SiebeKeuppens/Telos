# Build Brief — Adaptive Training App: **Telos**

> *Telos (τέλος): ultimate purpose or end goal.* The name is the thesis — the app exists to serve each user's actual goal, not just count reps.

> **Read first:** A separate `design.md` defines the visual design system, components, and frontend direction — treat it as the source of truth for anything UI/visual. This document (`prompt.md`) is the source of truth for scope, architecture, and behavior. If the two conflict, flag it rather than guessing.

---

## 1. Mission

Build a fitness app that doesn't just **log** workouts — it **programs** them around the user's specific goal. Two users with different goals (staying fit vs. bodybuilding) should get meaningfully different training in intensity, frequency, volume, and structure. The core differentiator is an adaptive engine that generates each session from real strength-and-conditioning principles, tailored to the user's goal, and adjusts based on how they're actually performing and recovering.

This is a long-horizon, end-to-end build. Own the architecture and the hard domain logic yourself; delegate scoped, parallelizable work (see §10). Apply your full capability to the goal system and adaptive engine — those are the parts worth getting right.

---

## 2. Scope: V1 (now) & V2 (later)

**V1 — Web app, installable as a PWA on mobile.**
- Responsive, mobile-first web app the user can add to their home screen and use like a native app (offline-capable, installable).
- **No automatic health-data integration in V1.** Health Connect is Android-native (can't run on web), and the Google Fit REST API is deprecated, so **V1 is fully manual: the user enters everything, and manual logging is the system of record.** Dashboards and the engine run entirely off logged + manually entered data. No device/health-platform sync of any kind until V2.

**V2 — Android (React Native), later.**
- Migrate the app to native Android and add full **Health Connect** device sync (steps, heart rate, sleep, sessions, weight, written directly from the phone/watch).
- This migration is deliberate and is expected to go smoothly **because of how V1 is architected** (see §3). Treat the clean web→native port as part of the value, not an afterthought.

> **Architecture mandate for a smooth V2:** The **Go backend (API + Postgres + Redis) is the shared brain** across both clients. Keep all domain logic — goal/training profiles, the adaptive engine, every programming calculation — **server-side in Go**, behind a clean JSON API. V1 (web PWA) and V2 (Android) are both thin clients against that same API, so V2 is a new native front end, not a logic rewrite. Each client keeps a local cache + sync layer (see §3) so it works offline.

---

## 3. Tech Stack (decided)

- **Frontend:** **React + TypeScript** (e.g., Vite), built as an installable **PWA** — service worker for offline, web app manifest, mobile-first responsive design. Styling per `design.md`: **Tailwind v4 (CSS-first) + shadcn/Radix**, token-driven. (React chosen partly so the V2 React Native migration shares mental model and core logic.)
- **Backend:** **Go** — a JSON/HTTP API server (pick an idiomatic, simple router/framework). It houses the adaptive engine and all domain logic (§5).
- **Database:** **PostgreSQL** — the system of record. Use schema migrations from day one.
- **Cache:** **Redis** — exercise-library reads, computed dashboard aggregates, current-program snapshots, and other hot reads; also available for rate limiting / sessions if useful. Invalidate on write.
- **Auth:** **Firebase Authentication** (Google sign-in + email/password, client-side). The Go backend verifies Firebase ID tokens on every request (Firebase Admin SDK for Go). Firestore is **not** used as a datastore — Postgres replaces it entirely; only Firebase Auth remains.
- **Offline-first (client):** without Firestore's built-in sync, the web client keeps a local cache (IndexedDB) of the current program/planned sessions plus a **write queue** for sets, bodyweight, and check-ins logged offline. On reconnect it flushes to the Go API, which persists to Postgres and re-runs the engine, then the client re-fetches. Build this sync layer deliberately — it's what Firestore used to give for free.
- **Health data (V1):** manual entry only — no health-platform integration. **Health Connect arrives in V2** with the Android migration.

> **Verify, don't assume:** confirm current versions/APIs for the Go ecosystem (HTTP router, Postgres driver + migration tool, Redis client, Firebase Admin SDK for Go), the Firebase Auth client SDK, and PWA/service-worker best practices before building. Don't trust details from memory — check current docs.

---

## 4. Goals & Training Profiles (first-class, drives everything)

The user's goal is a primary input, captured at onboarding and editable later. Each goal maps to a **training profile** that sets the engine's parameters. Build these as structured, data-driven profiles — not hardcoded branches.

Core goals (extensible — design so more can be added):

| Goal | Intensity | Frequency | Rep ranges | Volume | Rest | Structure |
|---|---|---|---|---|---|---|
| **Stay Fit / General Fitness** | Moderate | 2–4 days/wk | ~8–15 | Low–moderate | Short–moderate | Full-body, consistency-first |
| **Build Muscle (Hypertrophy)** | Moderate–high | 3–5 days/wk | ~6–15 | Moderate–high | Moderate | Upper/lower or full-body, progressive volume |
| **Strength** | High (heavy loads) | 3–4 days/wk | ~1–6 | Lower | Long | Compound-focused |
| **Bodybuilding** | High volume | 4–6 days/wk | ~6–20 (+ intensity techniques) | High | Moderate | Body-part split, weak-point/symmetry focus |

Each profile defines: target intensity (load %/RPE), weekly frequency, rep-range bands, per-muscle volume targets, rest guidance, preferred split style, and how periodization/autoregulation parameters shift (§5). The engine consumes the profile; it must not bake goal assumptions into its logic directly.

> The values above are sensible starting points, not gospel — implement them as tunable profile data so they can be refined.

---

## 5. Adaptive Training Engine (the hard part — own this)

Clean, well-tested module in the **Go backend** (server-side — see §3), decoupled from HTTP/DB specifics. It takes the user's **training profile (§4)** + history + recovery signals and produces the program and each next session. Clients fetch and cache the result; the engine re-runs server-side after each sync.

**Program structure by experience level:**
- **Beginner:** linear progression — add load when target reps are hit across all working sets.
- **Intermediate:** undulating or simple block periodization; progress weekly volume within the profile's bounds.
- **Advanced:** block periodization (accumulation → intensification → deload).

**Autoregulation (per session, from logged data + RPE/RIR):**
- All targets hit at low RPE → progress load/volume.
- Targets met at high RPE → hold and adapt.
- Missed reps or sustained high RPE → reduce; consider early deload.

**Deload logic:** scheduled (~every 4–6 weeks per the profile) **or** triggered early by stalls, accumulated fatigue, or sustained poor recovery signals (mood/sleep check-ins, §6).

**Balanced programming:** keep weekly sets per muscle group within the profile's ranges (MEV–MAV as guidance, not dogma); balance movement patterns (push/pull, squat/hinge).

> **Guardrail:** bias toward sustainable progression and adequate recovery. Recovery signals must be able to make the program *easier*, not only harder. Never push through pain or clear overreaching.

---

## 6. Exercise Library (rich, instructional)

A shared, structured library. Every exercise includes:

- Name, equipment, movement pattern, primary & secondary muscles.
- **Proper-form instructions:** clear step-by-step cues for clean, safe execution.
- **Common mistakes / form faults** to watch for and correct.
- **Substitute / regression:** an easier or alternative exercise for users who can't perform it yet (lacking strength, mobility, or equipment) — so nobody hits a dead end.
- *(Optional)* a progression (harder variant) for symmetry.

The engine selects exercises filtered by the user's available equipment and goal profile, and surfaces substitutes inline wherever an exercise is shown. Generated workouts are always a starting point the user can freely edit (swap/add/remove, change sets/reps).

---

## 7. Data Model (sketch — refine as needed)

**PostgreSQL** is the system of record (relational schema, with migrations). Sketch — refine as needed:
- `users` — Firebase UID as primary key; goal + training profile, equipment, schedule, experience level, limitations, unit preference (kg/lb).
- `programs` — `user_id` FK; periodization state, current block/week, timestamps.
- `workouts` — `user_id` FK, `program_id` FK; status, scheduled/completed timestamps.
- `workout_exercises` — `workout_id` FK, `exercise_id` FK; order, target sets/reps.
- `sets` — `workout_exercise_id` FK; set number, load + unit, reps, RPE, completed flag.
- `bodyweight_entries` — `user_id` FK; date, weight + unit. (Trend is computed in the Go layer, not stored.)
- `checkins` — `user_id` FK; date, energy, stress, sleep, motivation, soreness.
- `exercises` — fields per §6 (form cues, common mistakes, `substitute_id` self-FK, optional `progression_id`). Reference data, seeded; read-mostly.

Use foreign keys and index hot paths (`user_id`, dates). Keep all derived/computed logic (trends, 1RM estimates, volume aggregates, the engine) in the Go domain layer, not in SQL.

- **Redis** caches read-heavy/derived data: the exercise library, dashboard aggregates, and current-program snapshots. Invalidate on the relevant writes.
- **Client (IndexedDB)** caches the current program/planned sessions and queues offline writes for sync (see §3) — distinct from the server cache.

---

## 8. Frontend (web / PWA)

- Implement strictly against **`design.md`**. Build the design system / shared components first so screens stay coherent.
- Installable PWA: manifest, service worker, offline support, mobile-first responsive layout.
- Screens (min): onboarding (incl. **goal selection**), today's workout (+ active logging), program overview, generator/editor, exercise detail (form cues, mistakes, substitute), bodyweight, daily check-in, dashboards (recent workouts, weight trend, mood/recovery trends, volume & estimated-1RM progression), settings.
- Offline-first UX with clear sync state.

---

## 9. Quality Bar

- Adaptive engine and data transforms are **unit-tested** with realistic scenarios per goal profile (progression, stall, deload trigger, equipment/goal-based selection, substitute fallback).
- Graceful handling of: offline mode and **sync reconnection/conflict resolution** (define a clear policy, e.g. last-write-wins per record), empty states (new user), and partial/aborted workouts.
- Production-quality, modular code: typed TypeScript on the client, idiomatic Go on the server. The Go engine/domain layer is decoupled from HTTP and DB specifics and fully unit-tested. No dead scaffolding.

---

## 10. Orchestration & Subagent Strategy (cost-aware)

Act as the **orchestrator**. Keep high-judgment work yourself; delegate scoped, parallelizable work to cheaper models.

**You (Claude Fable 5 — `claude-fable-5`) own:** architecture, the Postgres schema + migrations, the Redis caching strategy, Firebase Auth token verification, goal/training profiles, the server-side adaptive engine, the API contract, the client sync layer, cross-cutting decisions, and final integration/review.

**Delegate to Claude Sonnet 4.6 (`claude-sonnet-4-6`):** implementing screens/components against `design.md` once the design system exists (parallelize); well-scoped Go HTTP handlers/CRUD against a defined API contract; test writing; assembling exercise-library content (form cues, mistakes, substitutes — review for accuracy); docs; well-specified utilities.

**Delegate to Claude Haiku 4.5 (`claude-haiku-4-5-20251001`):** tiny, cheap tasks — lookups, simple transforms, formatting, repetitive boilerplate.

**Rules:** give subagents tight specs with acceptance criteria; review before integrating; never delegate work where whole-app coherence matters (core/engine/schema/design system). Prefer the cheapest model that clears the bar; batch related work. Don't hand off the whole frontend before the design system exists.

---

## 11. Build Order (phased — ship each as a working increment)

1. **Foundation** — **Go API scaffold + Postgres schema/migrations + Redis + Firebase Auth token verification**; Vite/React PWA shell (manifest + service worker), navigation, design system from `design.md`; and the **client API + offline cache/sync layer** scaffold.
2. **Goals & profiles** — goal selection in onboarding; training-profile data + plumbing into the core.
3. **Tracking core** — workout logging, bodyweight, mood check-ins, data model wired up.
4. **Exercise library** — schema + content (form, mistakes, substitutes); exercise-detail UI.
5. **Adaptive engine (Go)** — goal-driven generation, autoregulation, deload; fully unit-tested.
6. **Generator + editing** — equipment/goal-based generation with full edit + inline substitutes.
7. **Dashboards & analytics** — server-side aggregates (cached in Redis) surfaced through the charts defined in `design.md`.
8. **Polish** — edge cases, empty/error states, tests, performance, PWA install/offline QA.

---

## 12. Stretch / Future Exploration (NOT V1 scope)

- **V2 — Android migration + Health Connect** (see §2): native React Native build, full device sync. Architected for from day one.
- **Camera form-check (exploratory):** record a set, run pose estimation, and give corrective form feedback *afterward* (not live coaching). Likely on-device pose estimation (e.g., a browser pose model in V1, native later). Caveats to respect: it's a coaching aid, **not** medical or injury-prevention advice; process video **on-device** for privacy; be honest about accuracy limits; never gate a workout on it. Treat as a prototype/spike before committing — flag feasibility findings rather than over-promising.

Do not build §12 items in V1. Note them so architecture leaves room (e.g., don't make assumptions that would block a later pose-analysis module or the native port).

---

## 13. Tone & Wellbeing Guardrails

This app touches bodyweight, mood, and training intensity — build for healthy, sustainable habits:
- Encourage progressive, recoverable training, not extremes.
- Frame bodyweight as a neutral trend, not a target to minimize; no calorie/diet prescriptions. *(Amended by owner 2026-06-11: an informational daily-energy estimate is in scope, and small calorie deficits — clamped to −15% — are permitted; extremes remain out.)*
- Mood check-ins are supportive and informational, never diagnostic.
- Recovery signals can ease the program, not only intensify it.
- Form guidance and substitutes exist to keep people safe and included — prioritize clean execution over load.

---

## 14. Notes for the Build

- Confirm current library/SDK/API details before coding (§3).
- Keep all domain logic server-side in Go behind a clean API — both the web and (V2) Android clients share it, which is the key to a clean V2 (§2).
- Flag any scope/design conflicts between this file and `design.md` rather than resolving silently.
- Leave a short rationale comment on non-obvious architectural decisions.
