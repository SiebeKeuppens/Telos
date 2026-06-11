// Package httpapi is the HTTP edge: routing, auth middleware, CORS, and thin
// handlers over the app service. The API contract here is shared by the V1
// web client and the future V2 Android client — keep it client-agnostic.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"telos/server/internal/app"
	"telos/server/internal/auth"
	"telos/server/internal/cache"
	"telos/server/internal/store"
)

type Server struct {
	svc      *app.Service
	store    *store.Store
	cache    *cache.Cache
	verifier auth.Verifier
	log      *slog.Logger
}

func NewServer(svc *app.Service, st *store.Store, ca *cache.Cache, verifier auth.Verifier, log *slog.Logger) *Server {
	return &Server{svc: svc, store: st, cache: ca, verifier: verifier, log: log}
}

// Routes builds the HTTP handler. webDist, when non-empty, additionally
// serves the built SPA (production single-container mode).
func (s *Server) Routes(corsOrigins []string, webDist string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(rateLimitMiddleware())
	r.Use(corsMiddleware(corsOrigins))
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			next.ServeHTTP(w, req)
		})
	})

	r.Get("/api/v1/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(s.authMiddleware)

		r.Get("/me", s.handleGetMe)
		r.Put("/me", s.handlePutMe)

		r.Get("/profiles", s.handleListProfiles)

		r.Get("/exercises", s.handleListExercises)
		r.Get("/exercises/{id}", s.handleGetExercise)
		r.Get("/exercises/{id}/substitute", s.handleGetSubstitute)

		r.Get("/program", s.handleGetProgram)
		r.Post("/program/regenerate", s.handleRegenerate)

		r.Get("/workouts", s.handleListWorkouts)
		r.Get("/workouts/{id}", s.handleGetWorkout)

		r.Post("/sync", s.handleSync)

		r.Get("/dashboard", s.handleDashboard)
		r.Get("/me/bodyweight", s.handleListBodyweight)
		r.Get("/me/checkins", s.handleListCheckins)
	})

	if webDist != "" {
		r.NotFound(spaHandler(webDist).ServeHTTP)
	}

	return r
}

type ctxKey int

const identityKey ctxKey = 1

func identityFrom(ctx context.Context) auth.Identity {
	id, _ := ctx.Value(identityKey).(auth.Identity)
	return id
}

// authMiddleware verifies the bearer token and guarantees a user row exists
// (FK safety for synced data arriving before onboarding).
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		tokenStr, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || tokenStr == "" {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		identity, err := s.verifier.Verify(r.Context(), tokenStr)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}
		if err := s.store.EnsureUser(r.Context(), identity.UID, identity.Email); err != nil {
			writeStoreError(w, s.log, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey, identity)))
	})
}

func corsMiddleware(origins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(origins))
	for _, o := range origins {
		allowed[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && allowed[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Max-Age", "86400")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
