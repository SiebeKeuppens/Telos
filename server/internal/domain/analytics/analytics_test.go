package analytics

import (
	"math"
	"testing"
)

func almost(a, b float64) bool { return math.Abs(a-b) < 0.01 }

func TestEstimateOneRM(t *testing.T) {
	// Epley at face value: 100kg × 10 → 133.3.
	if got := EstimateOneRM(100, 10, 0); !almost(got, 133.33) {
		t.Errorf("no-RPE e1RM = %.2f, want 133.33", got)
	}
	// RPE 8 = 2 in reserve → effectively 12 reps → 140.
	if got := EstimateOneRM(100, 10, 8); !almost(got, 140) {
		t.Errorf("RPE-adjusted e1RM = %.2f, want 140.00", got)
	}
	// A true single at RPE 10 is its own 1RM.
	if got := EstimateOneRM(180, 1, 10); !almost(got, 180) {
		t.Errorf("single e1RM = %.2f, want 180", got)
	}
	if EstimateOneRM(0, 10, 8) != 0 || EstimateOneRM(100, 0, 8) != 0 {
		t.Error("degenerate inputs should yield 0")
	}
}

func TestLoadForRepsInvertsEpley(t *testing.T) {
	oneRM := 140.0
	load := LoadForReps(oneRM, 10, 2)
	if back := EstimateOneRM(load, 10, 8); !almost(back, oneRM) {
		t.Errorf("round trip: %.2f → %.2f, want %.2f", load, back, oneRM)
	}
}

func TestRoundToIncrement(t *testing.T) {
	if got := RoundToIncrement(101.3, 2.5); got != 102.5 {
		t.Errorf("rounded = %v, want 102.5", got)
	}
	if got := RoundToIncrement(101.1, 2.5); got != 100 {
		t.Errorf("rounded = %v, want 100", got)
	}
	if got := RoundToIncrement(77, 0); got != 77 {
		t.Errorf("zero increment should pass through, got %v", got)
	}
}

func TestSmoothedTrendDampsNoise(t *testing.T) {
	// Oscillating daily weights around 80 — the trend should stay near 80
	// while raw values swing ±1.5.
	raw := []float64{80, 81.5, 78.5, 81.5, 78.5, 81.5, 78.5, 80}
	trend := SmoothedTrend(raw, 0.25)
	if len(trend) != len(raw) {
		t.Fatalf("trend length %d != %d", len(trend), len(raw))
	}
	for i, v := range trend {
		if math.Abs(v-80) > 1.0 {
			t.Errorf("trend[%d] = %.2f drifted more than the damped bound from 80", i, v)
		}
	}
	if SmoothedTrend(nil, 0.25) != nil {
		t.Error("empty series should return nil")
	}
}
