package engine

import "telos/server/internal/domain"

// slotSpec describes one exercise slot in a day template. The engine fills it
// with a concrete exercise from the library (selection.go); patterns are in
// priority order so a missing pattern (no equipment) degrades gracefully.
type slotSpec struct {
	patterns []domain.MovementPattern
	muscles  []domain.MuscleGroup // optional primary-muscle filter
	compound bool
	baseSets int
}

// dayTemplate is the structural skeleton of one training day.
// homeMuscles bounds which muscles the volume balancer may append accessories
// for on this day (keeps leg work off upper days and vice versa).
type dayTemplate struct {
	name        string
	homeMuscles []domain.MuscleGroup
	slots       []slotSpec
}

// dayDraft is a day mid-assembly: template + selected exercises.
type dayDraft struct {
	template dayTemplate
	zone     intensityZone
	picks    []pickedSlot
}

var upperMuscles = []domain.MuscleGroup{
	domain.MuscleChest, domain.MuscleBack, domain.MuscleShoulders,
	domain.MuscleBiceps, domain.MuscleTriceps, domain.MuscleCore,
}

var lowerMuscles = []domain.MuscleGroup{
	domain.MuscleQuads, domain.MuscleHamstrings, domain.MuscleGlutes,
	domain.MuscleCalves, domain.MuscleCore,
}

func compoundSlot(baseSets int, patterns ...domain.MovementPattern) slotSpec {
	return slotSpec{patterns: patterns, compound: true, baseSets: baseSets}
}

// dayTemplates returns the week's day skeletons for a split at a frequency.
// Full-body days rotate emphasis (squat/push vs hinge/pull) so patterns
// balance across the week, per the brief's push/pull–squat/hinge mandate.
func dayTemplates(split domain.SplitStyle, days int) []dayTemplate {
	switch split {
	case domain.SplitUpperLower:
		return upperLowerWeek(days)
	case domain.SplitPushPullLegs:
		return pplWeek(days)
	case domain.SplitBodyPart:
		return bodyPartWeek(days)
	default:
		return fullBodyWeek(days)
	}
}

func fullBodyWeek(days int) []dayTemplate {
	a := dayTemplate{
		name:        "Full Body A",
		homeMuscles: domain.AllMuscleGroups,
		slots: []slotSpec{
			compoundSlot(3, domain.PatternSquat, domain.PatternLunge),
			compoundSlot(3, domain.PatternHorizontalPush, domain.PatternVerticalPush),
			compoundSlot(3, domain.PatternHorizontalPull, domain.PatternVerticalPull),
		},
	}
	b := dayTemplate{
		name:        "Full Body B",
		homeMuscles: domain.AllMuscleGroups,
		slots: []slotSpec{
			compoundSlot(3, domain.PatternHinge, domain.PatternSquat),
			compoundSlot(3, domain.PatternVerticalPush, domain.PatternHorizontalPush),
			compoundSlot(3, domain.PatternVerticalPull, domain.PatternHorizontalPull),
		},
	}
	c := dayTemplate{
		name:        "Full Body C",
		homeMuscles: domain.AllMuscleGroups,
		slots: []slotSpec{
			compoundSlot(3, domain.PatternLunge, domain.PatternSquat),
			compoundSlot(3, domain.PatternHorizontalPush, domain.PatternVerticalPush),
			compoundSlot(3, domain.PatternHorizontalPull, domain.PatternVerticalPull),
		},
	}
	d := dayTemplate{
		name:        "Full Body D",
		homeMuscles: domain.AllMuscleGroups,
		slots: []slotSpec{
			compoundSlot(3, domain.PatternHinge, domain.PatternLunge),
			compoundSlot(3, domain.PatternVerticalPush, domain.PatternHorizontalPush),
			compoundSlot(3, domain.PatternHorizontalPull, domain.PatternVerticalPull),
		},
	}
	week := []dayTemplate{a, b, c, d}
	if days < 1 {
		days = 1
	}
	if days > len(week) {
		days = len(week)
	}
	return week[:days]
}

