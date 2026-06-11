package analytics

// Daily-energy estimation. Wellbeing framing is part of the contract here:
// these produce a maintenance ESTIMATE plus a goal-support range. Small
// deficits are permitted (owner decision 2026-06-11, amending brief §13) but
// clamped to a modest band — Telos guides, it never pushes extremes.

// BMR estimates basal metabolic rate via Mifflin-St Jeor.
// sex is "male", "female", or "" (unspecified → the two constants averaged,
// which stays within ~80 kcal of either).
func BMR(weightKg float64, heightCm, age int, sex string) float64 {
	if weightKg <= 0 || heightCm <= 0 || age <= 0 {
		return 0
	}
	base := 10*weightKg + 6.25*float64(heightCm) - 5*float64(age)
	switch sex {
	case "male":
		return base + 5
	case "female":
		return base - 161
	default:
		return base - 78
	}
}

// SessionKcal estimates the energy cost of one resistance-training session
// from its duration. ~4.5 METs covers typical lifting including rest between
// sets; kcal = MET × weight(kg) × hours.
func SessionKcal(weightKg float64, durationMinutes float64) float64 {
	if weightKg <= 0 || durationMinutes <= 0 {
		return 0
	}
	const met = 4.5
	return met * weightKg * durationMinutes / 60
}

// MaintenanceKcal combines BMR with a sedentary baseline plus the user's
// ACTUAL average daily training energy — so the estimate adapts to what they
// log, not what they planned. Result is rounded to the nearest 25 kcal.
func MaintenanceKcal(bmr, avgDailyExerciseKcal float64) float64 {
	if bmr <= 0 {
		return 0
	}
	const sedentaryFactor = 1.2 // non-exercise daily living
	return RoundToIncrement(bmr*sedentaryFactor+avgDailyExerciseKcal, 25)
}

// GoalRange applies the training profile's energy adjustment on top of
// maintenance and widens it into an honest range (estimates this coarse
// should not pretend to single-kcal precision). adjustPct is clamped to
// [−15%, +25%]: small deficits are fine, extremes are not.
func GoalRange(maintenance, adjustPct float64) (low, high float64) {
	if maintenance <= 0 {
		return 0, 0
	}
	if adjustPct < -0.15 {
		adjustPct = -0.15
	}
	if adjustPct > 0.25 {
		adjustPct = 0.25
	}
	center := maintenance * (1 + adjustPct)
	return RoundToIncrement(center-125, 25), RoundToIncrement(center+125, 25)
}
