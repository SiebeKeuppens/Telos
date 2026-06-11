// Package engine is Telos's adaptive training engine. It is pure domain
// logic: no HTTP, no SQL, no clocks — every input arrives in Inputs and every
// decision leaves in PlanResult, which makes the whole module unit-testable.
//
// The engine never branches on the user's goal: all goal-specific behavior
// comes in through the training profile (package profile). Experience level
// picks the periodization model; recovery signals and logged performance feed
// autoregulation and deload triggers.
package engine

import (
	"fmt"
	"time"

	"telos/server/internal/domain"
	"telos/server/internal/domain/profile"
)

// Inputs is everything the engine may consider for one planning pass.
type Inputs struct {
	User    domain.User
	Profile profile.Profile
	// Program is the persisted program state, nil when none exists (new user
	// or goal change → fresh program).
	Program *domain.Program
	// History holds completed workouts in chronological order (oldest first).
	// Callers should pass a bounded window (e.g. last ~90 days).
	History []CompletedWorkout
	// CheckIns are recent daily check-ins in chronological order.
	CheckIns []domain.CheckIn
	Today    domain.Date
}

// CompletedWorkout is the slice of history the engine needs — what was
// planned vs. what was actually lifted.
type CompletedWorkout struct {
	WorkoutID   string
	ProgramID   *string
	CompletedAt time.Time
	Exercises   []CompletedExercise
}

type CompletedExercise struct {
	ExerciseID    string
	TargetSets    int
	TargetRepsMin int
	TargetRepsMax int
	TargetRPE     *float64
	TargetLoadKg  *float64
	Sets          []domain.Set
}

// PlanResult is one planned training week plus the program state that
// produced it. The API layer persists State and materializes Workouts.
type PlanResult struct {
	State    ProgramState
	Workouts []PlannedWorkout
	// Notes are engine decisions as stable CODES the client localizes:
	// "deload_scheduled", "deload_stalls", "deload_recovery", "eased_today".
	// The server ships no display language (i18n groundwork).
	Notes []string
}

// Program-note codes.
const (
	NoteDeloadScheduled = "deload_scheduled"
	NoteDeloadStalls    = "deload_stalls"
	NoteDeloadRecovery  = "deload_recovery"
	NoteEasedToday      = "eased_today"
)

// ProgramState is the engine's view of program persistence. StartedAt is the
// mesocycle anchor: phase and week are derived from (Today − StartedAt), and
// an early-triggered deload simply re-anchors so the current week lands on
// the deload slot. One anchor, pure derivation, no counters to drift.
type ProgramState struct {
	Goal          domain.Goal
	Split         domain.SplitStyle
	DaysPerWeek   int
	Phase         domain.ProgramPhase
	WeekInPhase   int
	MesocycleWeek int
	StartedAt     domain.Date
}

type PlannedWorkout struct {
	Name      string
	DayIndex  int
	Warmup    []domain.WarmupMove
	Exercises []PlannedExercise
}

type PlannedExercise struct {
	ExerciseID   string
	Position     int
	Sets         int
	RepsMin      int
	RepsMax      int
	TargetRPE    float64
	TargetLoadKg *float64 // nil → "pick a weight you could lift for the target reps with 2–3 in reserve"
	RestSeconds  int
	// NoteCode is guidance as a stable code the client localizes:
	// "first_time", "backoff", "hold_add_rep", "deload_light",
	// "intensity_optional". Empty = nothing to say.
	NoteCode string
}

// Engine carries the exercise library (reference data). All planning state is
// per-call via Inputs.
type Engine struct {
	lib     map[string]domain.Exercise
	ordered []domain.Exercise // library order = deterministic selection priority
}

func New(library []domain.Exercise) *Engine {
	m := make(map[string]domain.Exercise, len(library))
	for _, ex := range library {
		m[ex.ID] = ex
	}
	return &Engine{lib: m, ordered: library}
}

// PlanWeek computes the current training week: program state (advancing
// phases, deciding deloads) and the concrete sessions with exercise
// selection, set/rep/load targets and autoregulation applied.
func (e *Engine) PlanWeek(in Inputs) (PlanResult, error) {
	if !in.User.Goal.Valid() {
		return PlanResult{}, fmt.Errorf("invalid goal %q", in.User.Goal)
	}
	if !in.User.Experience.Valid() {
		return PlanResult{}, fmt.Errorf("invalid experience %q", in.User.Experience)
	}

	p := in.Profile
	days := p.ClampDays(in.User.DaysPerWeek)
	split := p.Split(days)
	// The user may pick a split style; it wins whenever it's workable at
	// their frequency, otherwise the profile default quietly applies.
	if in.User.SplitPreference != nil && domain.SplitCompatible(*in.User.SplitPreference, days) {
		split = *in.User.SplitPreference
	}

	rec := assessRecovery(in.CheckIns, in.Today)
	stalled := stalledExercises(in.History, p)

	state, deloadReason := nextState(in, days, split, rec, stalled)

	var notes []string
	if state.Phase == domain.PhaseDeload {
		if deloadReason != "" {
			notes = append(notes, deloadReason)
		} else {
			notes = append(notes, NoteDeloadScheduled)
		}
	} else if rec.SoftenToday {
		notes = append(notes, NoteEasedToday)
	}

	week, err := e.buildWeek(in, state, rec)
	if err != nil {
		return PlanResult{}, err
	}

	return PlanResult{State: state, Workouts: week, Notes: notes}, nil
}

