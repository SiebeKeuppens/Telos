package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"telos/server/internal/app"
	"telos/server/internal/cache"
	"telos/server/internal/domain"
	"telos/server/internal/domain/profile"
)

// ---- user ----

func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request) {
	user, err := s.svc.GetUser(r.Context(), identityFrom(r.Context()).UID)
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handlePutMe(w http.ResponseWriter, r *http.Request) {
	id := identityFrom(r.Context())
	var u domain.User
	if err := decodeJSON(r, &u); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	u.UID = id.UID
	u.Email = id.Email
	updated, err := s.svc.UpdateProfile(r.Context(), u, time.Now())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// ---- training profiles (goal cards) ----

func (s *Server) handleListProfiles(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, profile.All())
}

// ---- exercise library ----

func (s *Server) handleListExercises(w http.ResponseWriter, r *http.Request) {
	var exercises []domain.Exercise
	if !s.cache.GetJSON(r.Context(), cache.KeyExercises(), &exercises) {
		var err error
		exercises, err = s.store.ListExercises(r.Context())
		if err != nil {
			writeStoreError(w, s.log, err)
			return
		}
		s.cache.SetJSON(r.Context(), cache.KeyExercises(), exercises, 24*time.Hour)
	}
	writeJSON(w, http.StatusOK, exercises)
}

func (s *Server) handleGetExercise(w http.ResponseWriter, r *http.Request) {
	ex, err := s.store.GetExercise(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, ex)
}

// handleGetSubstitute resolves the first substitute the user can actually
// perform with their equipment.
func (s *Server) handleGetSubstitute(w http.ResponseWriter, r *http.Request) {
	user, err := s.svc.GetUser(r.Context(), identityFrom(r.Context()).UID)
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	sub, ok := s.svc.Substitute(chi.URLParam(r, "id"), user.Equipment)
	if !ok {
		writeError(w, http.StatusNotFound, "no performable substitute")
		return
	}
	writeJSON(w, http.StatusOK, sub)
}

// ---- program ----

func (s *Server) handleGetProgram(w http.ResponseWriter, r *http.Request) {
	view, err := s.svc.GetProgram(r.Context(), identityFrom(r.Context()).UID)
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleRegenerate(w http.ResponseWriter, r *http.Request) {
	uid := identityFrom(r.Context()).UID
	if err := s.svc.Replan(r.Context(), uid); err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	view, err := s.svc.GetProgram(r.Context(), uid)
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// ---- workouts ----

func (s *Server) handleListWorkouts(w http.ResponseWriter, r *http.Request) {
	uid := identityFrom(r.Context()).UID
	to := domain.NewDate(time.Now())
	from := to.AddDays(-30)
	if v := r.URL.Query().Get("from"); v != "" {
		d, err := domain.ParseDate(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid 'from' date")
			return
		}
		from = d
	}
	if v := r.URL.Query().Get("to"); v != "" {
		d, err := domain.ParseDate(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid 'to' date")
			return
		}
		to = d
	}
	workouts, err := s.store.ListWorkouts(r.Context(), uid, from, to)
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	if workouts == nil {
		workouts = []domain.Workout{}
	}
	writeJSON(w, http.StatusOK, workouts)
}

func (s *Server) handleGetWorkout(w http.ResponseWriter, r *http.Request) {
	workout, err := s.store.GetWorkout(r.Context(), identityFrom(r.Context()).UID, chi.URLParam(r, "id"))
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, workout)
}

// ---- sync ----

func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Ops []app.SyncOp `json:"ops"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(body.Ops) > 500 {
		writeError(w, http.StatusBadRequest, "too many ops in one batch (max 500)")
		return
	}
	result := s.svc.ApplySync(r.Context(), identityFrom(r.Context()).UID, body.Ops)
	writeJSON(w, http.StatusOK, result)
}

// ---- dashboard & logs ----

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	dash, err := s.svc.GetDashboard(r.Context(), identityFrom(r.Context()).UID)
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, dash)
}

func daysParam(r *http.Request, def, max int) int {
	days := def
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			days = n
		}
	}
	if days > max {
		days = max
	}
	return days
}

func (s *Server) handleListBodyweight(w http.ResponseWriter, r *http.Request) {
	uid := identityFrom(r.Context()).UID
	since := domain.NewDate(time.Now()).AddDays(-daysParam(r, 90, 730))
	entries, err := s.store.ListBodyweightSince(r.Context(), uid, since)
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	if entries == nil {
		entries = []domain.BodyweightEntry{}
	}
	writeJSON(w, http.StatusOK, entries)
}

func (s *Server) handleListCheckins(w http.ResponseWriter, r *http.Request) {
	uid := identityFrom(r.Context()).UID
	since := domain.NewDate(time.Now()).AddDays(-daysParam(r, 30, 365))
	checkins, err := s.store.ListCheckInsSince(r.Context(), uid, since)
	if err != nil {
		writeStoreError(w, s.log, err)
		return
	}
	if checkins == nil {
		checkins = []domain.CheckIn{}
	}
	writeJSON(w, http.StatusOK, checkins)
}
