package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"stansiareco/backend/internal/http/handlers"
)

func TestHealthzHandler(t *testing.T) {
	handler := handlers.NewHealthHandler(nil, "test")

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()

	handler.Healthz(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response json: %v", err)
	}

	if resp["status"] != "up" {
		t.Errorf("expected status 'up', got '%v'", resp["status"])
	}
}

func TestReadyzHandlerWithoutDB(t *testing.T) {
	handler := handlers.NewHealthHandler(nil, "test")

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rr := httptest.NewRecorder()

	handler.Readyz(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503 when dbPool is nil, got %d", rr.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response json: %v", err)
	}

	if resp["status"] != "not_ready" {
		t.Errorf("expected status 'not_ready', got '%v'", resp["status"])
	}
}
