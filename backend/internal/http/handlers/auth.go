package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/auth"
	"stansiareco/backend/internal/http/middleware"
)

type AuthHandler struct {
	db         *pgxpool.Pool
	hasher     auth.PasswordHasher
	sessionMgr auth.SessionManager
	rbac       auth.RBACService
	sessionTTL time.Duration
	isProd     bool
}

func NewAuthHandler(
	db *pgxpool.Pool,
	hasher auth.PasswordHasher,
	sessionMgr auth.SessionManager,
	rbac auth.RBACService,
	sessionTTL time.Duration,
	isProd bool,
) *AuthHandler {
	return &AuthHandler{
		db:         db,
		hasher:     hasher,
		sessionMgr: sessionMgr,
		rbac:       rbac,
		sessionTTL: sessionTTL,
		isProd:     isProd,
	}
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token       string                `json:"token"`
	User        auth.AuthenticatedUser `json:"user"`
	Permissions []auth.PermissionRule `json:"permissions"`
}

// Login verifies credentials, creates a session, and sets an HttpOnly cookie
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", "Email and password are required")
		return
	}

	// Query user from PostgreSQL
	query := `
		SELECT id, email, password_hash, full_name, role, is_active, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	var user auth.AuthenticatedUser
	var passwordHash string

	err := h.db.QueryRow(r.Context(), query, req.Email).Scan(
		&user.ID,
		&user.Email,
		&passwordHash,
		&user.FullName,
		&user.Role,
		&user.IsActive,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Invalid email or password")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Database query failed")
		return
	}

	if !user.IsActive {
		writeError(w, http.StatusForbidden, "ACCOUNT_DISABLED", "User account has been disabled")
		return
	}

	// Verify Argon2id password hash
	match, err := h.hasher.VerifyPassword(req.Password, passwordHash)
	if err != nil || !match {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Invalid email or password")
		return
	}

	// Create session
	ip := r.RemoteAddr
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		ip = strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	userAgent := r.UserAgent()

	rawToken, session, err := h.sessionMgr.CreateSession(r.Context(), user.ID, ip, userAgent, h.sessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create session")
		return
	}

	// Set HttpOnly session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CookieSession,
		Value:    rawToken,
		Path:     "/",
		Expires:  session.ExpiresAt,
		MaxAge:   int(h.sessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.isProd,
		SameSite: http.SameSiteLaxMode,
	})

	// Retrieve effective permissions
	perms, err := h.rbac.GetUserPermissions(r.Context(), user.ID, user.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to retrieve permissions")
		return
	}

	// Emit audit log
	_ = recordAudit(r.Context(), h.db, user.ID, "USER_LOGIN", "users", user.ID.String(), map[string]any{
		"email": user.Email,
		"ip":    ip,
	}, ip, userAgent)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(LoginResponse{
		Token:       rawToken,
		User:        user,
		Permissions: perms,
	})
}

// Logout terminates current session and clears the cookie
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	// Extract token
	var token string
	if cookie, err := r.Cookie(middleware.CookieSession); err == nil {
		token = cookie.Value
	}
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			token = strings.TrimSpace(authHeader[7:])
		}
	}

	if token != "" {
		_ = h.sessionMgr.InvalidateSession(r.Context(), token)
	}

	// Clear cookie
	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CookieSession,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.isProd,
		SameSite: http.SameSiteLaxMode,
	})

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "USER_LOGOUT", "users", user.ID.String(), nil, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "success",
		"message": "Logged out successfully",
	})
}

// Me returns the current authenticated user and permissions
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	perms, err := h.rbac.GetUserPermissions(r.Context(), user.ID, user.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to retrieve permissions")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"user":        user,
		"permissions": perms,
	})
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}

func recordAudit(
	ctx context.Context,
	db *pgxpool.Pool,
	userID uuid.UUID,
	action, resourceType, resourceID string,
	details map[string]any,
	ipAddress, userAgent string,
) error {
	detailsJSON, _ := json.Marshal(details)
	query := `
		INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
	`
	_, err := db.Exec(ctx, query, userID, action, resourceType, resourceID, detailsJSON, ipAddress, userAgent)
	return err
}
