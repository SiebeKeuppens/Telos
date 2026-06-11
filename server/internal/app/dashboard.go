package app

import (
	"context"
	"sort"
	"time"

	"telos/server/internal/cache"
	"telos/server/internal/domain"
	"telos/server/internal/domain/analytics"
	"telos/server/internal/domain/profile"
)

// Dashboard aggregates are computed here in Go (per the brief: derived logic
// lives in the domain layer, not SQL) and cached in Redis until invalidated
// by a write.

type Dashboard struct {
	RecentWorkouts []RecentWorkout  `json:"recentWorkouts"`
	Bodyweight     BodyweightTrend  `json:"bodyweight"`
	Recovery       RecoveryTrend    `json:"recovery"`
	WeeklyVolume   []WeekVolume     `json:"weeklyVolume"`
	E1RM           []ExerciseE1RM   `json:"e1rm"`
	Energy         EnergyEstimate   `json:"energy"`
}

// EnergyEstimate is the daily-energy guide: a maintenance estimate plus a
// goal-support range derived from the training profile. Deliberately a range
// and deliberately never below maintenance — it's information, not a diet.
type EnergyEstimate struct {
	Available bool `json:"available"`
	// Missing lists what's needed to compute: "weight", "height", "birthYear".
	Missing            []string `json:"missing"`
	MaintenanceKcal    float64  `json:"maintenanceKcal"`
	TargetKcalLow      float64  `json:"targetKcalLow"`
	TargetKcalHigh     float64  `json:"targetKcalHigh"`
	GoalAdjustPct      float64  `json:"goalAdjustPct"`
	TrainingKcalPerDay float64  `json:"trainingKcalPerDay"`
}

type RecentWorkout struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Date      domain.Date `json:"date"`
	Exercises int         `json:"exercises"`
	Sets      int         `json:"sets"`
	VolumeKg  float64     `json:"volumeKg"`
}

type WeightPoint struct {
	Date     domain.Date `json:"date"`
	WeightKg float64     `json:"weightKg"`
}

type BodyweightTrend struct {
	Entries []WeightPoint `json:"entries"` // raw points
	Trend   []WeightPoint `json:"trend"`   // smoothed (EMA)
}

type RecoveryTrend struct {
	CheckIns  []domain.CheckIn `json:"checkins"`
	AvgScore7 float64          `json:"avgScore7"` // 0..1 over last 7 days
}

type WeekVolume struct {
	WeekStart    domain.Date                    `json:"weekStart"`
	SetsByMuscle map[domain.MuscleGroup]float64 `json:"setsByMuscle"`
	TotalSets    int                            `json:"totalSets"`
}

type E1RMPoint struct {
	Date   domain.Date `json:"date"`
	E1RMKg float64     `json:"e1rmKg"`
}

type ExerciseE1RM struct {
	ExerciseID string      `json:"exerciseId"`
	Name       string      `json:"name"`
	Points     []E1RMPoint `json:"points"`
}

func (s *Service) GetDashboard(ctx context.Context, uid string) (Dashboard, error) {
	var dash Dashboard
	if s.cache.GetJSON(ctx, cache.KeyDashboard(uid), &dash) {
		return dash, nil
	}

	now := s.now()
	today := domain.NewDate(now)

	completed, err := s.store.ListCompletedSince(ctx, uid, now.AddDate(0, 0, -90))
	if err != nil {
		return Dashboard{}, err
	}
	weights, err := s.store.ListBodyweightSince(ctx, uid, today.AddDays(-90))
	if err != nil {
		return Dashboard{}, err
	}
	checkins, err := s.store.ListCheckInsSince(ctx, uid, today.AddDays(-30))
	if err != nil {
		return Dashboard{}, err
	}

	dash.RecentWorkouts = recentWorkouts(completed, 5)
	dash.Bodyweight = bodyweightTrend(weights)
	dash.Recovery = recoveryTrend(checkins, today)
	dash.WeeklyVolume = s.weeklyVolume(completed, today, 8)
	dash.E1RM = s.e1rmSeries(completed, 4)
	dash.Energy = s.energyEstimate(ctx, uid, weights, completed, now)

	s.cache.SetJSON(ctx, cache.KeyDashboard(uid), dash, 10*time.Minute)
	return dash, nil
}

