package observability

import (
	"context"
	"log/slog"
	"os"
	"strings"
)

type ctxKey string

const RequestIDKey ctxKey = "request_id"

// SetupLogger initializes the global slog logger with structured JSON format
func SetupLogger(levelStr string) *slog.Logger {
	var level slog.Level
	switch strings.ToLower(levelStr) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:     level,
		AddSource: true,
	})

	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

// WithRequestID returns a new context annotated with a request ID
func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, RequestIDKey, requestID)
}

// FromContext extracts the request ID if present and returns a child logger
func FromContext(ctx context.Context) *slog.Logger {
	logger := slog.Default()
	if reqID, ok := ctx.Value(RequestIDKey).(string); ok && reqID != "" {
		return logger.With(slog.String("request_id", reqID))
	}
	return logger
}
