package middleware

import (
	"net/http"

	"github.com/google/uuid"
	"stansiareco/backend/internal/observability"
)

const HeaderRequestID = "X-Request-ID"

// RequestID middleware ensures every request has a unique correlation ID
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get(HeaderRequestID)
		if reqID == "" {
			reqID = uuid.New().String()
		}

		ctx := observability.WithRequestID(r.Context(), reqID)
		w.Header().Set(HeaderRequestID, reqID)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
