package engine

import "telos/server/internal/domain"

// Dynamic warmup generation. Every session gets a short movement-prep block
// keyed to what the day actually trains: a general pulse-raiser plus dynamic
// moves for the patterns on the menu. Names are stable codes — the client
// owns display language (i18n) and instructions.

const maxWarmupMoves = 6

var warmupGeneral = []domain.WarmupMove{
	{Name: "jumping_jacks", Prescription: "45 s"},
	{Name: "arm_circles", Prescription: "10/side"},
}

var warmupLower = []domain.WarmupMove{
	{Name: "leg_swings", Prescription: "10/side"},
	{Name: "bodyweight_squats", Prescription: "10"},
	{Name: "hip_openers", Prescription: "6/side"},
}

var warmupPush = []domain.WarmupMove{
	{Name: "wall_slides", Prescription: "8"},
	{Name: "scap_pushups", Prescription: "8"},
}

var warmupPull = []domain.WarmupMove{
	{Name: "prone_yt_raises", Prescription: "8"},
}

// buildWarmup assembles the day's warmup from its selected exercises,
// deterministically: general first, then lower/push/pull blocks for the
// patterns present, capped so warming up never becomes its own workout.
func buildWarmup(picks []pickedSlot) []domain.WarmupMove {
	var lower, push, pull bool
	for _, pk := range picks {
		switch pk.exercise.Pattern {
		case domain.PatternSquat, domain.PatternHinge, domain.PatternLunge:
			lower = true
		case domain.PatternHorizontalPush, domain.PatternVerticalPush:
			push = true
		case domain.PatternHorizontalPull, domain.PatternVerticalPull:
			pull = true
		case domain.PatternIsolation:
			// Isolation warms up under whichever primary muscle it serves.
			for _, m := range pk.exercise.PrimaryMuscles {
				switch m {
				case domain.MuscleQuads, domain.MuscleHamstrings, domain.MuscleGlutes, domain.MuscleCalves:
					lower = true
				case domain.MuscleChest, domain.MuscleShoulders, domain.MuscleTriceps:
					push = true
				case domain.MuscleBack, domain.MuscleBiceps:
					pull = true
				}
			}
		}
	}

	out := make([]domain.WarmupMove, 0, maxWarmupMoves)
	appendCapped := func(moves []domain.WarmupMove) {
		for _, m := range moves {
			if len(out) >= maxWarmupMoves {
				return
			}
			out = append(out, m)
		}
	}
	appendCapped(warmupGeneral)
	if lower && push && pull {
		// Full-body day: budget the cap across all three blocks instead of
		// letting the lower block crowd out pull prep.
		appendCapped(warmupLower[:2])
		appendCapped(warmupPush[:1])
		appendCapped(warmupPull[:1])
		return out
	}
	if lower {
		appendCapped(warmupLower)
	}
	if push {
		appendCapped(warmupPush)
	}
	if pull {
		appendCapped(warmupPull)
	}
	return out
}
