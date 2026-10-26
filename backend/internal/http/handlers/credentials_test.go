package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"stansiareco/backend/internal/credentials"
	"stansiareco/backend/internal/http/handlers"
)

type mockCredentialService struct {
	items []credentials.CredentialItem
}

func (m *mockCredentialService) ListCredentials(ctx context.Context, credType string) ([]credentials.CredentialItem, error) {
	return m.items, nil
}

func (m *mockCredentialService) GetCredential(ctx context.Context, id uuid.UUID) (*credentials.CredentialItem, error) {
	for _, item := range m.items {
		if item.ID == id {
			return &item, nil
		}
	}
	return nil, credentials.ErrCredentialNotFound
}

func (m *mockCredentialService) CreateCredential(ctx context.Context, req credentials.CreateCredentialRequest) (*credentials.CredentialItem, error) {
	item := credentials.CredentialItem{
		ID:          uuid.New(),
		Name:        req.Name,
		CredType:    req.CredType,
		Username:    req.Username,
		KeyVersion:  1,
		Fingerprint: "SHA256:mockfingerprint",
		Description: req.Description,
		ServerCount: 0,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	m.items = append(m.items, item)
	return &item, nil
}

func (m *mockCredentialService) DeleteCredential(ctx context.Context, id uuid.UUID) error {
	for i, item := range m.items {
		if item.ID == id {
			m.items = append(m.items[:i], m.items[i+1:]...)
			return nil
		}
	}
	return credentials.ErrCredentialNotFound
}

func TestCredentialsHandler_List(t *testing.T) {
	mockSvc := &mockCredentialService{
		items: []credentials.CredentialItem{
			{
				ID:          uuid.New(),
				Name:        "Test Key",
				CredType:    credentials.TypePrivateKey,
				Username:    "root",
				Fingerprint: "SHA256:1234abcd",
			},
		},
	}

	h := handlers.NewCredentialsHandler(mockSvc, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/credentials", nil)
	rr := httptest.NewRecorder()
	h.List(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var res map[string][]credentials.CredentialItem
	if err := json.NewDecoder(rr.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(res["credentials"]) != 1 {
		t.Fatalf("expected 1 credential, got %d", len(res["credentials"]))
	}
}

func TestCredentialsHandler_Create(t *testing.T) {
	mockSvc := &mockCredentialService{}
	h := handlers.NewCredentialsHandler(mockSvc, nil)

	reqBody, _ := json.Marshal(credentials.CreateCredentialRequest{
		Name:     "Prod Key",
		CredType: credentials.TypePrivateKey,
		Username: "ubuntu",
		Secret:   "-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/credentials", bytes.NewReader(reqBody))
	rr := httptest.NewRecorder()
	h.Create(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rr.Code)
	}

	var res map[string]credentials.CredentialItem
	if err := json.NewDecoder(rr.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if res["credential"].Name != "Prod Key" {
		t.Fatalf("expected credential name 'Prod Key', got %s", res["credential"].Name)
	}
}
