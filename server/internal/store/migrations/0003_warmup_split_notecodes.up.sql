-- Split preference: user may override the profile's split style when it's
-- compatible with their training frequency (NULL = automatic).
ALTER TABLE users
    ADD COLUMN split_preference text
    CHECK (split_preference IN ('full_body', 'upper_lower', 'push_pull_legs', 'body_part'));

-- Engine-generated dynamic warmup per session (jsonb array of moves).
ALTER TABLE workouts
    ADD COLUMN warmup jsonb NOT NULL DEFAULT '[]';

-- Engine guidance as a CODE the client localizes ("first_time", "backoff"…)
-- instead of stored English. notes stays for free-text.
ALTER TABLE workout_exercises
    ADD COLUMN note_code text NOT NULL DEFAULT '';
