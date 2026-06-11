package httpapi

import (
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// In-memory per-client rate limiting. Telos deploys as a single instance, so
// local token buckets are sufficient; if it ever scales out, swap this for a
// Redis-backed limiter behind the same middleware seam.
//
// The key is the client IP (RealIP middleware runs first). Limiting happens
// before auth so token-verification work is covered too.

const (
	rateLimitPerSecond = 15
	rateLimitBurst     = 40
	visitorTTL         = 10 * time.Minute
)

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type rateLimiterStore struct {
	mu       sync.Mutex
	visitors map[string]*visitor
}

func newRateLimiterStore() *rateLimiterStore {
	s := &rateLimiterStore{visitors: make(map[string]*visitor)}
	go s.cleanupLoop()
	return s
}

func (s *rateLimiterStore) allow(key string) bool {
	s.mu.Lock()
	v, ok := s.visitors[key]
	if !ok {
		v = &visitor{limiter: rate.NewLimiter(rateLimitPerSecond, rateLimitBurst)}
		s.visitors[key] = v
	}
	v.lastSeen = time.Now()
	s.mu.Unlock()
	return v.limiter.Allow()
}

func (s *rateLimiterStore) cleanupLoop() {
	ticker := time.NewTicker(visitorTTL)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-visitorTTL)
		s.mu.Lock()
		for key, v := range s.visitors {
			if v.lastSeen.Before(cutoff) {
				delete(s.visitors, key)
			}
		}
		s.mu.Unlock()
	}
}

func rateLimitMiddleware() func(http.Handler) http.Handler {
	store := newRateLimiterStore()
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// RemoteAddr is "ip:port" on direct connections (RealIP strips
			// the port only when proxy headers are present) — key on the IP.
			key := r.RemoteAddr
			if host, _, err := net.SplitHostPort(key); err == nil {
				key = host
			}
			if !store.allow(key) {
				w.Header().Set("Retry-After", "1")
				writeError(w, http.StatusTooManyRequests, "too many requests — slow down a moment")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
