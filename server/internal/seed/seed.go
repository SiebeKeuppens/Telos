// Package seed embeds the exercise library reference data and loads it for
// idempotent upserting at boot. Content lives in exercises.json so it can be
// extended without touching Go code.
package seed

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"telos/server/internal/domain"
)

//go:embed exercises.json
var exercisesJSON []byte

func Exercises() ([]domain.Exercise, error) {
	var out []domain.Exercise
	if err := json.Unmarshal(exercisesJSON, &out); err != nil {
		return nil, fmt.Errorf("parse exercises.json: %w", err)
	}
	ids := make(map[string]bool, len(out))
	for _, ex := range out {
		if ex.ID == "" || ex.Name == "" || ex.Pattern == "" || len(ex.PrimaryMuscles) == 0 {
			return nil, fmt.Errorf("exercise %q missing required fields", ex.ID)
		}
		if ids[ex.ID] {
			return nil, fmt.Errorf("duplicate exercise id %q", ex.ID)
		}
		ids[ex.ID] = true
	}
	// Referential integrity for substitute/progression links.
	for _, ex := range out {
		if ex.SubstituteID != nil && !ids[*ex.SubstituteID] {
			return nil, fmt.Errorf("exercise %q references unknown substitute %q", ex.ID, *ex.SubstituteID)
		}
		if ex.ProgressionID != nil && !ids[*ex.ProgressionID] {
			return nil, fmt.Errorf("exercise %q references unknown progression %q", ex.ID, *ex.ProgressionID)
		}
	}
	return out, nil
}
