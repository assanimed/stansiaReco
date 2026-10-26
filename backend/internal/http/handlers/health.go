package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type HealthHandler struct {
	dbPool *pgxpool.Pool
	env    string
}

func NewHealthHandler(dbPool *pgxpool.Pool, env string) *HealthHandler {
	return &HealthHandler{
		dbPool: dbPool,
		env:    env,
	}
}

// Healthz handles liveness probes
func (h *HealthHandler) Healthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":    "up",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// Readyz handles readiness probes (checks database connectivity)
func (h *HealthHandler) Readyz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if h.dbPool == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":  "not_ready",
			"message": "database pool is uninitialized",
		})
		return
	}

	if err := h.dbPool.Ping(ctx); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":  "not_ready",
			"message": "database ping failed: " + err.Error(),
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":      "ready",
		"environment": h.env,
		"database":    "connected",
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	})
}