func recentWorkouts(completed []domain.Workout, limit int) []RecentWorkout {
	out := make([]RecentWorkout, 0, limit)
	for i := len(completed) - 1; i >= 0 && len(out) < limit; i-- {
		w := completed[i]
		rw := RecentWorkout{ID: w.ID, Name: w.Name, Exercises: len(w.Exercises)}
		if w.CompletedAt != nil {
			rw.Date = domain.NewDate(*w.CompletedAt)
		}
		for _, we := range w.Exercises {
			for _, st := range we.Sets {
				if !st.Completed {
					continue
				}
				rw.Sets++
				rw.VolumeKg += st.LoadKg * float64(st.Reps)
			}
		}
		out = append(out, rw)
	}
	return out
}

func bodyweightTrend(entries []domain.BodyweightEntry) BodyweightTrend {
	bt := BodyweightTrend{Entries: []WeightPoint{}, Trend: []WeightPoint{}}
	if len(entries) == 0 {
		return bt
	}
	values := make([]float64, len(entries))
	for i, e := range entries {
		bt.Entries = append(bt.Entries, WeightPoint{Date: e.Date, WeightKg: e.WeightKg})
		values[i] = e.WeightKg
	}
	smoothed := analytics.SmoothedTrend(values, 0.25)
	for i, v := range smoothed {
		bt.Trend = append(bt.Trend, WeightPoint{Date: entries[i].Date, WeightKg: round1(v)})
	}
	return bt
}

func recoveryTrend(checkins []domain.CheckIn, today domain.Date) RecoveryTrend {
	rt := RecoveryTrend{CheckIns: checkins}
	if rt.CheckIns == nil {
		rt.CheckIns = []domain.CheckIn{}
	}
	sum, n := 0.0, 0
	for _, c := range checkins {
		if age := today.DaysSince(c.Date); age >= 0 && age < 7 {
			raw := c.Energy + c.Sleep + c.Motivation + (6 - c.Stress) + (6 - c.Soreness)
			sum += float64(raw) / 25.0
			n++
		}
	}
	if n > 0 {
		rt.AvgScore7 = round2(sum / float64(n))
	}
	return rt
}

// weeklyVolume buckets completed working sets per muscle by ISO-ish weeks
// anchored to today (trailing windows of 7 days).
func (s *Service) weeklyVolume(completed []domain.Workout, today domain.Date, weeks int) []WeekVolume {
	out := make([]WeekVolume, weeks)
	// Monday-anchored trailing weeks, oldest first.
	monday := today.AddDays(-((int(today.Time().Weekday()) + 6) % 7))
	for i := range out {
		out[i].WeekStart = monday.AddDays(-7 * (weeks - 1 - i))
		out[i].SetsByMuscle = map[domain.MuscleGroup]float64{}
	}

	for _, w := range completed {
		if w.CompletedAt == nil {
			continue
		}
		d := domain.NewDate(*w.CompletedAt)
		idx := -1
		for i := range out {
			if !d.Before(out[i].WeekStart) && d.Before(out[i].WeekStart.AddDays(7)) {
				idx = i
				break
			}
		}
		if idx < 0 {
			continue
		}
		for _, we := range w.Exercises {
			ex, ok := s.lib[we.ExerciseID]
			if !ok {
				continue
			}
			n := 0
			for _, st := range we.Sets {
				if st.Completed {
					n++
				}
			}
			out[idx].TotalSets += n
			for _, m := range ex.PrimaryMuscles {
				out[idx].SetsByMuscle[m] += float64(n)
			}
			for _, m := range ex.SecondaryMuscles {
				out[idx].SetsByMuscle[m] += float64(n) * 0.5
			}
		}
	}
	return out
}

