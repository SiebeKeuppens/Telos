package engine

import (
	"sort"
	"time"

	"telos/server/internal/domain"
	"telos/server/internal/domain/analytics"
	"telos/server/internal/domain/profile"
)

// Autoregulation, per the brief (§5):
//   all targets hit at low RPE  → progress load,
//   targets met at high RPE     → hold and adapt,
//   missed reps / sustained RPE → reduce, consider early deload.
// Decisions derive purely from logged history at plan time, so the engine is
// idempotent: re-running after a sync always yields the same answer for the
// same data.

type decision int

const (
	decideNoData decision = iota
	decideIncrease
	decideHold
	decideReduce
)

// perfSample summarizes one past appearance of an exercise.
type perfSample struct {
	when       time.Time
	topSetLoad float64 // heaviest completed working-set load
	bestE1RM   float64
	allAtTop   bool    // every target set completed at/above the top of the rep range
	missed     bool    // fewer sets than targeted, or reps below the bottom of the range
	avgRPE     float64 // 0 when not recorded
}

// exerciseHistory extracts up to limit samples for an exercise, newest first.
func exerciseHistory(history []CompletedWorkout, exerciseID string, limit int) []perfSample {
	var samples []perfSample
	for _, w := range history {
		for _, ce := range w.Exercises {
			if ce.ExerciseID != exerciseID || len(ce.Sets) == 0 {
				continue
			}
			samples = append(samples, summarize(w.CompletedAt, ce))
		}
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i].when.After(samples[j].when) })
	if len(samples) > limit {
		samples = samples[:limit]
	}
	return samples
}

func summarize(when time.Time, ce CompletedExercise) perfSample {
	s := perfSample{when: when, allAtTop: true}
	completed := 0
	rpeSum, rpeN := 0.0, 0
	for _, set := range ce.Sets {
		if !set.Completed {
			continue
		}
		completed++
		if set.LoadKg > s.topSetLoad {
			s.topSetLoad = set.LoadKg
		}
		rpe := 0.0
		if set.RPE != nil {
			rpe = *set.RPE
			rpeSum += rpe
			rpeN++
		}
		if e := analytics.EstimateOneRM(set.LoadKg, set.Reps, rpe); e > s.bestE1RM {
			s.bestE1RM = e
		}
		if set.Reps < ce.TargetRepsMax {
			s.allAtTop = false
		}
		if set.Reps < ce.TargetRepsMin {
			s.missed = true
		}
	}
	if completed < ce.TargetSets {
		s.missed = true
		s.allAtTop = false
	}
	if rpeN > 0 {
		s.avgRPE = rpeSum / float64(rpeN)
	}
	return s
}

func decide(samples []perfSample, p profile.Profile) decision {
	if len(samples) == 0 {
		return decideNoData
	}
	last := samples[0]

	// Sustained near-max effort across two sessions → back off proactively.
	if len(samples) >= 2 &&
		last.avgRPE >= p.TargetRPEMax+0.5 && samples[1].avgRPE >= p.TargetRPEMax+0.5 {
		return decideReduce
	}

	switch {
	case last.missed && last.avgRPE >= p.TargetRPEMax:
		return decideReduce
	case last.missed:
		return decideHold
	case last.allAtTop && (last.avgRPE == 0 || last.avgRPE <= p.TargetRPEMax-0.5):
		return decideIncrease
	default:
		return decideHold
	}
}

type loadInputs struct {
	Exercise   domain.Exercise
	Profile    profile.Profile
	Experience domain.ExperienceLevel
	History    []CompletedWorkout
	Reps       profile.RepRange
	Deload     bool
	Intensify  bool
	Soften     bool
}

// loadTarget prescribes the working load for an exercise, or nil when there
// is no usable history. The second return is a guidance CODE the client
// localizes (i18n: the engine never emits display text).
func loadTarget(in loadInputs) (*float64, string) {
	samples := exerciseHistory(in.History, in.Exercise.ID, 4)
	if len(samples) == 0 || samples[0].topSetLoad <= 0 {
		if isUnloaded(in.Exercise) {
			return nil, ""
		}
		return nil, "first_time"
	}
	last := samples[0]
	step := loadStep(in.Exercise, in.Profile)

	var load float64
	noteCode := ""
	switch d := decide(samples, in.Profile); {
	case in.Deload:
		load = last.topSetLoad * 0.85
		noteCode = "deload_light"
	case in.Intensify:
		// Intensification prescribes off the best recent e1RM at ~2 RIR for
		// the heavier rep target.
		load = analytics.LoadForReps(bestE1RM(samples), in.Reps.Max, 2)
	case d == decideIncrease && !in.Soften: // recovery guardrail: never add load on a soften day
		load = last.topSetLoad + step
	case d == decideReduce:
		load = last.topSetLoad * 0.9
		noteCode = "backoff"
	default:
		load = last.topSetLoad
		if d == decideHold && !last.missed && !last.allAtTop {
			noteCode = "hold_add_rep"
		}
	}

	rounded := analytics.RoundToIncrement(load, roundingFor(in.Exercise))
	if rounded <= 0 {
		return nil, noteCode
	}
	return &rounded, noteCode
}

func bestE1RM(samples []perfSample) float64 {
	best := 0.0
	for _, s := range samples {
		if s.bestE1RM > best {
			best = s.bestE1RM
		}
	}
	return best
}

// loadStep is the linear-progression increment: lower-body lifts move in
// bigger steps than upper-body ones.
func loadStep(ex domain.Exercise, p profile.Profile) float64 {
	for _, m := range ex.PrimaryMuscles {
		switch m {
		case domain.MuscleQuads, domain.MuscleHamstrings, domain.MuscleGlutes:
			return p.LowerIncrementKg
		}
	}
	return p.UpperIncrementKg
}

func roundingFor(ex domain.Exercise) float64 {
	for _, eq := range ex.Equipment {
		switch eq {
		case domain.EquipBarbell, domain.EquipMachine, domain.EquipCable:
			return 2.5
		case domain.EquipDumbbell, domain.EquipKettlebell:
			return 2
		}
	}
	return 1
}

// isUnloaded reports whether an exercise normally carries no external load.
func isUnloaded(ex domain.Exercise) bool {
	for _, eq := range ex.Equipment {
		switch eq {
		case domain.EquipBarbell, domain.EquipDumbbell, domain.EquipMachine,
			domain.EquipCable, domain.EquipKettlebell:
			return false
		}
	}
	return true
}

// stalledExercises returns IDs whose recent history shows a stall: three or
// more appearances with no e1RM improvement and repeated misses or near-max
// effort. Two or more stalled lifts can trigger an early deload.
func stalledExercises(history []CompletedWorkout, p profile.Profile) []string {
	seen := make(map[string]bool)
	var stalled []string
	for _, w := range history {
		for _, ce := range w.Exercises {
			if seen[ce.ExerciseID] {
				continue
			}
			seen[ce.ExerciseID] = true
			samples := exerciseHistory(history, ce.ExerciseID, 3)
			if len(samples) < 3 {
				continue
			}
			newest, oldest := samples[0], samples[len(samples)-1]
			if newest.bestE1RM > oldest.bestE1RM*1.005 {
				continue // still progressing
			}
			grinding := 0
			for _, s := range samples {
				if s.missed || (s.avgRPE > 0 && s.avgRPE >= p.TargetRPEMax) {
					grinding++
				}
			}
			if grinding >= 2 {
				stalled = append(stalled, ce.ExerciseID)
			}
		}
	}
	sort.Strings(stalled)
	return stalled
}
