// Package profile maps each training goal to the parameter set the adaptive
// engine consumes. Profiles are pure data: the engine must read them and never
// branch on the goal itself, so new goals can be added by adding a profile.
//
// The numbers below implement the build brief's table (§4) and are tunable
// starting points grounded in common strength-and-conditioning guidance
// (MEV–MAV style volume bands, RPE-based effort targets), not dogma.
package profile

import "telos/server/internal/domain"

type RepRange struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

// VolumeBand is a weekly working-set band per muscle group.
// MEV = minimum effective volume (floor the engine programs at the start of a
// mesocycle), MAV = maximum adaptive volume (ceiling it ramps toward).
type VolumeBand struct {
	MEV int `json:"mev"`
	MAV int `json:"mav"`
}

type Profile struct {
	Goal        domain.Goal `json:"goal"`
	DisplayName string      `json:"displayName"`
	// Summary is the one-line plain-language description shown on goal cards.
	Summary string `json:"summary"`

	FrequencyMin int `json:"frequencyMin"` // sessions/week
	FrequencyMax int `json:"frequencyMax"`

	CompoundReps  RepRange `json:"compoundReps"`
	AccessoryReps RepRange `json:"accessoryReps"`

	// Working-set effort band as RPE (RIR = 10 − RPE). Autoregulation keeps
	// sessions inside this band; the deload cap is below TargetRPEMin.
	TargetRPEMin float64 `json:"targetRpeMin"`
	TargetRPEMax float64 `json:"targetRpeMax"`

	RestCompoundSec  int `json:"restCompoundSec"`
	RestIsolationSec int `json:"restIsolationSec"`

	// Weekly working sets per muscle group.
	Volume map[domain.MuscleGroup]VolumeBand `json:"volume"`

	// SplitForDays picks the split style for a given training frequency.
	SplitForDays map[int]domain.SplitStyle `json:"splitForDays"`

	// DeloadIntervalWeeks is the scheduled mesocycle length: after this many
	// loading weeks the engine programs a deload week (it can also trigger one
	// early — see engine/deload.go).
	DeloadIntervalWeeks int `json:"deloadIntervalWeeks"`

	// Linear-progression load steps (used mainly for beginners).
	UpperIncrementKg float64 `json:"upperIncrementKg"`
	LowerIncrementKg float64 `json:"lowerIncrementKg"`

	// WeeklyAccessorySetRamp: sets added per muscle per accumulation week
	// (intermediate/advanced volume progression), ramping MEV → MAV.
	WeeklyAccessorySetRamp int `json:"weeklyAccessorySetRamp"`

	// UseIntensityTechniques marks goals (bodybuilding) whose final accessory
	// set may be taken closer to failure / extended (engine adds a note rather
	// than forcing it).
	UseIntensityTechniques bool `json:"useIntensityTechniques"`

	// EnergyAdjustPct shifts the daily-energy estimate above maintenance to
	// support the goal (0 = maintenance). Never negative — Telos does not
	// prescribe deficits (wellbeing guardrail).
	EnergyAdjustPct float64 `json:"energyAdjustPct"`
}

// ForGoal returns the profile for a goal; ok is false for unknown goals.
func ForGoal(g domain.Goal) (Profile, bool) {
	p, ok := profiles[g]
	return p, ok
}

// All returns every registered profile in stable goal order.
func All() []Profile {
	out := make([]Profile, 0, len(order))
	for _, g := range order {
		out = append(out, profiles[g])
	}
	return out
}

var order = []domain.Goal{
	domain.GoalStayFit, domain.GoalBuildMuscle, domain.GoalStrength, domain.GoalBodybuilding,
}

// volumes builds a per-muscle band map from a default band plus overrides, so
// each goal states its emphasis without repeating all ten muscle groups.
func volumes(def VolumeBand, overrides map[domain.MuscleGroup]VolumeBand) map[domain.MuscleGroup]VolumeBand {
	m := make(map[domain.MuscleGroup]VolumeBand, len(domain.AllMuscleGroups))
	for _, mg := range domain.AllMuscleGroups {
		if v, ok := overrides[mg]; ok {
			m[mg] = v
		} else {
			m[mg] = def
		}
	}
	return m
}

