package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"telos/server/internal/domain"
)

const programColumns = `id, user_id, status, goal, split, days_per_week,
	phase, week_in_phase, mesocycle_week, started_at, created_at, updated_at`

func scanProgram(row pgx.Row) (domain.Program, error) {
	var p domain.Program
	err := row.Scan(&p.ID, &p.UserID, &p.Status, &p.Goal, &p.Split, &p.DaysPerWeek,
		&p.Phase, &p.WeekInPhase, &p.MesocycleWeek, &p.StartedAt, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

func (s *Store) GetActiveProgram(ctx context.Context, uid string) (domain.Program, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT `+programColumns+` FROM programs
		WHERE user_id = $1 AND status = 'active'
		ORDER BY created_at DESC LIMIT 1`, uid)
	return scanProgram(row)
}

// SaveProgramState persists engine output: updates the active program in
// place when its structure (goal/split/frequency) is unchanged, otherwise
// archives it and starts a new one.
func (s *Store) SaveProgramState(ctx context.Context, uid string, goal domain.Goal,
	split domain.SplitStyle, days int, phase domain.ProgramPhase,
	weekInPhase, mesoWeek int, startedAt time.Time) (domain.Program, error) {

	current, err := s.GetActiveProgram(ctx, uid)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return domain.Program{}, err
	}

	if err == nil && current.Goal == goal && current.Split == split && current.DaysPerWeek == days {
		row := s.pool.QueryRow(ctx, `
			UPDATE programs SET phase = $2, week_in_phase = $3, mesocycle_week = $4,
				started_at = $5, updated_at = now()
			WHERE id = $1
			RETURNING `+programColumns,
			current.ID, phase, weekInPhase, mesoWeek, startedAt)
		return scanProgram(row)
	}

	if err == nil {
		if _, aerr := s.pool.Exec(ctx,
			`UPDATE programs SET status = 'archived', updated_at = now() WHERE id = $1`,
			current.ID); aerr != nil {
			return domain.Program{}, aerr
		}
	}

	row := s.pool.QueryRow(ctx, `
		INSERT INTO programs (user_id, goal, split, days_per_week, phase,
			week_in_phase, mesocycle_week, started_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING `+programColumns,
		uid, goal, split, days, phase, weekInPhase, mesoWeek, startedAt)
	return scanProgram(row)
}
