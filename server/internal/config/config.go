// Package config reads the server's environment configuration.
package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Env               string // development | production
	Port              string
	DatabaseURL       string
	RedisAddr         string
	FirebaseProjectID string
	AuthMode          string // firebase | insecure-dev
	CORSOrigins       []string
	// WebDist serves the built SPA from this directory when set (production:
	// one container serves both /api and the app, same-origin — no CORS).
	WebDist string
}

func Load() (Config, error) {
	c := Config{
		Env:               getenv("TELOS_ENV", "development"),
		Port:              getenv("PORT", "8080"),
		DatabaseURL:       getenv("DATABASE_URL", "postgres://telos:telos_dev@localhost:5433/telos?sslmode=disable"),
		RedisAddr:         getenv("REDIS_ADDR", "localhost:6380"),
		FirebaseProjectID: getenv("FIREBASE_PROJECT_ID", ""),
		AuthMode:          getenv("AUTH_MODE", "firebase"),
		CORSOrigins:       splitNonEmpty(getenv("CORS_ORIGINS", "http://localhost:5173")),
		WebDist:           getenv("WEB_DIST", ""),
	}
	if c.AuthMode != "firebase" && c.AuthMode != "insecure-dev" {
		return c, fmt.Errorf("AUTH_MODE must be firebase or insecure-dev, got %q", c.AuthMode)
	}
	if c.AuthMode == "insecure-dev" && c.Env == "production" {
		return c, fmt.Errorf("insecure-dev auth mode is forbidden in production")
	}
	if c.AuthMode == "firebase" && c.FirebaseProjectID == "" {
		return c, fmt.Errorf("FIREBASE_PROJECT_ID is required when AUTH_MODE=firebase")
	}
	return c, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func splitNonEmpty(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}
