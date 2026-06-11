package engine

import (
	"testing"
	"time"

	"telos/server/internal/domain"
	"telos/server/internal/domain/profile"
	"telos/server/internal/seed"
)

// The tests run against the real seeded exercise library: the engine and the
// content ship together, so testing them together catches content regressions
// (e.g. a missing movement pattern) as engine failures.

func testEngine(t *testing.T) *Engine {
	t.Helper()
	lib, err := seed.Exercises()
	if err != nil {
		t.Fatalf("load seed library: %v", err)
	}
	return New(lib)
}

func testUser(goal domain.Goal, exp domain.ExperienceLevel, days int, equip ...domain.Equipment) domain.User {
	if len(equip) == 0 {
		equip = []domain.Equipment{
			domain.EquipBarbell, domain.EquipDumbbell, domain.EquipBench,
			domain.EquipCable, domain.EquipMachine, domain.EquipPullupBar, domain.EquipBand,
		}
	}
	return domain.User{
		UID: "u1", Goal: goal, Experience: exp, DaysPerWeek: days,
		Equipment: equip, Unit: "kg",
	}
}

func mustProfile(t *testing.T, g domain.Goal) profile.Profile {
	t.Helper()
	p, ok := profile.ForGoal(g)
	if !ok {
		t.Fatalf("no profile for %s", g)
	}
	return p
}

func planFor(t *testing.T, e *Engine, in Inputs) PlanResult {
	t.Helper()
	res, err := e.PlanWeek(in)
	if err != nil {
		t.Fatalf("PlanWeek: %v", err)
	}
	return res
}

var monday = domain.Date{Year: 2026, Month: time.June, Day: 1}

// ---- goal differentiation ----

// Two users with different goals must get meaningfully different training —
// the core product thesis.
func TestGoalsProduceDifferentPrograms(t *testing.T) {
	e := testEngine(t)

	stayFit := planFor(t, e, Inputs{
		User: testUser(domain.GoalStayFit, domain.ExperienceBeginner, 3),
		Profile: mustProfile(t, domain.GoalStayFit), Today: monday,
	})
	bb := planFor(t, e, Inputs{
		User: testUser(domain.GoalBodybuilding, domain.ExperienceIntermediate, 5),
		Profile: mustProfile(t, domain.GoalBodybuilding), Today: monday,
	})

	if len(stayFit.Workouts) != 3 {
		t.Errorf("stay_fit should train 3 days, got %d", len(stayFit.Workouts))
	}
	if len(bb.Workouts) != 5 {
		t.Errorf("bodybuilding should train 5 days, got %d", len(bb.Workouts))
	}
	if stayFit.State.Split != domain.SplitFullBody {
		t.Errorf("stay_fit split = %s, want full_body", stayFit.State.Split)
	}
	if bb.State.Split != domain.SplitPushPullLegs {
		t.Errorf("bodybuilding split = %s, want push_pull_legs", bb.State.Split)
	}

	// Weekly volume should differ substantially.
	if sf, b := totalSets(stayFit), totalSets(bb); b < sf*3/2 {
		t.Errorf("bodybuilding weekly sets (%d) should clearly exceed stay_fit (%d)", b, sf)
	}

	// Strength trains low reps on compounds; stay-fit doesn't.
	str := planFor(t, e, Inputs{
		User: testUser(domain.GoalStrength, domain.ExperienceIntermediate, 3),
		Profile: mustProfile(t, domain.GoalStrength), Today: monday,
	})
	for _, w := range str.Workouts {
		for _, ex := range w.Exercises {
			if ex.RepsMin < 1 || ex.RepsMax > 10 {
				t.Errorf("strength rep target %d-%d outside heavy ranges (%s)", ex.RepsMin, ex.RepsMax, ex.ExerciseID)
			}
		}
	}
}

func totalSets(p PlanResult) int {
	n := 0
	for _, w := range p.Workouts {
		for _, ex := range w.Exercises {
			n += ex.Sets
		}
	}
	return n
}

// ---- equipment-driven selection ----

