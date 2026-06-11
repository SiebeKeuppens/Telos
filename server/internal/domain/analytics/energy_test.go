package analytics

import "testing"

func TestBMRMifflinStJeor(t *testing.T) {
	// Textbook check: 80 kg, 180 cm, 30 y male →
	// 10·80 + 6.25·180 − 5·30 + 5 = 800 + 1125 − 150 + 5 = 1780.
	if got := BMR(80, 180, 30, "male"); !almost(got, 1780) {
		t.Errorf("male BMR = %.1f, want 1780", got)
	}
	// 10·65 + 6.25·165 − 5·28 − 161 = 650 + 1031.25 − 140 − 161 = 1380.25.
	if got := BMR(65, 165, 28, "female"); !almost(got, 1380.25) {
		t.Errorf("female BMR = %.1f, want 1380.25", got)
	}
	// Unspecified sits between the two constants.
	unspecified := BMR(80, 180, 30, "")
	if unspecified <= BMR(80, 180, 30, "female") || unspecified >= BMR(80, 180, 30, "male") {
		t.Errorf("unspecified BMR %.1f should sit between female and male", unspecified)
	}
	if BMR(0, 180, 30, "male") != 0 || BMR(80, 0, 30, "male") != 0 || BMR(80, 180, 0, "male") != 0 {
		t.Error("missing inputs should yield 0")
	}
}

func TestSessionKcal(t *testing.T) {
	// 4.5 METs × 80 kg × 1 h = 360 kcal.
	if got := SessionKcal(80, 60); !almost(got, 360) {
		t.Errorf("session kcal = %.1f, want 360", got)
	}
	if SessionKcal(80, 0) != 0 {
		t.Error("zero duration should yield 0")
	}
}

func TestMaintenanceAndGoalRange(t *testing.T) {
	maintenance := MaintenanceKcal(1780, 150) // 1780×1.2 + 150 = 2286 → 2275
	if maintenance != 2275 {
		t.Errorf("maintenance = %.0f, want 2275 (rounded to 25)", maintenance)
	}

	low, high := GoalRange(maintenance, 0.10)
	center := maintenance * 1.10
	if low >= high {
		t.Fatalf("range inverted: %v..%v", low, high)
	}
	if low < center-150 || high > center+150 {
		t.Errorf("range %v..%v strays from center %.0f", low, high, center)
	}

	// Guardrail: a negative adjustment must clamp to maintenance — the
	// estimate never suggests eating below it.
	low, _ = GoalRange(2000, -0.2)
	if low < 2000-150 {
		t.Errorf("negative adjust must clamp to maintenance, got low %v", low)
	}
}
