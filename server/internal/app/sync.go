package app

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"telos/server/internal/cache"
	"telos/server/internal/domain"
)

// The sync protocol: the client keeps an offline write queue (outbox) and
// flushes it as a batch of idempotent ops. Every op carries a client-generated
// entity UUID and the client-side write timestamp; conflict resolution is
// last-write-wins per record on that timestamp (brief §9). After a batch that
// touches engine inputs, the server re-plans and the client re-fetches.

type SyncOp struct {
	OpID     string          `json:"opId"`
	Entity   string          `json:"entity"` // workout | workout_exercise | set | bodyweight | checkin | profile
	Action   string          `json:"action"` // upsert | delete
	ClientTS time.Time       `json:"clientTs"`
	Data     json.RawMessage `json:"data"`
}

type SyncOpResult struct {
	OpID   string `json:"opId"`
	Status string `json:"status"` // applied | error
	Error  string `json:"error,omitempty"`
}

type SyncResult struct {
	Results    []SyncOpResult `json:"results"`
	Replanned  bool           `json:"replanned"`
	ServerTime time.Time      `json:"serverTime"`
}

func (s *Service) ApplySync(ctx context.Context, uid string, ops []SyncOp) SyncResult {
	res := SyncResult{ServerTime: s.now()}
	affectsEngine := false
	applied := false

	for _, op := range ops {
		err := s.applyOp(ctx, uid, op, &affectsEngine)
		r := SyncOpResult{OpID: op.OpID, Status: "applied"}
		if err != nil {
			r.Status = "error"
			r.Error = err.Error()
			s.log.Warn("sync op failed", "uid", uid, "entity", op.Entity, "op", op.OpID, "err", err)
		} else {
			applied = true
		}
		res.Results = append(res.Results, r)
	}

	if applied {
		s.cache.Delete(ctx, cache.UserKeys(uid)...)
	}
	if affectsEngine {
		if err := s.Replan(ctx, uid); err != nil {
			s.log.Error("replan after sync failed", "uid", uid, "err", err)
		} else {
			res.Replanned = true
		}
	}
	return res
}

func (s *Service) applyOp(ctx context.Context, uid string, op SyncOp, affectsEngine *bool) error {
	if op.ClientTS.IsZero() {
		op.ClientTS = s.now()
	}
	// Never trust client clocks ahead of the server: cap at server time so a
	// skewed clock can't make a record un-overwritable.
	if now := s.now(); op.ClientTS.After(now) {
		op.ClientTS = now
	}

	switch op.Entity {
	case "workout":
		var w domain.Workout
		if err := json.Unmarshal(op.Data, &w); err != nil {
			return fmt.Errorf("decode workout: %w", err)
		}
		if w.ID == "" {
			return fmt.Errorf("workout id required")
		}
		if op.Action == "delete" {
			return fmt.Errorf("workout delete is not supported; set status to skipped")
		}
		if w.Status == domain.WorkoutCompleted {
			*affectsEngine = true
		}
		return s.store.UpsertWorkoutSync(ctx, uid, w, op.ClientTS)

	case "workout_exercise":
		if op.Action == "delete" {
			var ref struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(op.Data, &ref); err != nil || ref.ID == "" {
				return fmt.Errorf("decode workout_exercise delete: invalid id")
			}
			return s.store.DeleteWorkoutExerciseSync(ctx, uid, ref.ID)
		}
		var we domain.WorkoutExercise
		if err := json.Unmarshal(op.Data, &we); err != nil {
			return fmt.Errorf("decode workout_exercise: %w", err)
		}
		if we.ID == "" || we.WorkoutID == "" || we.ExerciseID == "" {
			return fmt.Errorf("workout_exercise requires id, workoutId, exerciseId")
		}
		if _, ok := s.lib[we.ExerciseID]; !ok {
			return fmt.Errorf("unknown exercise %q", we.ExerciseID)
		}
		clampInt(&we.TargetSets, 1, 10)
		clampInt(&we.TargetRepsMin, 1, 100)
		clampInt(&we.TargetRepsMax, we.TargetRepsMin, 100)
		return s.store.UpsertWorkoutExerciseSync(ctx, uid, we, op.ClientTS)

	case "set":
		if op.Action == "delete" {
			var ref struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(op.Data, &ref); err != nil || ref.ID == "" {
				return fmt.Errorf("decode set delete: invalid id")
			}
			return s.store.DeleteSetSync(ctx, uid, ref.ID)
		}
		var st domain.Set
		if err := json.Unmarshal(op.Data, &st); err != nil {
			return fmt.Errorf("decode set: %w", err)
		}
		if st.ID == "" || st.WorkoutExerciseID == "" {
			return fmt.Errorf("set requires id and workoutExerciseId")
		}
		clampFloat(&st.LoadKg, 0, 1000)
		clampInt(&st.Reps, 0, 200)
		if st.RPE != nil {
			clampFloat(st.RPE, 1, 10)
		}
		return s.store.UpsertSetSync(ctx, uid, st, op.ClientTS)

	case "bodyweight":
		var e domain.BodyweightEntry
		if err := json.Unmarshal(op.Data, &e); err != nil {
			return fmt.Errorf("decode bodyweight: %w", err)
		}
		if e.ID == "" || e.Date.IsZero() {
			return fmt.Errorf("bodyweight requires id and date")
		}
		if e.WeightKg < 20 || e.WeightKg > 400 {
			return fmt.Errorf("bodyweight out of plausible range")
		}
		return s.store.UpsertBodyweight(ctx, uid, e, op.ClientTS)

	case "checkin":
		var c domain.CheckIn
		if err := json.Unmarshal(op.Data, &c); err != nil {
			return fmt.Errorf("decode checkin: %w", err)
		}
		if c.ID == "" || c.Date.IsZero() {
			return fmt.Errorf("checkin requires id and date")
		}
		for _, v := range []*int{&c.Energy, &c.Stress, &c.Sleep, &c.Motivation, &c.Soreness} {
			clampInt(v, 1, 5)
		}
		*affectsEngine = true
		return s.store.UpsertCheckIn(ctx, uid, c, op.ClientTS)

	case "profile":
		var u domain.User
		if err := json.Unmarshal(op.Data, &u); err != nil {
			return fmt.Errorf("decode profile: %w", err)
		}
		u.UID = uid
		_, err := s.UpdateProfile(ctx, u, op.ClientTS)
		return err

	default:
		return fmt.Errorf("unknown entity %q", op.Entity)
	}
}

func clampInt(v *int, lo, hi int) {
	if *v < lo {
		*v = lo
	}
	if *v > hi {
		*v = hi
	}
}

func clampFloat(v *float64, lo, hi float64) {
	if *v < lo {
		*v = lo
	}
	if *v > hi {
		*v = hi
	}
}