// mesoLayout describes the mesocycle for an experience level: how many
// loading weeks, and which phase each week belongs to. The final week of
// every layout is the scheduled deload.
type mesoLayout struct {
	totalWeeks int // loading weeks + 1 deload week
	phaseFor   func(week int) (domain.ProgramPhase, int) // 1-based meso week → (phase, week-in-phase)
}

func layoutFor(exp domain.ExperienceLevel, p profile.Profile) mesoLayout {
	loading := p.DeloadIntervalWeeks
	if loading < 3 {
		loading = 3
	}
	switch exp {
	case domain.ExperienceAdvanced:
		// Block periodization: accumulation (~60%) → intensification → deload.
		accum := (loading*3 + 4) / 5 // ceil(loading*0.6)
		return mesoLayout{
			totalWeeks: loading + 1,
			phaseFor: func(w int) (domain.ProgramPhase, int) {
				switch {
				case w <= accum:
					return domain.PhaseAccumulation, w
				case w <= loading:
					return domain.PhaseIntensification, w - accum
				default:
					return domain.PhaseDeload, 1
				}
			},
		}
	case domain.ExperienceIntermediate:
		return mesoLayout{
			totalWeeks: loading + 1,
			phaseFor: func(w int) (domain.ProgramPhase, int) {
				if w > loading {
					return domain.PhaseDeload, 1
				}
				return domain.PhaseUndulating, w
			},
		}
	default: // beginner
		return mesoLayout{
			totalWeeks: loading + 1,
			phaseFor: func(w int) (domain.ProgramPhase, int) {
				if w > loading {
					return domain.PhaseDeload, 1
				}
				return domain.PhaseLinear, w
			},
		}
	}
}

// nextState derives the program state for the current week, starting a fresh
// program when needed and handling both scheduled and triggered deloads.
func nextState(in Inputs, days int, split domain.SplitStyle, rec recoveryState, stalled []string) (ProgramState, string) {
	layout := layoutFor(in.User.Experience, in.Profile)

	anchor := in.Today
	fresh := in.Program == nil ||
		in.Program.Goal != in.User.Goal ||
		in.Program.DaysPerWeek != days ||
		in.Program.Split != split
	if !fresh {
		anchor = domain.NewDate(in.Program.StartedAt)
	}

	weeks := in.Today.DaysSince(anchor) / 7
	if weeks < 0 {
		weeks = 0
	}
	mesoWeek := weeks%layout.totalWeeks + 1
	phase, weekInPhase := layout.phaseFor(mesoWeek)

	reason := ""
	// Early deload triggers — only mid-mesocycle, never two deloads back to
	// back, and they can only make the week EASIER (guardrail: recovery
	// signals ease programs, they never intensify them).
	if phase != domain.PhaseDeload && mesoWeek >= 3 {
		switch {
		case len(stalled) >= 2:
			reason = NoteDeloadStalls
		case rec.SustainedPoor:
			reason = NoteDeloadRecovery
		}
		if reason != "" {
			// Re-anchor so the current week lands on the deload slot; the
			// next mesocycle then derives cleanly from the same anchor.
			anchor = in.Today.AddDays(-7 * (layout.totalWeeks - 1))
			mesoWeek = layout.totalWeeks
			phase, weekInPhase = layout.phaseFor(mesoWeek)
		}
	}

	return ProgramState{
		Goal:          in.User.Goal,
		Split:         split,
		DaysPerWeek:   days,
		Phase:         phase,
		WeekInPhase:   weekInPhase,
		MesocycleWeek: mesoWeek,
		StartedAt:     anchor,
	}, reason
}

