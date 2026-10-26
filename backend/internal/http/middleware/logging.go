package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"stansiareco/backend/internal/observability"
)

type responseWriterInterceptor struct {
	http.ResponseWriter
	statusCode int
	bytesRead  int64
}

func (w *responseWriterInterceptor) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *responseWriterInterceptor) Write(b []byte) (int, error) {
	n, err := w.ResponseWriter.Write(b)
	w.bytesRead += int64(n)
	return n, err
}

func (w *responseWriterInterceptor) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (w *responseWriterInterceptor) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// RequestLogger logs incoming HTTP requests with latency, status, and request ID
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapper := &responseWriterInterceptor{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}

		next.ServeHTTP(wrapper, r)

		duration := time.Since(start)
		logger := observability.FromContext(r.Context())

		level := slog.LevelInfo
		if wrapper.statusCode >= 500 {
			level = slog.LevelError
		} else if wrapper.statusCode >= 400 {
			level = slog.LevelWarn
		}

		logger.Log(r.Context(), level, "HTTP request handled",
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapper.statusCode,
			"duration_ms", duration.Milliseconds(),
			"remote_addr", r.RemoteAddr,
			"user_agent", r.UserAgent(),
		)
	})
}