func TestSelectionHonorsEquipment(t *testing.T) {
	e := testEngine(t)
	lib, _ := seed.Exercises()
	byID := map[string]domain.Exercise{}
	for _, ex := range lib {
		byID[ex.ID] = ex
	}

	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceBeginner, 3,
			domain.EquipDumbbell, domain.EquipBench),
		Profile: mustProfile(t, domain.GoalBuildMuscle), Today: monday,
	})

	for _, w := range res.Workouts {
		if len(w.Exercises) == 0 {
			t.Fatalf("day %q has no exercises", w.Name)
		}
		for _, pe := range w.Exercises {
			ex := byID[pe.ExerciseID]
			for _, need := range ex.Equipment {
				switch need {
				case domain.EquipDumbbell, domain.EquipBench, domain.EquipBodyweight:
				default:
					t.Errorf("%s requires %s which the user lacks", ex.ID, need)
				}
			}
		}
	}
}

func TestSubstituteChainRespectsEquipment(t *testing.T) {
	e := testEngine(t)
	sub, ok := e.Substitute("barbell-back-squat", []domain.Equipment{domain.EquipDumbbell})
	if !ok {
		t.Fatal("expected a substitute for barbell-back-squat with dumbbells")
	}
	if sub.ID != "goblet-squat" {
		t.Errorf("substitute = %s, want goblet-squat", sub.ID)
	}
	// No equipment at all → walks the chain to bodyweight.
	sub, ok = e.Substitute("barbell-back-squat", nil)
	if !ok || sub.ID != "bodyweight-squat" {
		t.Errorf("bare substitute = %v %v, want bodyweight-squat", sub.ID, ok)
	}
}

// ---- pattern balance ----

func TestFullBodyDaysBalancePatterns(t *testing.T) {
	e := testEngine(t)
	lib, _ := seed.Exercises()
	byID := map[string]domain.Exercise{}
	for _, ex := range lib {
		byID[ex.ID] = ex
	}
	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalStayFit, domain.ExperienceBeginner, 3),
		Profile: mustProfile(t, domain.GoalStayFit), Today: monday,
	})
	for _, w := range res.Workouts {
		var push, pull, legs bool
		for _, pe := range w.Exercises {
			switch byID[pe.ExerciseID].Pattern {
			case domain.PatternHorizontalPush, domain.PatternVerticalPush:
				push = true
			case domain.PatternHorizontalPull, domain.PatternVerticalPull:
				pull = true
			case domain.PatternSquat, domain.PatternHinge, domain.PatternLunge:
				legs = true
			}
		}
		if !push || !pull || !legs {
			t.Errorf("day %q lacks balance: push=%v pull=%v legs=%v", w.Name, push, pull, legs)
		}
	}
}

// ---- volume bands ----

func TestWeeklyVolumeWithinProfileBands(t *testing.T) {
	e := testEngine(t)
	lib, _ := seed.Exercises()
	byID := map[string]domain.Exercise{}
	for _, ex := range lib {
		byID[ex.ID] = ex
	}
	p := mustProfile(t, domain.GoalBuildMuscle)
	res := planFor(t, e, Inputs{
		User:    testUser(domain.GoalBuildMuscle, domain.ExperienceIntermediate, 4),
		Profile: p, Today: monday,
	})

	weekly := map[domain.MuscleGroup]float64{}
	for _, w := range res.Workouts {
		for _, pe := range w.Exercises {
			ex := byID[pe.ExerciseID]
			for _, m := range ex.PrimaryMuscles {
				weekly[m] += float64(pe.Sets)
			}
			for _, m := range ex.SecondaryMuscles {
				weekly[m] += float64(pe.Sets) * 0.5
			}
		}
	}
	for _, m := range []domain.MuscleGroup{domain.MuscleChest, domain.MuscleBack, domain.MuscleQuads} {
		band := p.Volume[m]
		if weekly[m] < float64(band.MEV)-deficitTolerance-0.5 {
			t.Errorf("muscle %s weekly sets %.1f well below MEV %d", m, weekly[m], band.MEV)
		}
		if weekly[m] > float64(band.MAV)+overshootTolerance+1 {
			t.Errorf("muscle %s weekly sets %.1f well above MAV %d", m, weekly[m], band.MAV)
		}
	}
}

// ---- progression / autoregulation ----