func upperLowerWeek(days int) []dayTemplate {
	upper := func(name string) dayTemplate {
		return dayTemplate{
			name:        name,
			homeMuscles: upperMuscles,
			slots: []slotSpec{
				compoundSlot(3, domain.PatternHorizontalPush),
				compoundSlot(3, domain.PatternHorizontalPull),
				compoundSlot(3, domain.PatternVerticalPush),
				compoundSlot(3, domain.PatternVerticalPull),
			},
		}
	}
	lower := func(name string) dayTemplate {
		return dayTemplate{
			name:        name,
			homeMuscles: lowerMuscles,
			slots: []slotSpec{
				compoundSlot(3, domain.PatternSquat),
				compoundSlot(3, domain.PatternHinge),
				compoundSlot(3, domain.PatternLunge, domain.PatternSquat),
			},
		}
	}
	week := []dayTemplate{
		upper("Upper A"), lower("Lower A"), upper("Upper B"), lower("Lower B"), upper("Upper C"),
	}
	if days < 2 {
		days = 2
	}
	if days > len(week) {
		days = len(week)
	}
	return week[:days]
}

func pplWeek(days int) []dayTemplate {
	push := func(name string) dayTemplate {
		return dayTemplate{
			name:        name,
			homeMuscles: []domain.MuscleGroup{domain.MuscleChest, domain.MuscleShoulders, domain.MuscleTriceps, domain.MuscleCore},
			slots: []slotSpec{
				compoundSlot(3, domain.PatternHorizontalPush),
				compoundSlot(3, domain.PatternVerticalPush),
				compoundSlot(3, domain.PatternHorizontalPush, domain.PatternVerticalPush),
			},
		}
	}
	pull := func(name string) dayTemplate {
		return dayTemplate{
			name:        name,
			homeMuscles: []domain.MuscleGroup{domain.MuscleBack, domain.MuscleBiceps, domain.MuscleShoulders, domain.MuscleCore},
			slots: []slotSpec{
				compoundSlot(3, domain.PatternHorizontalPull),
				compoundSlot(3, domain.PatternVerticalPull),
				compoundSlot(3, domain.PatternHorizontalPull, domain.PatternVerticalPull),
			},
		}
	}
	legs := func(name string) dayTemplate {
		return dayTemplate{
			name:        name,
			homeMuscles: lowerMuscles,
			slots: []slotSpec{
				compoundSlot(3, domain.PatternSquat),
				compoundSlot(3, domain.PatternHinge),
				compoundSlot(3, domain.PatternLunge, domain.PatternSquat),
			},
		}
	}
	upper := dayTemplate{
		name:        "Upper",
		homeMuscles: upperMuscles,
		slots: []slotSpec{
			compoundSlot(3, domain.PatternHorizontalPush),
			compoundSlot(3, domain.PatternHorizontalPull),
			compoundSlot(3, domain.PatternVerticalPush),
			compoundSlot(3, domain.PatternVerticalPull),
		},
	}
	lower := dayTemplate{
		name:        "Lower",
		homeMuscles: lowerMuscles,
		slots: []slotSpec{
			compoundSlot(3, domain.PatternSquat),
			compoundSlot(3, domain.PatternHinge),
			compoundSlot(3, domain.PatternLunge, domain.PatternSquat),
		},
	}

	switch {
	case days >= 6:
		return []dayTemplate{push("Push A"), pull("Pull A"), legs("Legs A"), push("Push B"), pull("Pull B"), legs("Legs B")}
	case days == 5:
		return []dayTemplate{push("Push"), pull("Pull"), legs("Legs"), upper, lower}
	case days == 4:
		return upperLowerWeek(4)
	case days == 3:
		return []dayTemplate{push("Push"), pull("Pull"), legs("Legs")}
	default:
		return fullBodyWeek(days)
	}
}

