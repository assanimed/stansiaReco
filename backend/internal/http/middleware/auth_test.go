package middleware_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"stansiareco/backend/internal/auth"
	"stansiareco/backend/internal/http/middleware"
)

type mockSessionManager struct {
	validToken string
	user       *auth.AuthenticatedUser
	session    *auth.Session
}

func (m *mockSessionManager) CreateSession(ctx context.Context, userID uuid.UUID, ip, ua string, ttl time.Duration) (string, *auth.Session, error) {
	return m.validToken, m.session, nil
}

func (m *mockSessionManager) ValidateSession(ctx context.Context, rawToken string) (*auth.SessionContext, error) {
	if rawToken == m.validToken {
		return &auth.SessionContext{
			Session: m.session,
			User:    m.user,
		}, nil
	}
	return nil, auth.ErrInvalidSession
}

func (m *mockSessionManager) InvalidateSession(ctx context.Context, rawToken string) error {
	return nil
}

func (m *mockSessionManager) InvalidateAllUserSessions(ctx context.Context, userID uuid.UUID) error {
	return nil
}

func (m *mockSessionManager) CleanupExpiredSessions(ctx context.Context) (int64, error) {
	return 0, nil
}

type mockRBACService struct {
	allowed map[string]bool
}

func (m *mockRBACService) HasPermission(ctx context.Context, userID uuid.UUID, role string, resource string, action auth.Action) (bool, error) {
	if role == "admin" {
		return true, nil
	}
	key := resource + ":" + string(action)
	return m.allowed[key], nil
}

func (m *mockRBACService) GetUserPermissions(ctx context.Context, userID uuid.UUID, role string) ([]auth.PermissionRule, error) {
	return nil, nil
}

func (m *mockRBACService) SetUserPermission(ctx context.Context, userID uuid.UUID, rule auth.PermissionRule) error {
	return nil
}

func (m *mockRBACService) DeleteUserPermission(ctx context.Context, userID uuid.UUID, resource string) error {
	return nil
}

func TestRequireAuth_Unauthorized(t *testing.T) {
	nextCalled := false
	handler := middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
	}))

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if nextCalled {
		t.Fatal("expected handler not to be called when unauthenticated")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rr.Code)
	}
}

func TestRequireAuth_Authorized(t *testing.T) {
	nextCalled := false
	handler := middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	user := &auth.AuthenticatedUser{
		ID:       uuid.New(),
		Email:    "test@user.local",
		Role:     "operator",
		IsActive: true,
	}
	ctx := context.WithValue(req.Context(), middleware.UserCtxKey, user)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req.WithContext(ctx))

	if !nextCalled {
		t.Fatal("expected handler to be called when user context is present")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}
}

func TestRequirePermission_AdminAlwaysAllowed(t *testing.T) {
	rbac := &mockRBACService{allowed: map[string]bool{}}
	permMiddleware := middleware.RequirePermission(rbac, auth.ResourceServers, auth.ActionDelete)

	called := false
	handler := permMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodDelete, "/servers/1", nil)
	adminUser := &auth.AuthenticatedUser{
		ID:       uuid.New(),
		Email:    "admin@stansiareco.local",
		Role:     "admin",
		IsActive: true,
	}
	ctx := context.WithValue(req.Context(), middleware.UserCtxKey, adminUser)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req.WithContext(ctx))

	if !called {
		t.Fatal("expected admin to be granted permission")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}
}

func TestRequirePermission_ForbiddenForOperator(t *testing.T) {
	rbac := &mockRBACService{
		allowed: map[string]bool{
			auth.ResourceServers + ":" + string(auth.ActionView): true,
			// servers:delete is not granted
		},
	}
	permMiddleware := middleware.RequirePermission(rbac, auth.ResourceServers, auth.ActionDelete)

	called := false
	handler := permMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))

	req := httptest.NewRequest(http.MethodDelete, "/servers/1", nil)
	operator := &auth.AuthenticatedUser{
		ID:       uuid.New(),
		Email:    "op@stansiareco.local",
		Role:     "operator",
		IsActive: true,
	}
	ctx := context.WithValue(req.Context(), middleware.UserCtxKey, operator)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req.WithContext(ctx))

	if called {
		t.Fatal("expected operator to be denied delete permission")
	}
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 Forbidden, got %d", rr.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	errObj, ok := resp["error"].(map[string]any)
	if !ok || errObj["code"] != "PERMISSION_DENIED" {
		t.Fatalf("expected PERMISSION_DENIED error code, got %v", resp)
	}
}

func TestAuthenticateMiddleware_CookieAndBearer(t *testing.T) {
	testUser := &auth.AuthenticatedUser{
		ID:       uuid.New(),
		Email:    "test@stansiareco.local",
		Role:     "operator",
		IsActive: true,
	}
	testSession := &auth.Session{
		ID:        uuid.New(),
		UserID:    testUser.ID,
		ExpiresAt: time.Now().Add(1 * time.Hour),
	}
	sessionMgr := &mockSessionManager{
		validToken: "valid-session-token-123456",
		user:       testUser,
		session:    testSession,
	}

	authMiddleware := middleware.Authenticate(sessionMgr)

	// Case 1: Via Cookie
	var extractedUser *auth.AuthenticatedUser
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		extractedUser = middleware.UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
	req1.AddCookie(&http.Cookie{
		Name:  middleware.CookieSession,
		Value: "valid-session-token-123456",
	})
	rr1 := httptest.NewRecorder()
	handler.ServeHTTP(rr1, req1)

	if extractedUser == nil || extractedUser.Email != testUser.Email {
		t.Fatalf("expected authenticated user from cookie, got %v", extractedUser)
	}

	// Case 2: Via Authorization: Bearer
	extractedUser = nil
	req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
	req2.Header.Set("Authorization", "Bearer valid-session-token-123456")
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)

	if extractedUser == nil || extractedUser.Email != testUser.Email {
		t.Fatalf("expected authenticated user from bearer token, got %v", extractedUser)
	}
}