func historyWith(exID string, when time.Time, targetMin, targetMax, sets int,
	loads []float64, reps []int, rpes []float64) CompletedWorkout {
	ce := CompletedExercise{
		ExerciseID: exID, TargetSets: sets,
		TargetRepsMin: targetMin, TargetRepsMax: targetMax,
	}
	for i := range loads {
		s := domain.Set{
			ID: "s", WorkoutExerciseID: "we", SetNumber: i + 1,
			LoadKg: loads[i], Reps: reps[i], Completed: true, LoggedAt: when,
		}
		if rpes != nil {
			r := rpes[i]
			s.RPE = &r
		}
		ce.Sets = append(ce.Sets, s)
	}
	return CompletedWorkout{WorkoutID: "w", CompletedAt: when, Exercises: []CompletedExercise{ce}}
}

func findExercise(p PlanResult, exID string) (PlannedExercise, bool) {
	for _, w := range p.Workouts {
		for _, pe := range w.Exercises {
			if pe.ExerciseID == exID {
				return pe, true
			}
		}
	}
	return PlannedExercise{}, false
}

// All targets hit at low RPE → load goes up by the lower-body increment.
func TestProgressionIncreasesAfterEasySuccess(t *testing.T) {
	e := testEngine(t)
	p := mustProfile(t, domain.GoalBuildMuscle)
	completedAt := monday.AddDays(-2).Time()
	hist := []CompletedWorkout{historyWith("barbell-back-squat", completedAt,
		6, 10, 3, []float64{100, 100, 100}, []int{10, 10, 10}, []float64{7, 7, 7})}

	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceBeginner, 3),
		Profile: p, History: hist, Today: monday,
	})
	pe, ok := findExercise(res, "barbell-back-squat")
	if !ok {
		t.Fatal("squat not planned")
	}
	if pe.TargetLoadKg == nil {
		t.Fatal("expected a load target with history present")
	}
	want := 100 + p.LowerIncrementKg
	if *pe.TargetLoadKg != want {
		t.Errorf("load = %.1f, want %.1f (increase)", *pe.TargetLoadKg, want)
	}
}

// Targets met at max-effort RPE → hold, don't add load.
func TestProgressionHoldsAtHighRPE(t *testing.T) {
	e := testEngine(t)
	completedAt := monday.AddDays(-2).Time()
	hist := []CompletedWorkout{historyWith("barbell-back-squat", completedAt,
		6, 10, 3, []float64{100, 100, 100}, []int{10, 10, 10}, []float64{9.5, 9.5, 9.5})}

	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceBeginner, 3),
		Profile: mustProfile(t, domain.GoalBuildMuscle), History: hist, Today: monday,
	})
	pe, _ := findExercise(res, "barbell-back-squat")
	if pe.TargetLoadKg == nil || *pe.TargetLoadKg != 100 {
		t.Errorf("load should hold at 100, got %v", pe.TargetLoadKg)
	}
}

// Missed reps at high RPE → reduce ~10%.
func TestProgressionReducesAfterHardMiss(t *testing.T) {
	e := testEngine(t)
	completedAt := monday.AddDays(-2).Time()
	hist := []CompletedWorkout{historyWith("barbell-back-squat", completedAt,
		6, 10, 3, []float64{100, 100, 100}, []int{6, 5, 4}, []float64{9.5, 10, 10})}

	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceBeginner, 3),
		Profile: mustProfile(t, domain.GoalBuildMuscle), History: hist, Today: monday,
	})
	pe, _ := findExercise(res, "barbell-back-squat")
	if pe.TargetLoadKg == nil || *pe.TargetLoadKg != 90 {
		t.Errorf("load should reduce to 90, got %v", pe.TargetLoadKg)
	}
}

// No history → no load prescription, but a helpful starting note.
func TestNewExerciseHasNoLoadTarget(t *testing.T) {
	e := testEngine(t)
	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceBeginner, 3),
		Profile: mustProfile(t, domain.GoalBuildMuscle), Today: monday,
	})
	pe, ok := findExercise(res, "barbell-back-squat")
	if !ok {
		t.Fatal("squat not planned")
	}
	if pe.TargetLoadKg != nil {
		t.Errorf("fresh exercise should have nil load, got %v", *pe.TargetLoadKg)
	}
	if pe.NoteCode != "first_time" {
		t.Errorf("fresh exercise note code = %q, want first_time", pe.NoteCode)
	}
}

// ---- deload ----

