package store

import (
	"context"
	"time"

	"telos/server/internal/domain"
)

// Bodyweight entries and daily check-ins. Both are unique per (user, date):
// a second write for the same day updates the existing row (last write wins),
// regardless of which client UUID it carries.

func (s *Store) UpsertBodyweight(ctx context.Context, uid string, e domain.BodyweightEntry, writeTime time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO bodyweight_entries (id, user_id, date, weight_kg, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id, date) DO UPDATE SET
			weight_kg = EXCLUDED.weight_kg, updated_at = EXCLUDED.updated_at
		WHERE bodyweight_entries.updated_at <= EXCLUDED.updated_at`,
		e.ID, uid, e.Date.Time(), e.WeightKg, writeTime)
	return err
}

func (s *Store) ListBodyweightSince(ctx context.Context, uid string, since domain.Date) ([]domain.BodyweightEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, date, weight_kg, created_at, updated_at
		FROM bodyweight_entries
		WHERE user_id = $1 AND date >= $2
		ORDER BY date`, uid, since.Time())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.BodyweightEntry
	for rows.Next() {
		var e domain.BodyweightEntry
		var d time.Time
		if err := rows.Scan(&e.ID, &e.UserID, &d, &e.WeightKg, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		e.Date = domain.NewDate(d)
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) UpsertCheckIn(ctx context.Context, uid string, c domain.CheckIn, writeTime time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO checkins (id, user_id, date, energy, stress, sleep, motivation,
			soreness, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (user_id, date) DO UPDATE SET
			energy = EXCLUDED.energy, stress = EXCLUDED.stress,
			sleep = EXCLUDED.sleep, motivation = EXCLUDED.motivation,
			soreness = EXCLUDED.soreness, updated_at = EXCLUDED.updated_at
		WHERE checkins.updated_at <= EXCLUDED.updated_at`,
		c.ID, uid, c.Date.Time(), c.Energy, c.Stress, c.Sleep, c.Motivation,
		c.Soreness, writeTime)
	return err
}

func (s *Store) ListCheckInsSince(ctx context.Context, uid string, since domain.Date) ([]domain.CheckIn, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, date, energy, stress, sleep, motivation, soreness,
			created_at, updated_at
		FROM checkins
		WHERE user_id = $1 AND date >= $2
		ORDER BY date`, uid, since.Time())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.CheckIn
	for rows.Next() {
		var c domain.CheckIn
		var d time.Time
		if err := rows.Scan(&c.ID, &c.UserID, &d, &c.Energy, &c.Stress, &c.Sleep,
			&c.Motivation, &c.Soreness, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		c.Date = domain.NewDate(d)
		out = append(out, c)
	}
	return out, rows.Err()
}
