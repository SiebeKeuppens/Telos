package engine

import (
	"telos/server/internal/domain"
	"telos/server/internal/domain/profile"
)

// Weekly volume balancing. The profile gives each muscle an MEV–MAV band;
// the engine starts mesocycles near MEV, ramps with the week, and treats the
// band as guidance: it fills clear deficits with accessories and trims clear
// overshoots from isolation work, without chasing exact numbers.

const (
	maxSetsPerExercise = 5
	maxExercisesPerDay = 7
	// Sets a muscle may be under target before the balancer reacts.
	deficitTolerance = 1.5
	// Sets a muscle may exceed MAV before the balancer trims.
	overshootTolerance = 1.0
	secondaryWeight    = 0.5
)

// weeklyTargets computes this week's per-muscle set targets.
// Accumulation/linear/undulating weeks ramp MEV → MAV; intensification holds
// volume at the floor while intensity rises; deload reduction is applied
// later by halving set counts, so it uses the floor here too.
func weeklyTargets(p profile.Profile, phase domain.ProgramPhase, weekInPhase int) map[domain.MuscleGroup]float64 {
	out := make(map[domain.MuscleGroup]float64, len(p.Volume))
	for mg, band := range p.Volume {
		t := band.MEV
		switch phase {
		case domain.PhaseIntensification, domain.PhaseDeload:
			t = band.MEV
		default:
			t = band.MEV + p.WeeklyAccessorySetRamp*(weekInPhase-1)
			if t > band.MAV {
				t = band.MAV
			}
		}
		out[mg] = float64(t)
	}
	return out
}

// tally counts weekly sets per muscle across all drafted days: a set counts
// fully for each primary muscle and half for each secondary.
func tallyVolume(drafts []dayDraft) map[domain.MuscleGroup]float64 {
	out := make(map[domain.MuscleGroup]float64)
	for _, d := range drafts {
		for _, pk := range d.picks {
			for _, m := range pk.exercise.PrimaryMuscles {
				out[m] += float64(pk.sets)
			}
			for _, m := range pk.exercise.SecondaryMuscles {
				out[m] += float64(pk.sets) * secondaryWeight
			}
		}
	}
	return out
}

// balanceVolume mutates the drafted week in place:
//  1. bump set counts on existing exercises for under-target muscles,
//  2. append accessory exercises where bumping isn't enough,
//  3. trim isolation sets where a muscle clearly exceeds MAV.
//
// Iteration follows domain.AllMuscleGroups order — deterministic output is a
// design requirement (stable plans, testable engine).
func (e *Engine) balanceVolume(drafts []dayDraft, p profile.Profile, state ProgramState, equip []domain.Equipment) {
	targets := weeklyTargets(p, state.Phase, state.WeekInPhase)
	usedWeek := make(map[string]bool)
	for _, d := range drafts {
		for _, pk := range d.picks {
			usedWeek[pk.exercise.ID] = true
		}
	}

	for _, m := range domain.AllMuscleGroups {
		target := targets[m]
		if target <= 0 {
			continue
		}

		// 1) Grow existing primary work first (cheapest fix, no new exercises).
		for di := range drafts {
			for pi := range drafts[di].picks {
				pk := &drafts[di].picks[pi]
				if !hasPrimaryIn(pk.exercise, []domain.MuscleGroup{m}) {
					continue
				}
				for pk.sets < maxSetsPerExercise && tallyVolume(drafts)[m] < target-deficitTolerance {
					pk.sets++
				}
			}
		}

		// 2) Append accessories on days where the muscle is at home.
		added := 0
		for added < 2 && tallyVolume(drafts)[m] < target-deficitTolerance {
			di, ok := bestDayFor(drafts, m)
			if !ok {
				break
			}
			ex, ok := e.accessoryFor(m, equip, state.MesocycleWeek+added, usedWeek)
			if !ok {
				break
			}
			deficit := target - tallyVolume(drafts)[m]
			sets := int(deficit + 0.5)
			if sets < 2 {
				sets = 2
			}
			if sets > 4 {
				sets = 4
			}
			drafts[di].picks = append(drafts[di].picks, pickedSlot{exercise: ex, sets: sets, added: true})
			usedWeek[ex.ID] = true
			added++
		}
	}

	// 3) Trim overshoot — only from isolation/appended work, never from the
	// main lifts (their volume is the program's backbone).
	for _, m := range domain.AllMuscleGroups {
		band, ok := p.Volume[m]
		if !ok {
			continue
		}
		mav := float64(band.MAV)
		for tallyVolume(drafts)[m] > mav+overshootTolerance {
			if !trimOneSet(drafts, m) {
				break
			}
		}
	}
}

// bestDayFor picks the day with the fewest exercises among days where the
// muscle is "at home" (per the template) and capacity remains.
func bestDayFor(drafts []dayDraft, m domain.MuscleGroup) (int, bool) {
	best, bestCount := -1, maxExercisesPerDay+1
	for i, d := range drafts {
		if !muscleAtHome(d.template, m) || len(d.picks) >= maxExercisesPerDay {
			continue
		}
		if len(d.picks) < bestCount {
			best, bestCount = i, len(d.picks)
		}
	}
	return best, best >= 0
}

func muscleAtHome(t dayTemplate, m domain.MuscleGroup) bool {
	for _, hm := range t.homeMuscles {
		if hm == m {
			return true
		}
	}
	return false
}

// trimOneSet removes one set of non-main work hitting the muscle as primary;
// exercises that would drop below 2 sets are removed entirely. Returns false
// when nothing trimmable remains.
func trimOneSet(drafts []dayDraft, m domain.MuscleGroup) bool {
	for di := range drafts {
		for pi := range drafts[di].picks {
			pk := &drafts[di].picks[pi]
			if pk.isMain || !hasPrimaryIn(pk.exercise, []domain.MuscleGroup{m}) {
				continue
			}
			if pk.sets > 2 {
				pk.sets--
				return true
			}
			drafts[di].picks = append(drafts[di].picks[:pi], drafts[di].picks[pi+1:]...)
			return true
		}
	}
	return false
}
