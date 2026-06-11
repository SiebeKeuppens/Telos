-- Telos initial schema.
-- Conventions:
--  * Loads are stored canonically in kg (numeric); the client converts to the
--    user's display unit. Storing one unit keeps aggregation and the engine
--    unit-safe; the brief's "load + unit" sketch is realized as load_kg + the
--    user-level unit preference.
--  * Client-creatable rows (workouts, workout_exercises, sets, bodyweight,
--    checkins) use client-generated UUIDs so offline writes are idempotent.
--  * updated_at is set by the application and doubles as the last-write-wins
--    timestamp for sync conflict resolution.

CREATE TABLE users (
    uid           text PRIMARY KEY,            -- Firebase UID
    email         text NOT NULL DEFAULT '',
    display_name  text NOT NULL DEFAULT '',
    goal          text NOT NULL DEFAULT 'stay_fit',
    experience    text NOT NULL DEFAULT 'beginner',
    days_per_week int  NOT NULL DEFAULT 3,
    equipment     text[] NOT NULL DEFAULT '{}',
    limitations   text NOT NULL DEFAULT '',
    unit          text NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg','lb')),
    onboarded_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exercises (
    id                text PRIMARY KEY,        -- stable slug, e.g. 'barbell-back-squat'
    name              text NOT NULL,
    equipment         text[] NOT NULL DEFAULT '{}',
    pattern           text NOT NULL,
    primary_muscles   text[] NOT NULL DEFAULT '{}',
    secondary_muscles text[] NOT NULL DEFAULT '{}',
    is_compound       boolean NOT NULL DEFAULT false,
    form_cues         jsonb NOT NULL DEFAULT '[]',
    common_mistakes   jsonb NOT NULL DEFAULT '[]',
    substitute_id     text REFERENCES exercises(id),
    progression_id    text REFERENCES exercises(id)
);

CREATE TABLE programs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    goal            text NOT NULL,
    split           text NOT NULL,
    days_per_week   int  NOT NULL,
    phase           text NOT NULL,
    week_in_phase   int  NOT NULL DEFAULT 1,
    mesocycle_week  int  NOT NULL DEFAULT 1,
    started_at      date NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_programs_user_active ON programs (user_id) WHERE status = 'active';

CREATE TABLE workouts (
    id            uuid PRIMARY KEY,
    user_id       text NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    program_id    uuid REFERENCES programs(id) ON DELETE SET NULL,
    name          text NOT NULL DEFAULT '',
    day_index     int  NOT NULL DEFAULT 0,
    status        text NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','in_progress','completed','skipped','aborted')),
    scheduled_for date,
    started_at    timestamptz,
    completed_at  timestamptz,
    notes         text NOT NULL DEFAULT '',
    -- Set once the user edits a planned workout; the engine's re-planning
    -- never replaces edited (or started/completed) workouts.
    edited        boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workouts_user_sched ON workouts (user_id, scheduled_for);
CREATE INDEX idx_workouts_user_status ON workouts (user_id, status);

CREATE TABLE workout_exercises (
    id              uuid PRIMARY KEY,
    workout_id      uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id     text NOT NULL REFERENCES exercises(id),
    position        int  NOT NULL DEFAULT 0,
    target_sets     int  NOT NULL DEFAULT 3,
    target_reps_min int  NOT NULL DEFAULT 8,
    target_reps_max int  NOT NULL DEFAULT 12,
    target_rpe      numeric(3,1),
    target_load_kg  numeric(6,2),
    rest_seconds    int  NOT NULL DEFAULT 90,
    notes           text NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workout_exercises_workout ON workout_exercises (workout_id, position);

CREATE TABLE sets (
    id                  uuid PRIMARY KEY,
    workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
    set_number          int  NOT NULL DEFAULT 1,
    load_kg             numeric(6,2) NOT NULL DEFAULT 0,
    reps                int  NOT NULL DEFAULT 0,
    rpe                 numeric(3,1),
    completed           boolean NOT NULL DEFAULT true,
    logged_at           timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sets_workout_exercise ON sets (workout_exercise_id, set_number);

CREATE TABLE bodyweight_entries (
    id         uuid PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    date       date NOT NULL,
    weight_kg  numeric(5,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, date)
);
CREATE INDEX idx_bodyweight_user_date ON bodyweight_entries (user_id, date DESC);

CREATE TABLE checkins (
    id         uuid PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    date       date NOT NULL,
    energy     int NOT NULL CHECK (energy BETWEEN 1 AND 5),
    stress     int NOT NULL CHECK (stress BETWEEN 1 AND 5),
    sleep      int NOT NULL CHECK (sleep BETWEEN 1 AND 5),
    motivation int NOT NULL CHECK (motivation BETWEEN 1 AND 5),
    soreness   int NOT NULL CHECK (soreness BETWEEN 1 AND 5),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, date)
);
CREATE INDEX idx_checkins_user_date ON checkins (user_id, date DESC);