// buildWeek assembles each day of the microcycle: slot templates → exercise
// selection → volume allocation → rep/RPE/load targets.
func (e *Engine) buildWeek(in Inputs, state ProgramState, rec recoveryState) ([]PlannedWorkout, error) {
	templates := dayTemplates(state.Split, state.DaysPerWeek)
	if len(templates) == 0 {
		return nil, fmt.Errorf("no day templates for split %s/%d days", state.Split, state.DaysPerWeek)
	}

	deload := state.Phase == domain.PhaseDeload
	intensify := state.Phase == domain.PhaseIntensification

	// Day intensity zones: intermediates undulate (heavy/moderate/light across
	// the week); everyone else trains in a single moderate zone.
	zones := dayZones(state.Phase, len(templates))

	// 1) Select exercises for every day's core slots.
	drafts := make([]dayDraft, 0, len(templates))
	for i, t := range templates {
		picks := e.selectForDay(t, in.User.Equipment, state.MesocycleWeek)
		drafts = append(drafts, dayDraft{template: t, zone: zones[i], picks: picks})
	}

	// 2) Balance weekly volume per muscle against the profile's MEV–MAV band:
	// ramp set counts with the week, add accessories where a muscle is under
	// target, trim isolation where it overshoots.
	e.balanceVolume(drafts, in.Profile, state, in.User.Equipment)

	// 3) Apply rep bands, RPE, and load targets per exercise; prepend the
	// day's dynamic warmup.
	var out []PlannedWorkout
	for i, d := range drafts {
		w := PlannedWorkout{
			Name:     d.template.name,
			DayIndex: i,
			Warmup:   buildWarmup(d.picks),
		}
		pos := 0
		for _, pk := range d.picks {
			ex := pk.exercise
			sets := pk.sets
			reps := repTarget(in.Profile, ex.IsCompound, d.zone, intensify)
			rpe := rpeTarget(in.Profile, d.zone, deload, rec.SoftenToday)
			rest := in.Profile.RestCompoundSec
			if !ex.IsCompound {
				rest = in.Profile.RestIsolationSec
			}
			// Product rule: rest is capped at 2 minutes — sessions keep
			// moving regardless of what a profile (or future tuning) says.
			rest = min(rest, domain.MaxRestSeconds)

			if deload {
				sets = (sets + 1) / 2
			}

			loadKg, noteCode := loadTarget(loadInputs{
				Exercise:   ex,
				Profile:    in.Profile,
				Experience: in.User.Experience,
				History:    in.History,
				Reps:       reps,
				Deload:     deload,
				Intensify:  intensify,
				Soften:     rec.SoftenToday,
			})

			// The load decision's guidance wins; the optional intensity nudge
			// only fills silence.
			if noteCode == "" && in.Profile.UseIntensityTechniques &&
				!ex.IsCompound && !deload && !rec.SoftenToday {
				noteCode = "intensity_optional"
			}

			w.Exercises = append(w.Exercises, PlannedExercise{
				ExerciseID:   ex.ID,
				Position:     pos,
				Sets:         sets,
				RepsMin:      reps.Min,
				RepsMax:      reps.Max,
				TargetRPE:    rpe,
				TargetLoadKg: loadKg,
				RestSeconds:  rest,
				NoteCode:     noteCode,
			})
			pos++
		}
		out = append(out, w)
	}
	return out, nil
}

// intensityZone is the daily undulation slot.
type intensityZone int

const (
	zoneModerate intensityZone = iota
	zoneHeavy
	zoneLight
)

func dayZones(phase domain.ProgramPhase, days int) []intensityZone {
	zones := make([]intensityZone, days)
	if phase != domain.PhaseUndulating {
		return zones // all moderate
	}
	cycle := []intensityZone{zoneHeavy, zoneModerate, zoneLight}
	for i := range zones {
		zones[i] = cycle[i%len(cycle)]
	}
	return zones
}

// repTarget picks the rep band for an exercise from the profile, shifted by
// the day's zone and the program phase.
func repTarget(p profile.Profile, compound bool, zone intensityZone, intensify bool) profile.RepRange {
	band := p.AccessoryReps
	if compound {
		band = p.CompoundReps
	}
	width := band.Max - band.Min
	switch {
	case compound && intensify:
		// Intensification: bottom of the band, heavier.
		return profile.RepRange{Min: band.Min, Max: band.Min + max(1, width/3)}
	case compound && zone == zoneHeavy:
		return profile.RepRange{Min: band.Min, Max: band.Min + max(1, width/2)}
	case compound && zone == zoneLight:
		return profile.RepRange{Min: band.Max - max(1, width/2), Max: band.Max}
	default:
		return band
	}
}

func rpeTarget(p profile.Profile, zone intensityZone, deload, soften bool) float64 {
	if deload {
		return 6 // crisp, easy work — the point of the week
	}
	t := (p.TargetRPEMin + p.TargetRPEMax) / 2
	if zone == zoneHeavy {
		t = p.TargetRPEMax - 0.5
	}
	if zone == zoneLight {
		t = p.TargetRPEMin
	}
	if soften {
		// Recovery guardrail: ease, never intensify.
		t = min(t, p.TargetRPEMin+0.5)
	}
	return t
}
