package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/auth"
	"stansiareco/backend/internal/config"
	"stansiareco/backend/internal/database"
	internalhttp "stansiareco/backend/internal/http"
	"stansiareco/backend/internal/http/middleware"
)

func setupTestDB(t *testing.T) (*pgxpool.Pool, *config.Config) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://med@127.0.0.1:5432/stansiareco?sslmode=disable"
	}

	cfg := &config.Config{
		Environment:     "test",
		Port:            "8080",
		DatabaseURL:     dbURL,
		DBMaxConns:      10,
		DBMinConns:      2,
		DBMaxIdleTime:   5 * time.Minute,
		DBMaxConnLife:   15 * time.Minute,
		SessionSecret:   "test-secret-key-at-least-32-chars-long",
		SessionTTL:      1 * time.Hour,
		CORSOrigins:     []string{"http://localhost:3000"},
		AllowPrivateIPs: true,
		LogLevel:        "warn",
		AdminEmail:      "admin@test.local",
		AdminPassword:   "TestAdminPass123!#",
		AdminName:       "Test Admin",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := database.NewPool(ctx, cfg)
	if err != nil {
		t.Skipf("skipping database integration test: PostgreSQL not reachable at %s (%v)", dbURL, err)
		return nil, nil
	}

	// Apply migrations
	if err := database.RunMigrations(ctx, pool); err != nil {
		t.Fatalf("failed to apply migrations: %v", err)
	}

	return pool, cfg
}

