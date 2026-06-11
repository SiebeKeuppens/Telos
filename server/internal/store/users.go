package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"telos/server/internal/domain"
)

func scanUser(row pgx.Row) (domain.User, error) {
	var u domain.User
	var equipment []string
	var splitPref *string
	err := row.Scan(&u.UID, &u.Email, &u.DisplayName, &u.Goal, &u.Experience,
		&u.DaysPerWeek, &equipment, &u.Limitations, &u.Unit,
		&u.HeightCm, &u.BirthYear, &u.Sex, &splitPref, &u.OnboardedAt,
		&u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	if err != nil {
		return u, err
	}
	if splitPref != nil {
		s := domain.SplitStyle(*splitPref)
		u.SplitPreference = &s
	}
	u.Equipment = make([]domain.Equipment, len(equipment))
	for i, e := range equipment {
		u.Equipment[i] = domain.Equipment(e)
	}
	return u, nil
}

const userColumns = `uid, email, display_name, goal, experience, days_per_week,
	equipment, limitations, unit, height_cm, birth_year, sex, split_preference,
	onboarded_at, created_at, updated_at`

func (s *Store) GetUser(ctx context.Context, uid string) (domain.User, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE uid = $1`, uid)
	return scanUser(row)
}

// EnsureUser creates a bare user row on first contact so foreign keys hold
// for synced data even before onboarding completes.
func (s *Store) EnsureUser(ctx context.Context, uid, email string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO users (uid, email) VALUES ($1, $2)
		ON CONFLICT (uid) DO NOTHING`, uid, email)
	return err
}

// UpdateUserProfile applies onboarding/settings fields with last-write-wins
// semantics: a write older than the stored row is ignored.
func (s *Store) UpdateUserProfile(ctx context.Context, u domain.User, writeTime time.Time) (domain.User, error) {
	equipment := make([]string, len(u.Equipment))
	for i, e := range u.Equipment {
		equipment[i] = string(e)
	}
	var splitPref *string
	if u.SplitPreference != nil {
		sp := string(*u.SplitPreference)
		splitPref = &sp
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO users (uid, email, display_name, goal, experience, days_per_week,
			equipment, limitations, unit, height_cm, birth_year, sex,
			split_preference, onboarded_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14)
		ON CONFLICT (uid) DO UPDATE SET
			display_name = EXCLUDED.display_name,
			goal         = EXCLUDED.goal,
			experience   = EXCLUDED.experience,
			days_per_week = EXCLUDED.days_per_week,
			equipment    = EXCLUDED.equipment,
			limitations  = EXCLUDED.limitations,
			unit         = EXCLUDED.unit,
			height_cm    = EXCLUDED.height_cm,
			birth_year   = EXCLUDED.birth_year,
			sex          = EXCLUDED.sex,
			split_preference = EXCLUDED.split_preference,
			onboarded_at = COALESCE(users.onboarded_at, now()),
			updated_at   = EXCLUDED.updated_at
		WHERE users.updated_at <= EXCLUDED.updated_at
		RETURNING `+userColumns,
		u.UID, u.Email, u.DisplayName, u.Goal, u.Experience, u.DaysPerWeek,
		equipment, u.Limitations, u.Unit, u.HeightCm, u.BirthYear, u.Sex,
		splitPref, writeTime)
	updated, err := scanUser(row)
	if errors.Is(err, ErrNotFound) {
		// LWW skipped the write — return current state instead.
		return s.GetUser(ctx, u.UID)
	}
	return updated, err
}
