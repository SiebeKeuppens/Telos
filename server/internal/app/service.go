// Package app orchestrates the domain: it feeds the engine from the store,
// materializes plans back into Postgres, and keeps Redis coherent. HTTP
// handlers call into here and stay thin.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"telos/server/internal/cache"
	"telos/server/internal/domain"
	"telos/server/internal/domain/engine"
	"telos/server/internal/domain/profile"
	"telos/server/internal/store"
)

const (
	historyWindowDays = 120
	checkinWindowDays = 30
)

type Service struct {
	store *store.Store
	cache *cache.Cache
	log   *slog.Logger
	// The exercise library is reference data, fixed at boot for V1.
	engine *engine.Engine
	lib    map[string]domain.Exercise
	// now is injectable for tests.
	now func() time.Time
}

func New(st *store.Store, ca *cache.Cache, library []domain.Exercise, log *slog.Logger) *Service {
	lib := make(map[string]domain.Exercise, len(library))
	for _, ex := range library {
		lib[ex.ID] = ex
	}
	return &Service{store: st, cache: ca, engine: engine.New(library), lib: lib, log: log, now: time.Now}
}

// Substitute resolves the first performable substitute for an exercise given
// the user's equipment (inline swap support).
func (s *Service) Substitute(exerciseID string, equip []domain.Equipment) (domain.Exercise, bool) {
	return s.engine.Substitute(exerciseID, equip)
}

// ---- users ----

func (s *Service) GetUser(ctx context.Context, uid string) (domain.User, error) {
	return s.store.GetUser(ctx, uid)
}

// UpdateProfile applies onboarding/settings changes and re-plans when
// anything the engine consumes changed.
func (s *Service) UpdateProfile(ctx context.Context, u domain.User, writeTime time.Time) (domain.User, error) {
	if !u.Goal.Valid() {
		return domain.User{}, valErrf("invalid goal %q", u.Goal)
	}
	if !u.Experience.Valid() {
		return domain.User{}, valErrf("invalid experience %q", u.Experience)
	}
	if u.Unit != "kg" && u.Unit != "lb" {
		u.Unit = "kg"
	}
	// Optional body details: silently drop implausible values rather than
	// failing the whole profile write.
	if u.HeightCm != nil && (*u.HeightCm < 100 || *u.HeightCm > 250) {
		u.HeightCm = nil
	}
	if u.BirthYear != nil {
		if year := s.now().Year(); *u.BirthYear < year-120 || *u.BirthYear > year-13 {
			u.BirthYear = nil
		}
	}
	if u.Sex != nil && *u.Sex != "male" && *u.Sex != "female" {
		u.Sex = nil
	}
	prev, prevErr := s.store.GetUser(ctx, u.UID)
	updated, err := s.store.UpdateUserProfile(ctx, u, writeTime)
	if err != nil {
		return domain.User{}, err
	}
	engineInputsChanged := prevErr != nil ||
		prev.Goal != updated.Goal || prev.Experience != updated.Experience ||
		prev.DaysPerWeek != updated.DaysPerWeek || !equalEquipment(prev.Equipment, updated.Equipment)
	if engineInputsChanged {
		if err := s.Replan(ctx, updated.UID); err != nil {
			// The profile write succeeded; a failed replan is recoverable on
			// the next plan read — log, don't fail the request.
			s.log.Error("replan after profile update failed", "uid", updated.UID, "err", err)
		}
	}
	s.cache.Delete(ctx, cache.UserKeys(updated.UID)...)
	return updated, nil
}

func equalEquipment(a, b []domain.Equipment) bool {
	if len(a) != len(b) {
		return false
	}
	set := make(map[domain.Equipment]bool, len(a))
	for _, e := range a {
		set[e] = true
	}
	for _, e := range b {
		if !set[e] {
			return false
		}
	}
	return true
}

// ---- program & planning ----

// ProgramView is the client payload for the Program/Today screens.
type ProgramView struct {
	Program  *domain.Program  `json:"program"`
	Workouts []domain.Workout `json:"workouts"` // current training week, hydrated
	Notes    []string         `json:"notes"`
}

// GetProgram returns the active program and the current week's workouts,
// planning lazily when none exist yet (new user just finished onboarding, or
// the calendar rolled into a new week).
func (s *Service) GetProgram(ctx context.Context, uid string) (ProgramView, error) {
	var view ProgramView
	if s.cache.GetJSON(ctx, cache.KeyProgram(uid), &view) {
		return view, nil
	}
	view, err := s.buildProgramView(ctx, uid)
	if err != nil {
		return ProgramView{}, err
	}
	s.cache.SetJSON(ctx, cache.KeyProgram(uid), view, 10*time.Minute)
	return view, nil
}

func (s *Service) buildProgramView(ctx context.Context, uid string) (ProgramView, error) {
	user, err := s.store.GetUser(ctx, uid)
	if err != nil {
		return ProgramView{}, err
	}
	if user.OnboardedAt == nil {
		// Not onboarded yet: nothing to plan.
		return ProgramView{Workouts: []domain.Workout{}}, nil
	}

	prog, err := s.store.GetActiveProgram(ctx, uid)
	missing := errors.Is(err, store.ErrNotFound)
	if err != nil && !missing {
		return ProgramView{}, err
	}

	today := domain.NewDate(s.now())
	if missing || weekRolledOver(prog, today) {
		if err := s.Replan(ctx, uid); err != nil {
			return ProgramView{}, err
		}
		prog, err = s.store.GetActiveProgram(ctx, uid)
		if err != nil {
			return ProgramView{}, err
		}
	}

	weekStart, weekEnd := currentWeekWindow(prog, today)
	workouts, err := s.store.ListProgramWeek(ctx, prog.ID, weekStart, weekEnd)
	if err != nil {
		return ProgramView{}, err
	}
	if workouts == nil {
		workouts = []domain.Workout{} // JSON [] not null — the client types this as an array
	}
	return ProgramView{Program: &prog, Workouts: workouts}, nil
}

