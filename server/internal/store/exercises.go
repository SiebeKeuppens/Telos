package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"telos/server/internal/domain"
)

const exerciseColumns = `id, name, equipment, pattern, primary_muscles,
	secondary_muscles, is_compound, form_cues, common_mistakes, substitute_id, progression_id`

func scanExercise(row pgx.Row) (domain.Exercise, error) {
	var ex domain.Exercise
	var equipment, primary, secondary []string
	var cues, mistakes []byte
	err := row.Scan(&ex.ID, &ex.Name, &equipment, &ex.Pattern, &primary, &secondary,
		&ex.IsCompound, &cues, &mistakes, &ex.SubstituteID, &ex.ProgressionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ex, ErrNotFound
	}
	if err != nil {
		return ex, err
	}
	// Non-nil slices so JSON emits [] (the client types these as arrays).
	ex.Equipment = make([]domain.Equipment, 0, len(equipment))
	ex.PrimaryMuscles = make([]domain.MuscleGroup, 0, len(primary))
	ex.SecondaryMuscles = make([]domain.MuscleGroup, 0, len(secondary))
	for _, e := range equipment {
		ex.Equipment = append(ex.Equipment, domain.Equipment(e))
	}
	for _, m := range primary {
		ex.PrimaryMuscles = append(ex.PrimaryMuscles, domain.MuscleGroup(m))
	}
	for _, m := range secondary {
		ex.SecondaryMuscles = append(ex.SecondaryMuscles, domain.MuscleGroup(m))
	}
	if err := json.Unmarshal(cues, &ex.FormCues); err != nil {
		return ex, fmt.Errorf("exercise %s form_cues: %w", ex.ID, err)
	}
	if err := json.Unmarshal(mistakes, &ex.CommonMistakes); err != nil {
		return ex, fmt.Errorf("exercise %s common_mistakes: %w", ex.ID, err)
	}
	return ex, nil
}

func (s *Store) ListExercises(ctx context.Context) ([]domain.Exercise, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+exerciseColumns+` FROM exercises ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Exercise
	for rows.Next() {
		ex, err := scanExercise(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, ex)
	}
	return out, rows.Err()
}

func (s *Store) GetExercise(ctx context.Context, id string) (domain.Exercise, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+exerciseColumns+` FROM exercises WHERE id = $1`, id)
	return scanExercise(row)
}

// SeedExercises idempotently upserts the exercise library (reference data).
// Two passes: rows first, then substitute/progression links, so self-FKs
// never depend on insert order.
func (s *Store) SeedExercises(ctx context.Context, exercises []domain.Exercise) error {
	return s.withTx(ctx, func(tx pgx.Tx) error {
		for _, ex := range exercises {
			equipment := make([]string, len(ex.Equipment))
			for i, e := range ex.Equipment {
				equipment[i] = string(e)
			}
			primary := make([]string, len(ex.PrimaryMuscles))
			for i, m := range ex.PrimaryMuscles {
				primary[i] = string(m)
			}
			secondary := make([]string, len(ex.SecondaryMuscles))
			for i, m := range ex.SecondaryMuscles {
				secondary[i] = string(m)
			}
			cues, err := json.Marshal(ex.FormCues)
			if err != nil {
				return err
			}
			mistakes, err := json.Marshal(ex.CommonMistakes)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO exercises (id, name, equipment, pattern, primary_muscles,
					secondary_muscles, is_compound, form_cues, common_mistakes)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				ON CONFLICT (id) DO UPDATE SET
					name = EXCLUDED.name, equipment = EXCLUDED.equipment,
					pattern = EXCLUDED.pattern, primary_muscles = EXCLUDED.primary_muscles,
					secondary_muscles = EXCLUDED.secondary_muscles,
					is_compound = EXCLUDED.is_compound, form_cues = EXCLUDED.form_cues,
					common_mistakes = EXCLUDED.common_mistakes`,
				ex.ID, ex.Name, equipment, ex.Pattern, primary, secondary,
				ex.IsCompound, cues, mistakes)
			if err != nil {
				return fmt.Errorf("seed exercise %s: %w", ex.ID, err)
			}
		}
		for _, ex := range exercises {
			_, err := tx.Exec(ctx,
				`UPDATE exercises SET substitute_id = $2, progression_id = $3 WHERE id = $1`,
				ex.ID, ex.SubstituteID, ex.ProgressionID)
			if err != nil {
				return fmt.Errorf("link exercise %s: %w", ex.ID, err)
			}
		}
		return nil
	})
}
