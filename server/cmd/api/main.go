package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"telos/server/internal/app"
	"telos/server/internal/auth"
	"telos/server/internal/cache"
	"telos/server/internal/config"
	"telos/server/internal/httpapi"
	"telos/server/internal/seed"
	"telos/server/internal/store"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := store.Migrate(cfg.DatabaseURL); err != nil {
		return err
	}
	st, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	exercises, err := seed.Exercises()
	if err != nil {
		return err
	}
	if err := st.SeedExercises(ctx, exercises); err != nil {
		return err
	}
	log.Info("exercise library seeded", "count", len(exercises))

	ca := cache.New(cfg.RedisAddr, log)
	defer ca.Close()

	var verifier auth.Verifier
	switch cfg.AuthMode {
	case "insecure-dev":
		log.Warn("AUTH MODE IS insecure-dev — development only")
		verifier = auth.NewInsecureDev()
	default:
		verifier, err = auth.NewFirebase(ctx, cfg.FirebaseProjectID)
		if err != nil {
			return err
		}
	}

	svc := app.New(st, ca, exercises, log)
	server := httpapi.NewServer(svc, st, ca, verifier, log)

	if cfg.WebDist != "" {
		log.Info("serving SPA", "dist", cfg.WebDist)
	}
	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.Routes(cfg.CORSOrigins, cfg.WebDist),
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("telos api listening", "port", cfg.Port, "env", cfg.Env)
		errCh <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
		log.Info("shut down cleanly")
	}
	return nil
}