// Scheduled: enough weeks past the anchor lands on the deload slot with
// halved sets and an RPE cap.
func TestScheduledDeload(t *testing.T) {
	e := testEngine(t)
	p := mustProfile(t, domain.GoalBuildMuscle) // 5 loading weeks + deload
	started := monday.AddDays(-7 * 5).Time()    // week 6 = deload
	prog := &domain.Program{
		Goal: domain.GoalBuildMuscle, Split: domain.SplitFullBody, DaysPerWeek: 3,
		StartedAt: started,
	}
	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceBeginner, 3),
		Profile: p, Program: prog, Today: monday,
	})
	if res.State.Phase != domain.PhaseDeload {
		t.Fatalf("phase = %s, want deload (meso week %d)", res.State.Phase, res.State.MesocycleWeek)
	}
	for _, w := range res.Workouts {
		for _, pe := range w.Exercises {
			if pe.TargetRPE > 6 {
				t.Errorf("deload RPE %f > 6 on %s", pe.TargetRPE, pe.ExerciseID)
			}
			if pe.Sets > 3 {
				t.Errorf("deload sets %d look unhalved on %s", pe.Sets, pe.ExerciseID)
			}
		}
	}
}

// Sustained poor recovery mid-mesocycle triggers an early deload — recovery
// can ease the program (guardrail), and the note explains it supportively.
func TestRecoveryTriggersEarlyDeload(t *testing.T) {
	e := testEngine(t)
	started := monday.AddDays(-7 * 2).Time() // mesocycle week 3
	prog := &domain.Program{
		Goal: domain.GoalBuildMuscle, Split: domain.SplitFullBody, DaysPerWeek: 3,
		StartedAt: started,
	}
	var checkins []domain.CheckIn
	for i := 3; i >= 1; i-- {
		checkins = append(checkins, domain.CheckIn{
			Date: monday.AddDays(-i), Energy: 1, Stress: 5, Sleep: 1, Motivation: 2, Soreness: 5,
		})
	}
	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceBeginner, 3),
		Profile: mustProfile(t, domain.GoalBuildMuscle),
		Program: prog, CheckIns: checkins, Today: monday,
	})
	if res.State.Phase != domain.PhaseDeload {
		t.Fatalf("sustained poor recovery should trigger deload, got %s", res.State.Phase)
	}
	if len(res.Notes) == 0 || res.Notes[0] != NoteDeloadRecovery {
		t.Errorf("early deload should carry the recovery note code, got %v", res.Notes)
	}
}

// ---- dynamic warmup ----

// Every session opens with a warmup matched to what the day trains.
func TestWarmupMatchesDayPatterns(t *testing.T) {
	e := testEngine(t)
	lib, _ := seed.Exercises()
	byID := map[string]domain.Exercise{}
	for _, ex := range lib {
		byID[ex.ID] = ex
	}
	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceIntermediate, 4),
		Profile: mustProfile(t, domain.GoalBuildMuscle), Today: monday,
	})
	for _, w := range res.Workouts {
		if len(w.Warmup) < 3 || len(w.Warmup) > 6 {
			t.Errorf("%s: warmup has %d moves, want 3–6", w.Name, len(w.Warmup))
		}
		// General prep always leads.
		if w.Warmup[0].Name != "jumping_jacks" {
			t.Errorf("%s: warmup should open with the pulse-raiser, got %s", w.Name, w.Warmup[0].Name)
		}
		// Lower-body days must include leg prep; upper days must not.
		hasLowerWork := false
		for _, pe := range w.Exercises {
			switch byID[pe.ExerciseID].Pattern {
			case domain.PatternSquat, domain.PatternHinge, domain.PatternLunge:
				hasLowerWork = true
			}
		}
		hasLegSwings := false
		for _, m := range w.Warmup {
			if m.Name == "leg_swings" {
				hasLegSwings = true
			}
		}
		if hasLowerWork != hasLegSwings {
			t.Errorf("%s: lower work %v but leg prep %v", w.Name, hasLowerWork, hasLegSwings)
		}
	}
}

// ---- split preference ----

