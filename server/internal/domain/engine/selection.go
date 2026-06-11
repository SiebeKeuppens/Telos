package engine

import "telos/server/internal/domain"

// pickedSlot is a slot with a concrete exercise assigned.
type pickedSlot struct {
	exercise domain.Exercise
	sets     int
	isMain   bool // core compound slot: load progression anchors here
	added    bool // appended by the volume balancer (first to trim)
}

// selectForDay fills a day template's slots from the library, honoring the
// user's equipment. Main (compound) slots always take the highest-priority
// candidate so the same lift recurs week to week — progression needs a stable
// signal. Accessory candidates rotate with the mesocycle week for variety.
func (e *Engine) selectForDay(t dayTemplate, equip []domain.Equipment, mesoWeek int) []pickedSlot {
	used := make(map[string]bool)
	picks := make([]pickedSlot, 0, len(t.slots))
	for _, s := range t.slots {
		ex, ok := e.pickExercise(s, equip, mesoWeek, used)
		if !ok {
			continue // no equipment for any pattern option — degrade gracefully
		}
		used[ex.ID] = true
		picks = append(picks, pickedSlot{exercise: ex, sets: s.baseSets, isMain: s.compound})
	}
	return picks
}

func (e *Engine) pickExercise(s slotSpec, equip []domain.Equipment, mesoWeek int, used map[string]bool) (domain.Exercise, bool) {
	for _, pattern := range s.patterns {
		var candidates []domain.Exercise
		for _, ex := range e.ordered {
			if ex.Pattern != pattern || used[ex.ID] || ex.IsCompound != s.compound {
				continue
			}
			if len(s.muscles) > 0 && !hasPrimaryIn(ex, s.muscles) {
				continue
			}
			if !equipmentOK(ex, equip) {
				continue
			}
			candidates = append(candidates, ex)
		}
		if len(candidates) == 0 {
			continue
		}
		if s.compound {
			return candidates[0], true
		}
		idx := (mesoWeek - 1) % len(candidates)
		if idx < 0 {
			idx = 0
		}
		return candidates[idx], true
	}
	return domain.Exercise{}, false
}

// accessoryFor finds an isolation (or, failing that, any) exercise whose
// primary muscle matches, for the volume balancer.
func (e *Engine) accessoryFor(muscle domain.MuscleGroup, equip []domain.Equipment, mesoWeek int, used map[string]bool) (domain.Exercise, bool) {
	pass := func(isolationOnly bool) (domain.Exercise, bool) {
		var candidates []domain.Exercise
		for _, ex := range e.ordered {
			if used[ex.ID] || !equipmentOK(ex, equip) {
				continue
			}
			if isolationOnly && ex.IsCompound {
				continue
			}
			if !hasPrimaryIn(ex, []domain.MuscleGroup{muscle}) {
				continue
			}
			candidates = append(candidates, ex)
		}
		if len(candidates) == 0 {
			return domain.Exercise{}, false
		}
		return candidates[(mesoWeek-1)%len(candidates)], true
	}
	if ex, ok := pass(true); ok {
		return ex, true
	}
	return pass(false)
}

// Substitute resolves an exercise's substitute chain to the first performable
// alternative with the user's equipment (used by the API for inline swaps).
func (e *Engine) Substitute(exerciseID string, equip []domain.Equipment) (domain.Exercise, bool) {
	seen := make(map[string]bool)
	cur, ok := e.lib[exerciseID]
	if !ok {
		return domain.Exercise{}, false
	}
	for cur.SubstituteID != nil && !seen[*cur.SubstituteID] {
		seen[cur.ID] = true
		next, ok := e.lib[*cur.SubstituteID]
		if !ok {
			break
		}
		cur = next
		if equipmentOK(cur, equip) {
			return cur, true
		}
	}
	return domain.Exercise{}, false
}

func hasPrimaryIn(ex domain.Exercise, muscles []domain.MuscleGroup) bool {
	for _, m := range muscles {
		for _, p := range ex.PrimaryMuscles {
			if p == m {
				return true
			}
		}
	}
	return false
}

// equipmentOK reports whether every piece of required equipment is available.
// Bodyweight is always available.
func equipmentOK(ex domain.Exercise, equip []domain.Equipment) bool {
	have := make(map[domain.Equipment]bool, len(equip)+1)
	have[domain.EquipBodyweight] = true
	for _, eq := range equip {
		have[eq] = true
	}
	for _, need := range ex.Equipment {
		if !have[need] {
			return false
		}
	}
	return true
}