var profiles = map[domain.Goal]Profile{
	domain.GoalStayFit: {
		Goal:        domain.GoalStayFit,
		DisplayName: "Stay Fit",
		Summary:     "Consistent full-body training, 2–4 days a week at a comfortable, sustainable effort.",
		FrequencyMin: 2, FrequencyMax: 4,
		CompoundReps:  RepRange{8, 12},
		AccessoryReps: RepRange{10, 15},
		TargetRPEMin:  6, TargetRPEMax: 8,
		RestCompoundSec: 105, RestIsolationSec: 60,
		Volume: volumes(VolumeBand{MEV: 4, MAV: 8}, map[domain.MuscleGroup]VolumeBand{
			domain.MuscleQuads: {MEV: 5, MAV: 9}, domain.MuscleBack: {MEV: 5, MAV: 9},
			domain.MuscleBiceps: {MEV: 2, MAV: 6}, domain.MuscleTriceps: {MEV: 2, MAV: 6},
			domain.MuscleCalves: {MEV: 2, MAV: 6},
		}),
		SplitForDays: map[int]domain.SplitStyle{
			2: domain.SplitFullBody, 3: domain.SplitFullBody, 4: domain.SplitFullBody,
		},
		DeloadIntervalWeeks: 6,
		UpperIncrementKg:    2.5, LowerIncrementKg: 5,
		WeeklyAccessorySetRamp: 1,
		EnergyAdjustPct:        0, // maintenance — staying fit needs no surplus
	},

	domain.GoalBuildMuscle: {
		Goal:        domain.GoalBuildMuscle,
		DisplayName: "Build Muscle",
		Summary:     "Hypertrophy focus: 3–5 days a week, moderate-to-hard sets with steadily rising volume.",
		FrequencyMin: 3, FrequencyMax: 5,
		CompoundReps:  RepRange{6, 10},
		AccessoryReps: RepRange{8, 15},
		TargetRPEMin:  7, TargetRPEMax: 9,
		RestCompoundSec: 150, RestIsolationSec: 75,
		Volume: volumes(VolumeBand{MEV: 8, MAV: 16}, map[domain.MuscleGroup]VolumeBand{
			domain.MuscleCalves: {MEV: 4, MAV: 10}, domain.MuscleCore: {MEV: 4, MAV: 10},
			domain.MuscleGlutes: {MEV: 6, MAV: 12},
		}),
		SplitForDays: map[int]domain.SplitStyle{
			3: domain.SplitFullBody, 4: domain.SplitUpperLower, 5: domain.SplitUpperLower,
		},
		DeloadIntervalWeeks: 5,
		UpperIncrementKg:    2.5, LowerIncrementKg: 5,
		WeeklyAccessorySetRamp: 2,
		EnergyAdjustPct:        0.10, // modest surplus supports muscle growth
	},

	domain.GoalStrength: {
		Goal:        domain.GoalStrength,
		DisplayName: "Strength",
		Summary:     "Heavy compound lifts, 3–4 days a week, low reps with long rests and careful progression.",
		FrequencyMin: 3, FrequencyMax: 4,
		CompoundReps:  RepRange{3, 6},
		AccessoryReps: RepRange{6, 10},
		TargetRPEMin:  7, TargetRPEMax: 9,
		RestCompoundSec: 240, RestIsolationSec: 90,
		Volume: volumes(VolumeBand{MEV: 6, MAV: 10}, map[domain.MuscleGroup]VolumeBand{
			domain.MuscleBiceps: {MEV: 2, MAV: 5}, domain.MuscleTriceps: {MEV: 3, MAV: 6},
			domain.MuscleCalves: {MEV: 0, MAV: 4}, domain.MuscleCore: {MEV: 3, MAV: 6},
		}),
		SplitForDays: map[int]domain.SplitStyle{
			3: domain.SplitFullBody, 4: domain.SplitUpperLower,
		},
		DeloadIntervalWeeks: 4,
		UpperIncrementKg:    2.5, LowerIncrementKg: 5,
		WeeklyAccessorySetRamp: 1,
		EnergyAdjustPct:        0.05, // small surplus fuels heavy work
	},

	domain.GoalBodybuilding: {
		Goal:        domain.GoalBodybuilding,
		DisplayName: "Bodybuilding",
		Summary:     "High-volume body-part training, 4–6 days a week, with intensity techniques and symmetry focus.",
		FrequencyMin: 4, FrequencyMax: 6,
		CompoundReps:  RepRange{6, 12},
		AccessoryReps: RepRange{10, 20},
		TargetRPEMin:  7, TargetRPEMax: 9.5,
		RestCompoundSec: 150, RestIsolationSec: 75,
		Volume: volumes(VolumeBand{MEV: 10, MAV: 20}, map[domain.MuscleGroup]VolumeBand{
			domain.MuscleCalves: {MEV: 6, MAV: 12}, domain.MuscleCore: {MEV: 4, MAV: 10},
		}),
		SplitForDays: map[int]domain.SplitStyle{
			4: domain.SplitUpperLower, 5: domain.SplitPushPullLegs, 6: domain.SplitPushPullLegs,
		},
		DeloadIntervalWeeks: 5,
		UpperIncrementKg:    2.5, LowerIncrementKg: 5,
		WeeklyAccessorySetRamp: 2,
		UseIntensityTechniques: true,
		EnergyAdjustPct:        0.10, // high volume needs fueling
	},
}

// ClampDays clamps a requested training frequency into the profile's band.
func (p Profile) ClampDays(days int) int {
	if days < p.FrequencyMin {
		return p.FrequencyMin
	}
	if days > p.FrequencyMax {
		return p.FrequencyMax
	}
	return days
}

// Split returns the split style for the given (already clamped) frequency,
// falling back to full-body if the profile has no explicit mapping.
func (p Profile) Split(days int) domain.SplitStyle {
	if s, ok := p.SplitForDays[days]; ok {
		return s
	}
	return domain.SplitFullBody
}
