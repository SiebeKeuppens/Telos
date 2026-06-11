// Package analytics holds the pure numeric transforms shared by the engine
// and the dashboard layer: 1RM estimation, load prescription, and trend
// smoothing. Keeping them here (not in SQL, not in handlers) is deliberate —
// both clients consume the same numbers through the API.
package analytics

import "math"

// EstimateOneRM estimates a one-rep max from a set using the Epley formula,
// RPE-adjusted: reps left in reserve count as reps the lifter could have done.
// rpe == 0 means "not recorded" and the set is treated as taken to RPE 10.
func EstimateOneRM(loadKg float64, reps int, rpe float64) float64 {
	if loadKg <= 0 || reps <= 0 {
		return 0
	}
	effective := float64(reps)
	if rpe > 0 && rpe < 10 {
		effective += 10 - rpe // RIR
	}
	if effective <= 1 {
		return loadKg
	}
	return loadKg * (1 + effective/30)
}

// LoadForReps inverts Epley: the load for a target rep count with the given
// reps in reserve.
func LoadForReps(oneRM float64, reps int, rir float64) float64 {
	if oneRM <= 0 || reps <= 0 {
		return 0
	}
	effective := float64(reps) + rir
	return oneRM / (1 + effective/30)
}

// RoundToIncrement rounds a load to the nearest plate-realistic step.
func RoundToIncrement(loadKg, increment float64) float64 {
	if increment <= 0 {
		return loadKg
	}
	return math.Round(loadKg/increment) * increment
}

// SmoothedTrend computes an exponential moving average over a value series
// (e.g. bodyweight by date, oldest first). alpha 0.25 tracks genuine change
// over ~a week while damping day-to-day water-weight noise.
func SmoothedTrend(values []float64, alpha float64) []float64 {
	if len(values) == 0 {
		return nil
	}
	if alpha <= 0 || alpha > 1 {
		alpha = 0.25
	}
	out := make([]float64, len(values))
	out[0] = values[0]
	for i := 1; i < len(values); i++ {
		out[i] = alpha*values[i] + (1-alpha)*out[i-1]
	}
	return out
}
