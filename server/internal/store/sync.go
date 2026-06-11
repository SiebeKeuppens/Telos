package store

import (
	"context"
	"fmt"
	"time"

	"telos/server/internal/domain"
)

// Sync upserts: applied from the client's offline write queue. All of them
// are idempotent (client-generated UUIDs) and last-write-wins (the update
// only applies when the incoming write is not older than the stored row).
// Ownership is always derived from the authenticated UID — never the payload.

// UpsertWorkoutSync creates or updates a workout from a client op.
func (s *Store) UpsertWorkoutSync(ctx context.Context, uid string, w domain.Workout, writeTime time.Time) error {
	var scheduled *time.Time
	if w.ScheduledFor != nil {
		t := w.ScheduledFor.Time()
		scheduled = &t
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO workouts (id, user_id, program_id, name, day_index, status,
			scheduled_for, started_at, completed_at, notes, edited, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name, status = EXCLUDED.status,
			-- COALESCE: an op that omits a timestamp must not erase it (a
			-- status-only update would otherwise orphan the workout from its
			-- week and the planner would duplicate the day).
			scheduled_for = COALESCE(EXCLUDED.scheduled_for, workouts.scheduled_for),
			started_at    = COALESCE(EXCLUDED.started_at, workouts.started_at),
			completed_at  = COALESCE(EXCLUDED.completed_at, workouts.completed_at),
			notes = EXCLUDED.notes,
			edited = workouts.edited OR EXCLUDED.edited,
			updated_at = EXCLUDED.updated_at
		WHERE workouts.user_id = $2 AND workouts.updated_at <= EXCLUDED.updated_at`,
		w.ID, uid, w.ProgramID, w.Name, w.DayIndex, w.Status,
		scheduled, w.StartedAt, w.CompletedAt, w.Notes, w.Edited, writeTime)
	return err
}

// workoutOwner returns the owning user of a workout.
func (s *Store) workoutOwner(ctx context.Context, workoutID string) (string, error) {
	var owner string
	err := s.pool.QueryRow(ctx,
		`SELECT user_id FROM workouts WHERE id = $1`, workoutID).Scan(&owner)
	return owner, err
}

// UpsertWorkoutExerciseSync adds/edits an exercise row inside a workout the
// user owns, marking the workout as user-edited so re-planning preserves it.
func (s *Store) UpsertWorkoutExerciseSync(ctx context.Context, uid string, we domain.WorkoutExercise, writeTime time.Time) error {
	owner, err := s.workoutOwner(ctx, we.WorkoutID)
	if err != nil {
		return ErrNotFound
	}
	if owner != uid {
		return fmt.Errorf("workout %s: %w", we.WorkoutID, ErrNotFound)
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO workout_exercises (id, workout_id, exercise_id, position,
			target_sets, target_reps_min, target_reps_max, target_rpe,
			target_load_kg, rest_seconds, notes, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (id) DO UPDATE SET
			exercise_id = EXCLUDED.exercise_id, position = EXCLUDED.position,
			target_sets = EXCLUDED.target_sets,
			target_reps_min = EXCLUDED.target_reps_min,
			target_reps_max = EXCLUDED.target_reps_max,
			target_rpe = EXCLUDED.target_rpe,
			target_load_kg = EXCLUDED.target_load_kg,
			rest_seconds = EXCLUDED.rest_seconds, notes = EXCLUDED.notes,
			updated_at = EXCLUDED.updated_at
		WHERE workout_exercises.updated_at <= EXCLUDED.updated_at`,
		we.ID, we.WorkoutID, we.ExerciseID, we.Position, we.TargetSets,
		we.TargetRepsMin, we.TargetRepsMax, we.TargetRPE, we.TargetLoadKg,
		we.RestSeconds, we.Notes, writeTime)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE workouts SET edited = true, updated_at = now() WHERE id = $1`, we.WorkoutID)
	return err
}

func (s *Store) DeleteWorkoutExerciseSync(ctx context.Context, uid, id string) error {
	_, err := s.pool.Exec(ctx, `
		DELETE FROM workout_exercises we
		USING workouts w
		WHERE we.id = $1 AND we.workout_id = w.id AND w.user_id = $2`, id, uid)
	return err
}

// UpsertSetSync logs/edits a set after verifying the parent chain belongs to
// the caller.
func (s *Store) UpsertSetSync(ctx context.Context, uid string, st domain.Set, writeTime time.Time) error {
	var owner string
	err := s.pool.QueryRow(ctx, `
		SELECT w.user_id FROM workout_exercises we
		JOIN workouts w ON w.id = we.workout_id
		WHERE we.id = $1`, st.WorkoutExerciseID).Scan(&owner)
	if err != nil || owner != uid {
		return fmt.Errorf("workout exercise %s: %w", st.WorkoutExerciseID, ErrNotFound)
	}
	loggedAt := st.LoggedAt
	if loggedAt.IsZero() {
		loggedAt = writeTime
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO sets (id, workout_exercise_id, set_number, load_kg, reps, rpe,
			completed, logged_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (id) DO UPDATE SET
			set_number = EXCLUDED.set_number, load_kg = EXCLUDED.load_kg,
			reps = EXCLUDED.reps, rpe = EXCLUDED.rpe,
			completed = EXCLUDED.completed, logged_at = EXCLUDED.logged_at,
			updated_at = EXCLUDED.updated_at
		WHERE sets.updated_at <= EXCLUDED.updated_at`,
		st.ID, st.WorkoutExerciseID, st.SetNumber, st.LoadKg, st.Reps, st.RPE,
		st.Completed, loggedAt, writeTime)
	return err
}

func (s *Store) DeleteSetSync(ctx context.Context, uid, id string) error {
	_, err := s.pool.Exec(ctx, `
		DELETE FROM sets st
		USING workout_exercises we, workouts w
		WHERE st.id = $1 AND st.workout_exercise_id = we.id
		  AND we.workout_id = w.id AND w.user_id = $2`, id, uid)
	return err
}