// e1rmSeries tracks estimated 1RM over time for the user's most-trained
// loaded exercises.
func (s *Service) e1rmSeries(completed []domain.Workout, limit int) []ExerciseE1RM {
	type bucket struct {
		count  int
		points []E1RMPoint
	}
	buckets := map[string]*bucket{}
	for _, w := range completed {
		if w.CompletedAt == nil {
			continue
		}
		date := domain.NewDate(*w.CompletedAt)
		for _, we := range w.Exercises {
			best := 0.0
			for _, st := range we.Sets {
				if !st.Completed || st.LoadKg <= 0 {
					continue
				}
				rpe := 0.0
				if st.RPE != nil {
					rpe = *st.RPE
				}
				if e := analytics.EstimateOneRM(st.LoadKg, st.Reps, rpe); e > best {
					best = e
				}
			}
			if best <= 0 {
				continue
			}
			b := buckets[we.ExerciseID]
			if b == nil {
				b = &bucket{}
				buckets[we.ExerciseID] = b
			}
			b.count++
			b.points = append(b.points, E1RMPoint{Date: date, E1RMKg: round1(best)})
		}
	}

	ids := make([]string, 0, len(buckets))
	for id := range buckets {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		if buckets[ids[i]].count != buckets[ids[j]].count {
			return buckets[ids[i]].count > buckets[ids[j]].count
		}
		return ids[i] < ids[j]
	})
	if len(ids) > limit {
		ids = ids[:limit]
	}

	out := make([]ExerciseE1RM, 0, len(ids))
	for _, id := range ids {
		name := id
		if ex, ok := s.lib[id]; ok {
			name = ex.Name
		}
		out = append(out, ExerciseE1RM{ExerciseID: id, Name: name, Points: buckets[id].points})
	}
	return out
}

// energyEstimate builds the daily-energy guide from the latest weight, the
// user's optional body details, and the training they ACTUALLY logged over
// the trailing week (so a deload week naturally reads lower).
func (s *Service) energyEstimate(ctx context.Context, uid string,
	weights []domain.BodyweightEntry, completed []domain.Workout, now time.Time) EnergyEstimate {

	est := EnergyEstimate{Missing: []string{}}

	user, err := s.store.GetUser(ctx, uid)
	if err != nil {
		est.Missing = append(est.Missing, "profile")
		return est
	}

	var weightKg float64
	if len(weights) > 0 {
		weightKg = weights[len(weights)-1].WeightKg
	} else {
		est.Missing = append(est.Missing, "weight")
	}
	if user.HeightCm == nil {
		est.Missing = append(est.Missing, "height")
	}
	if user.BirthYear == nil {
		est.Missing = append(est.Missing, "birthYear")
	}
	if len(est.Missing) > 0 {
		return est
	}

	sex := ""
	if user.Sex != nil {
		sex = *user.Sex
	}
	age := now.Year() - *user.BirthYear
	bmr := analytics.BMR(weightKg, *user.HeightCm, age, sex)

	// Average daily training energy from the trailing 7 days of completed
	// sessions. Duration from timestamps when sane, else ~3.5 min per
	// completed set as a fallback.
	weekAgo := now.AddDate(0, 0, -7)
	totalKcal := 0.0
	for _, w := range completed {
		if w.CompletedAt == nil || w.CompletedAt.Before(weekAgo) {
			continue
		}
		minutes := 0.0
		if w.StartedAt != nil {
			minutes = w.CompletedAt.Sub(*w.StartedAt).Minutes()
		}
		if minutes < 15 || minutes > 150 {
			sets := 0
			for _, we := range w.Exercises {
				for _, st := range we.Sets {
					if st.Completed {
						sets++
					}
				}
			}
			minutes = float64(sets) * 3.5
		}
		totalKcal += analytics.SessionKcal(weightKg, minutes)
	}

	maintenance := analytics.MaintenanceKcal(bmr, totalKcal/7)

	adjust := 0.0
	if prof, ok := profile.ForGoal(user.Goal); ok {
		adjust = prof.EnergyAdjustPct
	}
	low, high := analytics.GoalRange(maintenance, adjust)

	est.Available = true
	est.MaintenanceKcal = maintenance
	est.TargetKcalLow = low
	est.TargetKcalHigh = high
	est.GoalAdjustPct = adjust
	est.TrainingKcalPerDay = analytics.RoundToIncrement(totalKcal/7, 5)
	return est
}

func round1(v float64) float64 { return float64(int(v*10+0.5)) / 10 }
func round2(v float64) float64 { return float64(int(v*100+0.5)) / 100 }
