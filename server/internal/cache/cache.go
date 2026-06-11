// Package cache wraps Redis for hot reads (exercise library, dashboard
// aggregates, current-program payloads). It is an optimization layer only:
// when Redis is down the app keeps working straight off Postgres, so every
// method degrades to a no-op/miss on connection errors.
package cache

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

type Cache struct {
	rdb *redis.Client // nil → caching disabled (REDIS_ADDR="off")
	log *slog.Logger
}

// New connects to Redis at addr. addr "off" (or empty) disables caching
// entirely — the app then reads straight from Postgres, which keeps local
// development possible without a Redis instance.
func New(addr string, log *slog.Logger) *Cache {
	if addr == "" || addr == "off" {
		log.Warn("redis disabled — running without cache")
		return &Cache{log: log}
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	return &Cache{rdb: rdb, log: log}
}

func (c *Cache) Close() {
	if c.rdb != nil {
		_ = c.rdb.Close()
	}
}

// GetJSON loads key into dest; ok=false on miss or any Redis problem.
func (c *Cache) GetJSON(ctx context.Context, key string, dest any) bool {
	if c.rdb == nil {
		return false
	}
	raw, err := c.rdb.Get(ctx, key).Bytes()
	if err != nil {
		if err != redis.Nil {
			c.log.Warn("cache get failed", "key", key, "err", err)
		}
		return false
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		c.log.Warn("cache decode failed", "key", key, "err", err)
		return false
	}
	return true
}

func (c *Cache) SetJSON(ctx context.Context, key string, value any, ttl time.Duration) {
	if c.rdb == nil {
		return
	}
	raw, err := json.Marshal(value)
	if err != nil {
		c.log.Warn("cache encode failed", "key", key, "err", err)
		return
	}
	if err := c.rdb.Set(ctx, key, raw, ttl).Err(); err != nil {
		c.log.Warn("cache set failed", "key", key, "err", err)
	}
}

func (c *Cache) Delete(ctx context.Context, keys ...string) {
	if c.rdb == nil || len(keys) == 0 {
		return
	}
	if err := c.rdb.Del(ctx, keys...).Err(); err != nil {
		c.log.Warn("cache delete failed", "keys", keys, "err", err)
	}
}

// Key helpers — one place defines the namespace.

func KeyExercises() string             { return "telos:exercises:v1" }
func KeyDashboard(uid string) string   { return "telos:dash:v1:" + uid }
func KeyProgram(uid string) string     { return "telos:program:v1:" + uid }

// UserKeys returns every per-user key, for invalidation on write.
func UserKeys(uid string) []string {
	return []string{KeyDashboard(uid), KeyProgram(uid)}
}