// bodyPartWeek pairs two focus muscle groups per session (classic pairings:
// pressing with triceps, pulling with biceps). homeMuscles stay tight so the
// volume balancer keeps accessory work on its focus day; weekly per-muscle
// bands still govern totals.
func bodyPartWeek(days int) []dayTemplate {
	chestTris := dayTemplate{
		name:        "Chest + Triceps",
		homeMuscles: []domain.MuscleGroup{domain.MuscleChest, domain.MuscleTriceps},
		slots: []slotSpec{
			compoundSlot(3, domain.PatternHorizontalPush),
			compoundSlot(3, domain.PatternHorizontalPush, domain.PatternVerticalPush),
			{patterns: []domain.MovementPattern{domain.PatternIsolation},
				muscles: []domain.MuscleGroup{domain.MuscleTriceps}, baseSets: 3},
		},
	}
	backBis := dayTemplate{
		name:        "Back + Biceps",
		homeMuscles: []domain.MuscleGroup{domain.MuscleBack, domain.MuscleBiceps},
		slots: []slotSpec{
			compoundSlot(3, domain.PatternHorizontalPull),
			compoundSlot(3, domain.PatternVerticalPull, domain.PatternHorizontalPull),
			{patterns: []domain.MovementPattern{domain.PatternIsolation},
				muscles: []domain.MuscleGroup{domain.MuscleBiceps}, baseSets: 3},
		},
	}
	legsA := dayTemplate{
		name:        "Quads + Hamstrings",
		homeMuscles: []domain.MuscleGroup{domain.MuscleQuads, domain.MuscleHamstrings, domain.MuscleGlutes, domain.MuscleCalves},
		slots: []slotSpec{
			compoundSlot(3, domain.PatternSquat),
			compoundSlot(3, domain.PatternHinge),
			compoundSlot(3, domain.PatternLunge, domain.PatternSquat),
		},
	}
	shouldersCore := dayTemplate{
		name:        "Shoulders + Core",
		homeMuscles: []domain.MuscleGroup{domain.MuscleShoulders, domain.MuscleCore},
		slots: []slotSpec{
			compoundSlot(3, domain.PatternVerticalPush),
			{patterns: []domain.MovementPattern{domain.PatternIsolation},
				muscles: []domain.MuscleGroup{domain.MuscleShoulders}, baseSets: 3},
			{patterns: []domain.MovementPattern{domain.PatternCore}, baseSets: 3},
		},
	}
	armsCalves := dayTemplate{
		name:        "Arms + Calves",
		homeMuscles: []domain.MuscleGroup{domain.MuscleBiceps, domain.MuscleTriceps, domain.MuscleCalves},
		slots: []slotSpec{
			{patterns: []domain.MovementPattern{domain.PatternIsolation},
				muscles: []domain.MuscleGroup{domain.MuscleBiceps}, baseSets: 3},
			{patterns: []domain.MovementPattern{domain.PatternIsolation},
				muscles: []domain.MuscleGroup{domain.MuscleTriceps}, baseSets: 3},
			{patterns: []domain.MovementPattern{domain.PatternIsolation},
				muscles: []domain.MuscleGroup{domain.MuscleCalves}, baseSets: 3},
		},
	}
	legsB := dayTemplate{
		name:        "Glutes + Hamstrings",
		homeMuscles: []domain.MuscleGroup{domain.MuscleGlutes, domain.MuscleHamstrings, domain.MuscleCalves, domain.MuscleCore},
		slots: []slotSpec{
			compoundSlot(3, domain.PatternHinge),
			compoundSlot(3, domain.PatternLunge, domain.PatternSquat),
			{patterns: []domain.MovementPattern{domain.PatternIsolation},
				muscles: []domain.MuscleGroup{domain.MuscleHamstrings, domain.MuscleGlutes}, baseSets: 3},
		},
	}

	switch {
	case days >= 6:
		return []dayTemplate{chestTris, backBis, legsA, shouldersCore, armsCalves, legsB}
	case days == 5:
		return []dayTemplate{chestTris, backBis, legsA, shouldersCore, armsCalves}
	default: // 4
		return []dayTemplate{chestTris, backBis, legsA, shouldersCore}
	}
}
