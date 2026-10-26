package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"stansiareco/backend/internal/http/handlers"
	"stansiareco/backend/internal/servers"
)

// MockProviderService
type mockProviderService struct {
	providers []servers.ServerProvider
}

func (m *mockProviderService) ListProviders(ctx context.Context) ([]servers.ServerProvider, error) {
	return m.providers, nil
}
func (m *mockProviderService) GetProvider(ctx context.Context, id uuid.UUID) (*servers.ServerProvider, error) {
	for _, p := range m.providers {
		if p.ID == id {
			return &p, nil
		}
	}
	return nil, servers.ErrProviderNotFound
}
func (m *mockProviderService) CreateProvider(ctx context.Context, req servers.CreateProviderRequest) (*servers.ServerProvider, error) {
	p := servers.ServerProvider{
		ID:         uuid.New(),
		Name:       req.Name,
		Port25Open: req.Port25Open,
		Website:    req.Website,
	}
	m.providers = append(m.providers, p)
	return &p, nil
}
func (m *mockProviderService) UpdateProvider(ctx context.Context, id uuid.UUID, req servers.UpdateProviderRequest) (*servers.ServerProvider, error) {
	return m.GetProvider(ctx, id)
}
func (m *mockProviderService) DeleteProvider(ctx context.Context, id uuid.UUID) error {
	return nil
}

// MockMTAService
type mockMTAService struct {
	servers []servers.MTAServer
}

func (m *mockMTAService) ListServers(ctx context.Context, filter servers.MTAServerFilter) ([]servers.MTAServer, error) {
	return m.servers, nil
}
func (m *mockMTAService) GetServer(ctx context.Context, id uuid.UUID) (*servers.MTAServer, error) {
	for _, s := range m.servers {
		if s.ID == id {
			return &s, nil
		}
	}
	return nil, servers.ErrServerNotFound
}
func (m *mockMTAService) CreateServer(ctx context.Context, req servers.CreateMTAServerRequest) (*servers.MTAServer, error) {
	srv := servers.MTAServer{
		ID:           uuid.New(),
		Name:         req.Name,
		HostnameOrIP: req.HostnameOrIP,
		SSHPort:      req.SSHPort,
		MainIP:       req.HostnameOrIP,
		Port25Status: "unknown",
	}
	m.servers = append(m.servers, srv)
	return &srv, nil
}
func (m *mockMTAService) BulkCreateServers(ctx context.Context, req servers.BulkAddMTAServerRequest) (*servers.BulkAddResult, error) {
	return &servers.BulkAddResult{TotalParsed: 1, AddedCount: 1}, nil
}
func (m *mockMTAService) UpdateServer(ctx context.Context, id uuid.UUID, req servers.UpdateMTAServerRequest) (*servers.MTAServer, error) {
	return m.GetServer(ctx, id)
}
func (m *mockMTAService) DeleteServer(ctx context.Context, id uuid.UUID) error {
	return nil
}
func (m *mockMTAService) TestSSHConnection(ctx context.Context, id uuid.UUID) (*servers.SSHTestResult, error) {
	return &servers.SSHTestResult{ServerID: id, Success: true, Message: "Connected"}, nil
}

func TestServersHandler_Providers(t *testing.T) {
	provMock := &mockProviderService{
		providers: []servers.ServerProvider{
			{ID: uuid.New(), Name: "Contabo", Port25Open: true},
			{ID: uuid.New(), Name: "Hetzner", Port25Open: false},
		},
	}
	mtaMock := &mockMTAService{}
	actMock := servers.NewPostgresActionService(nil)

	h := handlers.NewServersHandler(provMock, mtaMock, nil, nil, nil, actMock)

	// 1. List Providers
	req := httptest.NewRequest(http.MethodGet, "/api/v1/servers/providers", nil)
	rr := httptest.NewRecorder()
	h.ListProviders(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var res struct {
		Providers []servers.ServerProvider `json:"providers"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(res.Providers) != 2 {
		t.Fatalf("expected 2 providers, got %d", len(res.Providers))
	}
	if !res.Providers[0].Port25Open {
		t.Errorf("expected Contabo port 25 open to be true")
	}

	// 2. Create Provider
	createBody := map[string]any{
		"name":         "New Provider",
		"port_25_open": true,
		"website":      "https://example.com",
	}
	bodyBytes, _ := json.Marshal(createBody)
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/v1/servers/providers", bytes.NewReader(bodyBytes))
	rrCreate := httptest.NewRecorder()
	h.CreateProvider(rrCreate, reqCreate)

	if rrCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d", rrCreate.Code)
	}
}

func TestServersHandler_Actions(t *testing.T) {
	actMock := servers.NewPostgresActionService(nil)
	h := handlers.NewServersHandler(nil, nil, nil, nil, nil, actMock)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/servers/actions", nil)
	rr := httptest.NewRecorder()
	h.GetActions(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var res struct {
		Actions []servers.ServerActionDefinition `json:"actions"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse actions: %v", err)
	}
	if len(res.Actions) == 0 {
		t.Fatalf("expected non-empty actions list")
	}
}