func TestIntegration_AuthAndSessionLifecycle(t *testing.T) {
	pool, _ := setupTestDB(t)
	if pool == nil {
		return
	}
	defer pool.Close()

	ctx := context.Background()
	hasher := auth.NewArgon2Hasher()
	sessionMgr := auth.NewPostgresSessionManager(pool)
	rbac := auth.NewPostgresRBACService(pool)

	// 1. Create a test user with Argon2id hash
	testEmail := "test-user-" + uuid.New().String()[:8] + "@stansiareco.local"
	plainPassword := "SecretPassword123!#"
	hash, err := hasher.HashPassword(plainPassword)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	userID := uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
	`, userID, testEmail, hash, "Integration Test User", "operator", true)
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}

	// Clean up after test
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", userID)
	}()

	// 2. Test Session Creation
	rawToken, session, err := sessionMgr.CreateSession(ctx, userID, "127.0.0.1", "integration-test-agent", 1*time.Hour)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}
	if rawToken == "" || session == nil {
		t.Fatal("expected non-empty token and session")
	}

	// Verify rawToken is NEVER stored in database
	var storedTokenHash string
	err = pool.QueryRow(ctx, "SELECT token_hash FROM sessions WHERE id = $1", session.ID).Scan(&storedTokenHash)
	if err != nil {
		t.Fatalf("failed to query session from DB: %v", err)
	}
	if storedTokenHash == rawToken {
		t.Fatal("security violation: raw session token was stored directly in database")
	}
	expectedHash := auth.HashSessionToken(rawToken)
	if storedTokenHash != expectedHash {
		t.Fatalf("expected stored hash %s, got %s", expectedHash, storedTokenHash)
	}

	// 3. Test Session Validation
	sessCtx, err := sessionMgr.ValidateSession(ctx, rawToken)
	if err != nil {
		t.Fatalf("expected session to be valid, got error: %v", err)
	}
	if sessCtx.User.Email != testEmail {
		t.Fatalf("expected user email %s, got %s", testEmail, sessCtx.User.Email)
	}
	if sessCtx.User.Role != "operator" {
		t.Fatalf("expected role operator, got %s", sessCtx.User.Role)
	}

	// 4. Test Invalidation
	if err := sessionMgr.InvalidateSession(ctx, rawToken); err != nil {
		t.Fatalf("failed to invalidate session: %v", err)
	}

	// Verify session cannot be used after invalidation
	_, err = sessionMgr.ValidateSession(ctx, rawToken)
	if err != auth.ErrInvalidSession {
		t.Fatalf("expected ErrInvalidSession after invalidation, got %v", err)
	}

	// 5. Test RBAC permissions & user override
	// Operator default for servers: view=true, delete=false
	canView, err := rbac.HasPermission(ctx, userID, "operator", auth.ResourceServers, auth.ActionView)
	if err != nil || !canView {
		t.Fatalf("expected operator to have view permission on servers, got %v (err: %v)", canView, err)
	}

	canDelete, err := rbac.HasPermission(ctx, userID, "operator", auth.ResourceServers, auth.ActionDelete)
	if err != nil || canDelete {
		t.Fatalf("expected operator to NOT have delete permission on servers, got %v", canDelete)
	}

	// Set custom user override granting delete to this specific user
	overrideRule := auth.PermissionRule{
		Resource:  auth.ResourceServers,
		CanView:   true,
		CanInsert: true,
		CanUpdate: true,
		CanDelete: true, // explicitly granted
	}
	if err := rbac.SetUserPermission(ctx, userID, overrideRule); err != nil {
		t.Fatalf("failed to set user permission override: %v", err)
	}

	// Re-verify: now user should have delete permission
	canDeleteOverride, err := rbac.HasPermission(ctx, userID, "operator", auth.ResourceServers, auth.ActionDelete)
	if err != nil || !canDeleteOverride {
		t.Fatalf("expected user override to grant delete permission, got %v", canDeleteOverride)
	}

	// Revert/delete user override
	if err := rbac.DeleteUserPermission(ctx, userID, auth.ResourceServers); err != nil {
		t.Fatalf("failed to delete user override: %v", err)
	}
	canDeleteAfterRevert, _ := rbac.HasPermission(ctx, userID, "operator", auth.ResourceServers, auth.ActionDelete)
	if canDeleteAfterRevert {
		t.Fatal("expected delete permission to be reverted back to false")
	}
}

func TestIntegration_HTTPAuthEndpoints(t *testing.T) {
	pool, cfg := setupTestDB(t)
	if pool == nil {
		return
	}
	defer pool.Close()

	ctx := context.Background()
	hasher := auth.NewArgon2Hasher()
	sessionMgr := auth.NewPostgresSessionManager(pool)
	rbac := auth.NewPostgresRBACService(pool)

	// Ensure administrator exists
	adminEmail := "integration-admin@stansiareco.local"
	adminPass := "AdminP@ssw0rd999!#"
	adminUser, err := auth.EnsureAdminUser(ctx, pool, hasher, adminEmail, adminPass, "Integration Admin")
	if err != nil {
		t.Fatalf("failed to ensure admin user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminUser.ID)
	}()

	router := internalhttp.NewRouter(internalhttp.RouterDependencies{
		Config:     cfg,
		DBPool:     pool,
		Hasher:     hasher,
		SessionMgr: sessionMgr,
		RBAC:       rbac,
	})

	// 1. Test Login with Invalid Credentials
	badLoginBody, _ := json.Marshal(map[string]string{
		"email":    adminEmail,
		"password": "WrongPassword!",
	})
	reqBad := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(badLoginBody))
	reqBad.Header.Set("Content-Type", "application/json")
	rrBad := httptest.NewRecorder()
	router.ServeHTTP(rrBad, reqBad)

	if rrBad.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong password, got %d", rrBad.Code)
	}

	// 2. Test Login with Correct Credentials
	loginBody, _ := json.Marshal(map[string]string{
		"email":    adminEmail,
		"password": adminPass,
	})
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	reqLogin.Header.Set("Content-Type", "application/json")
	rrLogin := httptest.NewRecorder()
	router.ServeHTTP(rrLogin, reqLogin)

	if rrLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 for valid login, got %d (body: %s)", rrLogin.Code, rrLogin.Body.String())
	}

	// Extract session cookie and response body
	cookies := rrLogin.Result().Cookies()
	var sessionCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == middleware.CookieSession {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatal("expected session cookie 'sr_session' to be set")
	}
	if !sessionCookie.HttpOnly {
		t.Fatal("expected session cookie to be HttpOnly")
	}

	var loginResp map[string]any
	if err := json.Unmarshal(rrLogin.Body.Bytes(), &loginResp); err != nil {
		t.Fatalf("failed to parse login response: %v", err)
	}
	tokenStr, _ := loginResp["token"].(string)
	if tokenStr == "" {
		t.Fatal("expected token string in response body")
	}

	// 3. Test GET /api/v1/auth/me with Cookie
	reqMe := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	reqMe.AddCookie(sessionCookie)
	rrMe := httptest.NewRecorder()
	router.ServeHTTP(rrMe, reqMe)

	if rrMe.Code != http.StatusOK {
		t.Fatalf("expected 200 for /auth/me, got %d", rrMe.Code)
	}

	var meResp map[string]any
	if err := json.Unmarshal(rrMe.Body.Bytes(), &meResp); err != nil {
		t.Fatalf("failed to parse /auth/me response: %v", err)
	}
	userMap, ok := meResp["user"].(map[string]any)
	if !ok || userMap["email"] != adminEmail {
		t.Fatalf("expected user email %s, got %v", adminEmail, userMap["email"])
	}

	// 4. Test GET /api/v1/auth/me with Bearer token
	reqMeBearer := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	reqMeBearer.Header.Set("Authorization", "Bearer "+tokenStr)
	rrMeBearer := httptest.NewRecorder()
	router.ServeHTTP(rrMeBearer, reqMeBearer)

	if rrMeBearer.Code != http.StatusOK {
		t.Fatalf("expected 200 for /auth/me with Bearer token, got %d", rrMeBearer.Code)
	}

	// 5. Test Logout
	reqLogout := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	reqLogout.AddCookie(sessionCookie)
	rrLogout := httptest.NewRecorder()
	router.ServeHTTP(rrLogout, reqLogout)

	if rrLogout.Code != http.StatusOK {
		t.Fatalf("expected 200 for /auth/logout, got %d", rrLogout.Code)
	}

	// Check cookie was cleared (MaxAge < 0)
	logoutCookies := rrLogout.Result().Cookies()
	var clearedCookie *http.Cookie
	for _, c := range logoutCookies {
		if c.Name == middleware.CookieSession {
			clearedCookie = c
			break
		}
	}
	if clearedCookie == nil || clearedCookie.MaxAge >= 0 {
		t.Fatal("expected session cookie to be cleared with MaxAge < 0")
	}

	// 6. Test GET /api/v1/auth/me after logout -> should be 401 Unauthorized
	reqMeAfter := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	reqMeAfter.AddCookie(sessionCookie) // old token
	rrMeAfter := httptest.NewRecorder()
	router.ServeHTTP(rrMeAfter, reqMeAfter)

	if rrMeAfter.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 after logout, got %d", rrMeAfter.Code)
	}
}
