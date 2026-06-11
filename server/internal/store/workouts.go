package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"telos/server/internal/domain"
)

const workoutColumns = `id, user_id, program_id, name, day_index, status,
	scheduled_for, started_at, completed_at, notes, edited, created_at, updated_at`

func scanWorkout(row pgx.Row) (domain.Workout, error) {
	var w domain.Workout
	var scheduled *time.Time
	err := row.Scan(&w.ID, &w.UserID, &w.ProgramID, &w.Name, &w.DayIndex, &w.Status,
		&scheduled, &w.StartedAt, &w.CompletedAt, &w.Notes, &w.Edited, &w.CreatedAt, &w.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return w, ErrNotFound
	}
	if err != nil {
		return w, err
	}
	if scheduled != nil {
		d := domain.NewDate(*scheduled)
		w.ScheduledFor = &d
	}
	return w, nil
}

func (s *Store) collectWorkouts(ctx context.Context, query string, args ...any) ([]domain.Workout, error) {
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Workout
	for rows.Next() {
		w, err := scanWorkout(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// ListWorkouts returns the user's workouts in a scheduled/completed window,
// without nested exercises.
func (s *Store) ListWorkouts(ctx context.Context, uid string, from, to domain.Date) ([]domain.Workout, error) {
	return s.collectWorkouts(ctx, `
		SELECT `+workoutColumns+` FROM workouts
		WHERE user_id = $1
		  AND (scheduled_for BETWEEN $2 AND $3
		       OR completed_at::date BETWEEN $2 AND $3)
		ORDER BY scheduled_for NULLS LAST, day_index`,
		uid, from.Time(), to.Time())
}

// GetWorkout loads one workout with exercises and sets, verifying ownership.
func (s *Store) GetWorkout(ctx context.Context, uid, id string) (domain.Workout, error) {
	w, err := scanWorkout(s.pool.QueryRow(ctx,
		`SELECT `+workoutColumns+` FROM workouts WHERE id = $1 AND user_id = $2`, id, uid))
	if err != nil {
		return w, err
	}
	hydrated, err := s.hydrateWorkouts(ctx, []domain.Workout{w})
	if err != nil {
		return w, err
	}
	return hydrated[0], nil
}

// hydrateWorkouts attaches exercises + sets to the given workouts.
func (s *Store) hydrateWorkouts(ctx context.Context, workouts []domain.Workout) ([]domain.Workout, error) {
	if len(workouts) == 0 {
		return workouts, nil
	}
	ids := make([]string, len(workouts))
	index := make(map[string]int, len(workouts))
	for i, w := range workouts {
		ids[i] = w.ID
		index[w.ID] = i
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, workout_id, exercise_id, position, target_sets, target_reps_min,
			target_reps_max, target_rpe, target_load_kg, rest_seconds, notes,
			created_at, updated_at
		FROM workout_exercises WHERE workout_id = ANY($1)
		ORDER BY workout_id, position`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	weIndex := make(map[string]struct{ wi, ei int })
	var weIDs []string
	for rows.Next() {
		var we domain.WorkoutExercise
		if err := rows.Scan(&we.ID, &we.WorkoutID, &we.ExerciseID, &we.Position,
			&we.TargetSets, &we.TargetRepsMin, &we.TargetRepsMax, &we.TargetRPE,
			&we.TargetLoadKg, &we.RestSeconds, &we.Notes, &we.CreatedAt, &we.UpdatedAt); err != nil {
			return nil, err
		}
		wi := index[we.WorkoutID]
		workouts[wi].Exercises = append(workouts[wi].Exercises, we)
		weIndex[we.ID] = struct{ wi, ei int }{wi, len(workouts[wi].Exercises) - 1}
		weIDs = append(weIDs, we.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(weIDs) == 0 {
		return workouts, nil
	}
	setRows, err := s.pool.Query(ctx, `
		SELECT id, workout_exercise_id, set_number, load_kg, reps, rpe, completed,
			logged_at, created_at, updated_at
		FROM sets WHERE workout_exercise_id = ANY($1)
		ORDER BY workout_exercise_id, set_number`, weIDs)
	if err != nil {
		return nil, err
	}
	defer setRows.Close()
	for setRows.Next() {
		var st domain.Set
		if err := setRows.Scan(&st.ID, &st.WorkoutExerciseID, &st.SetNumber, &st.LoadKg,
			&st.Reps, &st.RPE, &st.Completed, &st.LoggedAt, &st.CreatedAt, &st.UpdatedAt); err != nil {
			return nil, err
		}
		loc := weIndex[st.WorkoutExerciseID]
		we := &workouts[loc.wi].Exercises[loc.ei]
		we.Sets = append(we.Sets, st)
	}
	return workouts, setRows.Err()
}

// ListCompletedSince returns completed workouts (hydrated) for engine history.
func (s *Store) ListCompletedSince(ctx context.Context, uid string, since time.Time) ([]domain.Workout, error) {
	workouts, err := s.collectWorkouts(ctx, `
		SELECT `+workoutColumns+` FROM workouts
		WHERE user_id = $1 AND status = 'completed' AND completed_at >= $2
		ORDER BY completed_at`, uid, since)
	if err != nil {
		return nil, err
	}
	return s.hydrateWorkouts(ctx, workouts)
}

// ListProgramWeek returns the program's workouts scheduled inside a week
// window, hydrated.
func (s *Store) ListProgramWeek(ctx context.Context, programID string, weekStart, weekEnd domain.Date) ([]domain.Workout, error) {
	workouts, err := s.collectWorkouts(ctx, `
		SELECT `+workoutColumns+` FROM workouts
		WHERE program_id = $1 AND scheduled_for >= $2 AND scheduled_for < $3
		ORDER BY scheduled_for, day_index`,
		programID, weekStart.Time(), weekEnd.Time())
	if err != nil {
		return nil, err
	}
	return s.hydrateWorkouts(ctx, workouts)
}

// PlannedWorkoutRow is the materialized form of an engine-planned session.
type PlannedWorkoutRow struct {
	Name         string
	DayIndex     int
	ScheduledFor domain.Date
	Exercises    []domain.WorkoutExercise // IDs assigned here
}

// ReplaceWeekPlan swaps out the replaceable part of a program week:
// planned, un-edited workouts whose day index is being re-materialized.
// Started, completed, skipped, or user-edited workouts are never touched.
func (s *Store) ReplaceWeekPlan(ctx context.Context, uid, programID string,
	weekStart, weekEnd domain.Date, plans []PlannedWorkoutRow) error {

	return s.withTx(ctx, func(tx pgx.Tx) error {
		// Day indexes that must be preserved (already acted on by the user).
		rows, err := tx.Query(ctx, `
			SELECT day_index FROM workouts
			WHERE program_id = $1 AND scheduled_for >= $2 AND scheduled_for < $3
			  AND (status <> 'planned' OR edited)`,
			programID, weekStart.Time(), weekEnd.Time())
		if err != nil {
			return err
		}
		keep := map[int]bool{}
		for rows.Next() {
			var d int
			if err := rows.Scan(&d); err != nil {
				rows.Close()
				return err
			}
			keep[d] = true
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
			DELETE FROM workouts
			WHERE program_id = $1 AND scheduled_for >= $2 AND scheduled_for < $3
			  AND status = 'planned' AND NOT edited`,
			programID, weekStart.Time(), weekEnd.Time())
		if err != nil {
			return err
		}

		for _, plan := range plans {
			if keep[plan.DayIndex] {
				continue
			}
			workoutID := uuid.NewString()
			_, err := tx.Exec(ctx, `
				INSERT INTO workouts (id, user_id, program_id, name, day_index, status, scheduled_for)
				VALUES ($1, $2, $3, $4, $5, 'planned', $6)`,
				workoutID, uid, programID, plan.Name, plan.DayIndex, plan.ScheduledFor.Time())
			if err != nil {
				return err
			}
			for _, we := range plan.Exercises {
				_, err := tx.Exec(ctx, `
					INSERT INTO workout_exercises (id, workout_id, exercise_id, position,
						target_sets, target_reps_min, target_reps_max, target_rpe,
						target_load_kg, rest_seconds, notes)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
					uuid.NewString(), workoutID, we.ExerciseID, we.Position,
					we.TargetSets, we.TargetRepsMin, we.TargetRepsMax, we.TargetRPE,
					we.TargetLoadKg, we.RestSeconds, we.Notes)
				if err != nil {
					return err
				}
			}
		}
		return nil
	})
}