// A user-chosen muscle-pair split overrides the profile default when the
// frequency allows it; incompatible choices fall back quietly.
func TestSplitPreference(t *testing.T) {
	e := testEngine(t)
	pair := domain.SplitBodyPart

	user := testUser(domain.GoalBuildMuscle, domain.ExperienceIntermediate, 4)
	user.SplitPreference = &pair
	res := planFor(t, e, Inputs{
		User: user, Profile: mustProfile(t, domain.GoalBuildMuscle), Today: monday,
	})
	if res.State.Split != domain.SplitBodyPart {
		t.Fatalf("split = %s, want body_part (preference honored)", res.State.Split)
	}
	names := make([]string, 0, len(res.Workouts))
	for _, w := range res.Workouts {
		names = append(names, w.Name)
	}
	if len(names) != 4 || names[0] != "Chest + Triceps" || names[1] != "Back + Biceps" {
		t.Errorf("pair-split day names = %v", names)
	}

	// 3 days can't carry a pair split → profile default applies.
	user3 := testUser(domain.GoalBuildMuscle, domain.ExperienceIntermediate, 3)
	user3.SplitPreference = &pair
	res3 := planFor(t, e, Inputs{
		User: user3, Profile: mustProfile(t, domain.GoalBuildMuscle), Today: monday,
	})
	if res3.State.Split == domain.SplitBodyPart {
		t.Error("3-day pair split should fall back to the profile default")
	}
}

// Pair-split days stay on their focus muscles and the week still covers the
// whole body within volume bands.
func TestBodyPartSplitFocusAndCoverage(t *testing.T) {
	e := testEngine(t)
	lib, _ := seed.Exercises()
	byID := map[string]domain.Exercise{}
	for _, ex := range lib {
		byID[ex.ID] = ex
	}
	pair := domain.SplitBodyPart
	user := testUser(domain.GoalBodybuilding, domain.ExperienceIntermediate, 5)
	user.SplitPreference = &pair
	res := planFor(t, e, Inputs{
		User: user, Profile: mustProfile(t, domain.GoalBodybuilding), Today: monday,
	})
	if len(res.Workouts) != 5 {
		t.Fatalf("want 5 days, got %d", len(res.Workouts))
	}

	// Chest day trains chest/triceps (plus incidental secondaries), not legs.
	chestDay := res.Workouts[0]
	for _, pe := range chestDay.Exercises {
		for _, m := range byID[pe.ExerciseID].PrimaryMuscles {
			if m == domain.MuscleQuads || m == domain.MuscleHamstrings || m == domain.MuscleGlutes {
				t.Errorf("chest day includes lower-body primary %s (%s)", m, pe.ExerciseID)
			}
		}
	}

	// Weekly coverage: every muscle group gets trained.
	weekly := map[domain.MuscleGroup]float64{}
	for _, w := range res.Workouts {
		for _, pe := range w.Exercises {
			for _, m := range byID[pe.ExerciseID].PrimaryMuscles {
				weekly[m] += float64(pe.Sets)
			}
			for _, m := range byID[pe.ExerciseID].SecondaryMuscles {
				weekly[m] += float64(pe.Sets) * 0.5
			}
		}
	}
	for _, m := range domain.AllMuscleGroups {
		if weekly[m] <= 0 {
			t.Errorf("muscle %s gets zero weekly volume on the pair split", m)
		}
	}
}

// Two stalled lifts trigger an early deload.
func TestStallsTriggerEarlyDeload(t *testing.T) {
	e := testEngine(t)
	started := monday.AddDays(-7 * 2).Time()
	prog := &domain.Program{
		Goal: domain.GoalBuildMuscle, Split: domain.SplitFullBody, DaysPerWeek: 3,
		StartedAt: started,
	}
	var hist []CompletedWorkout
	for i := 3; i >= 1; i-- {
		when := monday.AddDays(-i * 4).Time()
		hist = append(hist,
			historyWith("barbell-back-squat", when, 6, 10, 3,
				[]float64{100, 100, 100}, []int{6, 5, 5}, []float64{9.5, 10, 10}),
			historyWith("barbell-bench-press", when, 6, 10, 3,
				[]float64{80, 80, 80}, []int{6, 5, 5}, []float64{9.5, 10, 10}))
	}
	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceBeginner, 3),
		Profile: mustProfile(t, domain.GoalBuildMuscle),
		Program: prog, History: hist, Today: monday,
	})
	if res.State.Phase != domain.PhaseDeload {
		t.Fatalf("two stalled lifts should trigger deload, got %s", res.State.Phase)
	}
}

