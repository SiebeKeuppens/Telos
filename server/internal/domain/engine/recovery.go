package engine

import "telos/server/internal/domain"

// Recovery signals come from daily check-ins (1–5 scales). They can only make
// the program easier — softening today's targets or triggering an early
// deload — never harder. That asymmetry is a product guardrail, not an
// implementation accident.

type recoveryState struct {
	// Score is the mean recovery score over the recent window, 0..1.
	Score float64
	// SustainedPoor: three or more consecutive recent days below the poor
	// threshold — an early-deload signal.
	SustainedPoor bool
	// SoftenToday: the latest check-in (or short-window average) is low
	// enough to ease today's targets (cap RPE, skip load increases).
	SoftenToday bool
	HasData     bool
}

const (
	recoveryWindowDays = 7
	poorThreshold      = 0.45
	softenThreshold    = 0.55
)

// checkInScore maps a check-in to 0..1. Energy, sleep, and motivation count
// up; stress and soreness count down.
func checkInScore(c domain.CheckIn) float64 {
	raw := c.Energy + c.Sleep + c.Motivation + (6 - c.Stress) + (6 - c.Soreness)
	return float64(raw) / 25.0
}

// assessRecovery looks at check-ins within the recent window (chronological
// order in, most recent considered last).
func assessRecovery(checkins []domain.CheckIn, today domain.Date) recoveryState {
	var recent []domain.CheckIn
	for _, c := range checkins {
		age := today.DaysSince(c.Date)
		if age >= 0 && age < recoveryWindowDays {
			recent = append(recent, c)
		}
	}
	if len(recent) == 0 {
		return recoveryState{}
	}

	sum := 0.0
	for _, c := range recent {
		sum += checkInScore(c)
	}
	st := recoveryState{HasData: true, Score: sum / float64(len(recent))}

	// Sustained poor recovery: ≥3 consecutive trailing check-ins below the
	// poor threshold.
	consecutive := 0
	for i := len(recent) - 1; i >= 0; i-- {
		if checkInScore(recent[i]) < poorThreshold {
			consecutive++
		} else {
			break
		}
	}
	st.SustainedPoor = consecutive >= 3

	latest := recent[len(recent)-1]
	if today.DaysSince(latest.Date) <= 1 && checkInScore(latest) < softenThreshold {
		st.SoftenToday = true
	}
	return st
}