// weekRolledOver reports whether 'today' falls outside the week the program
// state was last materialized for.
func weekRolledOver(p domain.Program, today domain.Date) bool {
	weekStart, weekEnd := currentWeekWindow(p, today)
	updated := domain.NewDate(p.UpdatedAt)
	return updated.Before(weekStart) || !updated.Before(weekEnd)
}

// currentWeekWindow computes [start, end) of the program week containing
// today, anchored to the program's start date.
func currentWeekWindow(p domain.Program, today domain.Date) (domain.Date, domain.Date) {
	anchor := domain.NewDate(p.StartedAt)
	days := today.DaysSince(anchor)
	if days < 0 {
		days = 0
	}
	weekStart := anchor.AddDays((days / 7) * 7)
	return weekStart, weekStart.AddDays(7)
}

// Replan runs the engine for the user's current state and materializes the
// resulting week, preserving anything the user already touched.
func (s *Service) Replan(ctx context.Context, uid string) error {
	user, err := s.store.GetUser(ctx, uid)
	if err != nil {
		return err
	}
	if user.OnboardedAt == nil {
		return nil
	}
	prof, ok := profile.ForGoal(user.Goal)
	if !ok {
		return fmt.Errorf("no training profile for goal %q", user.Goal)
	}

	now := s.now()
	today := domain.NewDate(now)

	var progPtr *domain.Program
	if prog, err := s.store.GetActiveProgram(ctx, uid); err == nil {
		progPtr = &prog
	} else if !errors.Is(err, store.ErrNotFound) {
		return err
	}

	completed, err := s.store.ListCompletedSince(ctx, uid, now.AddDate(0, 0, -historyWindowDays))
	if err != nil {
		return err
	}
	checkins, err := s.store.ListCheckInsSince(ctx, uid, today.AddDays(-checkinWindowDays))
	if err != nil {
		return err
	}

	result, err := s.engine.PlanWeek(engine.Inputs{
		User:     user,
		Profile:  prof,
		Program:  progPtr,
		History:  toEngineHistory(completed),
		CheckIns: checkins,
		Today:    today,
	})
	if err != nil {
		return fmt.Errorf("engine: %w", err)
	}

	st := result.State
	prog, err := s.store.SaveProgramState(ctx, uid, st.Goal, st.Split, st.DaysPerWeek,
		st.Phase, st.WeekInPhase, st.MesocycleWeek, st.StartedAt.Time())
	if err != nil {
		return err
	}

	weekStart, weekEnd := currentWeekWindow(prog, today)
	plans := make([]store.PlannedWorkoutRow, 0, len(result.Workouts))
	for _, w := range result.Workouts {
		row := store.PlannedWorkoutRow{
			Name:         w.Name,
			DayIndex:     w.DayIndex,
			ScheduledFor: weekStart.AddDays(dayOffset(w.DayIndex, st.DaysPerWeek)),
		}
		for _, pe := range w.Exercises {
			row.Exercises = append(row.Exercises, domain.WorkoutExercise{
				ExerciseID:    pe.ExerciseID,
				Position:      pe.Position,
				TargetSets:    pe.Sets,
				TargetRepsMin: pe.RepsMin,
				TargetRepsMax: pe.RepsMax,
				TargetRPE:     &pe.TargetRPE,
				TargetLoadKg:  pe.TargetLoadKg,
				RestSeconds:   pe.RestSeconds,
				Notes:         pe.Notes,
			})
		}
		plans = append(plans, row)
	}
	if err := s.store.ReplaceWeekPlan(ctx, uid, prog.ID, weekStart, weekEnd, plans); err != nil {
		return err
	}

	// Persist engine notes onto the program view via cache rebuild.
	s.cache.Delete(ctx, cache.UserKeys(uid)...)
	if len(result.Notes) > 0 {
		view, err := s.buildProgramView(ctx, uid)
		if err == nil {
			view.Notes = result.Notes
			s.cache.SetJSON(ctx, cache.KeyProgram(uid), view, 10*time.Minute)
		}
	}
	return nil
}

// dayOffset spreads training days across the week: 3 days → 0,2,4; 4 days →
// 0,1,3,5; rest days land between sessions where possible.
func dayOffset(dayIndex, daysPerWeek int) int {
	if daysPerWeek <= 0 {
		return 0
	}
	return dayIndex * 7 / daysPerWeek
}

func toEngineHistory(workouts []domain.Workout) []engine.CompletedWorkout {
	out := make([]engine.CompletedWorkout, 0, len(workouts))
	for _, w := range workouts {
		if w.CompletedAt == nil {
			continue
		}
		cw := engine.CompletedWorkout{
			WorkoutID:   w.ID,
			ProgramID:   w.ProgramID,
			CompletedAt: *w.CompletedAt,
		}
		for _, we := range w.Exercises {
			cw.Exercises = append(cw.Exercises, engine.CompletedExercise{
				ExerciseID:    we.ExerciseID,
				TargetSets:    we.TargetSets,
				TargetRepsMin: we.TargetRepsMin,
				TargetRepsMax: we.TargetRepsMax,
				TargetRPE:     we.TargetRPE,
				TargetLoadKg:  we.TargetLoadKg,
				Sets:          we.Sets,
			})
		}
		out = append(out, cw)
	}
	return out
}