// A poor check-in eases today's plan: capped RPE, no load increase — but
// never a deload before mid-mesocycle.
func TestRecoverySoftensWithoutDeload(t *testing.T) {
	e := testEngine(t)
	p := mustProfile(t, domain.GoalBuildMuscle)
	started := monday.AddDays(-7).Time() // week 2: too early for triggered deload
	prog := &domain.Program{
		Goal: domain.GoalBuildMuscle, Split: domain.SplitFullBody, DaysPerWeek: 3,
		StartedAt: started,
	}
	completedAt := monday.AddDays(-2).Time()
	hist := []CompletedWorkout{historyWith("barbell-back-squat", completedAt,
		6, 10, 3, []float64{100, 100, 100}, []int{10, 10, 10}, []float64{7, 7, 7})}
	checkins := []domain.CheckIn{{
		Date: monday, Energy: 2, Stress: 4, Sleep: 2, Motivation: 2, Soreness: 4,
	}}
	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceBeginner, 3),
		Profile: p, Program: prog, History: hist, CheckIns: checkins, Today: monday,
	})
	if res.State.Phase == domain.PhaseDeload {
		t.Fatal("single poor check-in must not deload in week 2")
	}
	pe, _ := findExercise(res, "barbell-back-squat")
	if pe.TargetLoadKg != nil && *pe.TargetLoadKg > 100 {
		t.Errorf("soften day must not increase load, got %.1f", *pe.TargetLoadKg)
	}
	if pe.TargetRPE > p.TargetRPEMin+0.5 {
		t.Errorf("soften day RPE %.1f above eased cap", pe.TargetRPE)
	}
}

// ---- periodization by experience ----

func TestExperiencePicksPeriodizationModel(t *testing.T) {
	e := testEngine(t)
	cases := []struct {
		exp   domain.ExperienceLevel
		phase domain.ProgramPhase
	}{
		{domain.ExperienceBeginner, domain.PhaseLinear},
		{domain.ExperienceIntermediate, domain.PhaseUndulating},
		{domain.ExperienceAdvanced, domain.PhaseAccumulation},
	}
	for _, c := range cases {
		res := planFor(t, e, Inputs{
			User: testUser(domain.GoalBuildMuscle, c.exp, 3),
			Profile: mustProfile(t, domain.GoalBuildMuscle), Today: monday,
		})
		if res.State.Phase != c.phase {
			t.Errorf("%s: phase = %s, want %s", c.exp, res.State.Phase, c.phase)
		}
	}
}

// Advanced block periodization reaches intensification late in the mesocycle.
func TestAdvancedBlockReachesIntensification(t *testing.T) {
	e := testEngine(t)
	started := monday.AddDays(-7 * 3).Time() // meso week 4 of 5+1 → intensification
	prog := &domain.Program{
		Goal: domain.GoalBuildMuscle, Split: domain.SplitFullBody, DaysPerWeek: 3,
		StartedAt: started,
	}
	res := planFor(t, e, Inputs{
		User: testUser(domain.GoalBuildMuscle, domain.ExperienceAdvanced, 3),
		Profile: mustProfile(t, domain.GoalBuildMuscle), Program: prog, Today: monday,
	})
	if res.State.Phase != domain.PhaseIntensification {
		t.Errorf("meso week 4 advanced: phase = %s, want intensification", res.State.Phase)
	}
}

// ---- determinism ----

func TestPlanningIsDeterministic(t *testing.T) {
	e := testEngine(t)
	in := Inputs{
		User: testUser(domain.GoalBodybuilding, domain.ExperienceIntermediate, 5),
		Profile: mustProfile(t, domain.GoalBodybuilding), Today: monday,
	}
	a := planFor(t, e, in)
	b := planFor(t, e, in)
	if len(a.Workouts) != len(b.Workouts) {
		t.Fatal("nondeterministic day count")
	}
	for i := range a.Workouts {
		if len(a.Workouts[i].Exercises) != len(b.Workouts[i].Exercises) {
			t.Fatalf("day %d: nondeterministic exercise count", i)
		}
		for j := range a.Workouts[i].Exercises {
			ax, bx := a.Workouts[i].Exercises[j], b.Workouts[i].Exercises[j]
			if ax.ExerciseID != bx.ExerciseID || ax.Sets != bx.Sets {
				t.Errorf("day %d slot %d differs: %s/%d vs %s/%d",
					i, j, ax.ExerciseID, ax.Sets, bx.ExerciseID, bx.Sets)
			}
		}
	}
}
