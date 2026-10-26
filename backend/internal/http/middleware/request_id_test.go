package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"stansiareco/backend/internal/http/middleware"
	"stansiareco/backend/internal/observability"
)

func TestRequestIDMiddleware_Generated(t *testing.T) {
	var extractedID string
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if id, ok := r.Context().Value(observability.RequestIDKey).(string); ok {
			extractedID = id
		}
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware.RequestID(testHandler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	respHeaderID := rr.Header().Get(middleware.HeaderRequestID)
	if respHeaderID == "" {
		t.Fatal("expected X-Request-ID header in response")
	}

	if extractedID != respHeaderID {
		t.Fatalf("expected context request ID (%s) to match header ID (%s)", extractedID, respHeaderID)
	}
}

func TestRequestIDMiddleware_PreservesIncoming(t *testing.T) {
	incomingID := "custom-client-trace-12345"
	var extractedID string
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if id, ok := r.Context().Value(observability.RequestIDKey).(string); ok {
			extractedID = id
		}
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware.RequestID(testHandler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set(middleware.HeaderRequestID, incomingID)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	respHeaderID := rr.Header().Get(middleware.HeaderRequestID)
	if respHeaderID != incomingID {
		t.Fatalf("expected preserved X-Request-ID (%s), got (%s)", incomingID, respHeaderID)
	}
	if extractedID != incomingID {
		t.Fatalf("expected context ID (%s), got (%s)", incomingID, extractedID)
	}
}
