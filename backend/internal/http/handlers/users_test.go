package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"stansiareco/backend/internal/auth"
	"stansiareco/backend/internal/http/handlers"
	"stansiareco/backend/internal/http/middleware"
	"stansiareco/backend/internal/users"
)

type mockUserService struct {
	usersList []users.UserWithPermissions
}

func (m *mockUserService) ListUsers(ctx context.Context) ([]users.UserWithPermissions, error) {
	return m.usersList, nil
}

func (m *mockUserService) GetUserByID(ctx context.Context, id uuid.UUID) (*users.UserWithPermissions, error) {
	for _, u := range m.usersList {
		if u.ID == id {
			return &u, nil
		}
	}
	return nil, users.ErrUserNotFound
}

func (m *mockUserService) CreateUser(ctx context.Context, req users.CreateUserRequest) (*users.UserWithPermissions, error) {
	u := users.UserWithPermissions{
		User: users.User{
			ID:        uuid.New(),
			Email:     req.Email,
			FullName:  req.FullName,
			Role:      req.Role,
			IsActive:  true,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
	}
	m.usersList = append(m.usersList, u)
	return &u, nil
}

func (m *mockUserService) UpdateUser(ctx context.Context, id uuid.UUID, req users.UpdateUserRequest) (*users.UserWithPermissions, error) {
	for i, u := range m.usersList {
		if u.ID == id {
			if req.FullName != nil {
				m.usersList[i].FullName = *req.FullName
			}
			return &m.usersList[i], nil
		}
	}
	return nil, users.ErrUserNotFound
}

func (m *mockUserService) DeleteUser(ctx context.Context, id uuid.UUID, requestingUserID uuid.UUID) error {
	if id == requestingUserID {
		return users.ErrCannotDeleteSelf
	}
	for i, u := range m.usersList {
		if u.ID == id {
			m.usersList = append(m.usersList[:i], m.usersList[i+1:]...)
			return nil
		}
	}
	return users.ErrUserNotFound
}

func TestUsersHandler_List(t *testing.T) {
	u1 := users.UserWithPermissions{
		User: users.User{
			ID:       uuid.New(),
			Email:    "u1@test.local",
			FullName: "User One",
			Role:     "operator",
			IsActive: true,
		},
	}
	service := &mockUserService{usersList: []users.UserWithPermissions{u1}}
	handler := handlers.NewUsersHandler(service, nil)

	req := httptest.NewRequest(http.MethodGet, "/users", nil)
	rr := httptest.NewRecorder()

	handler.List(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp map[string][]users.UserWithPermissions
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse json: %v", err)
	}
	if len(resp["users"]) != 1 || resp["users"][0].Email != "u1@test.local" {
		t.Fatalf("unexpected users list: %v", resp)
	}
}

func TestUsersHandler_Create(t *testing.T) {
	service := &mockUserService{}
	handler := handlers.NewUsersHandler(service, nil)

	body, _ := json.Marshal(users.CreateUserRequest{
		Email:    "new@test.local",
		Password: "Password123!",
		FullName: "New User",
		Role:     "operator",
	})
	req := httptest.NewRequest(http.MethodPost, "/users", bytes.NewReader(body))
	rr := httptest.NewRecorder()

	handler.Create(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d", rr.Code)
	}
}

func TestUsersHandler_DeleteSelfForbidden(t *testing.T) {
	myID := uuid.New()
	u1 := users.UserWithPermissions{
		User: users.User{
			ID:       myID,
			Email:    "me@test.local",
			FullName: "My Self",
			Role:     "admin",
			IsActive: true,
		},
	}
	service := &mockUserService{usersList: []users.UserWithPermissions{u1}}
	handler := handlers.NewUsersHandler(service, nil)

	r := chi.NewRouter()
	r.Delete("/users/{userID}", handler.Delete)

	req := httptest.NewRequest(http.MethodDelete, "/users/"+myID.String(), nil)
	// Put current user in context with matching ID
	ctx := context.WithValue(req.Context(), middleware.UserCtxKey, &auth.AuthenticatedUser{
		ID:    myID,
		Email: "me@test.local",
		Role:  "admin",
	})
	rr := httptest.NewRecorder()

	r.ServeHTTP(rr, req.WithContext(ctx))

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request when deleting self, got %d", rr.Code)
	}
}
