package middleware

import (
	"encoding/json"
	"net/http"
	"runtime/debug"

	"stansiareco/backend/internal/observability"
)

// Recoverer catches panics, logs stack trace, and returns 500 JSON response
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rvr := recover(); rvr != nil {
				logger := observability.FromContext(r.Context())
				logger.Error("Unhandled panic in HTTP handler",
					"panic", rvr,
					"stack", string(debug.Stack()),
				)

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"error": map[string]any{
						"code":    "INTERNAL_SERVER_ERROR",
						"message": "An internal error occurred",
					},
				})
			}
		}()

		next.ServeHTTP(w, r)
	})
}
