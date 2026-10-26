package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"stansiareco/backend/internal/auth"
)

type userContextKey string

const (
	UserCtxKey    userContextKey = "authenticated_user"
	SessionCtxKey userContextKey = "session"
	CookieSession                = "sr_session"
)

// Authenticate extracts session token from cookie or Authorization header and attaches user to context
func Authenticate(sessionMgr auth.SessionManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractToken(r)
			if token == "" {
				next.ServeHTTP(w, r)
				return
			}

			sessCtx, err := sessionMgr.ValidateSession(r.Context(), token)
			if err != nil {
				// Invalid or expired token: continue unauthenticated
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), UserCtxKey, sessCtx.User)
			ctx = context.WithValue(ctx, SessionCtxKey, sessCtx.Session)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAuth blocks unauthenticated requests with 401 Unauthorized
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequirePermission enforces fine-grained RBAC rules (resource + action)
func RequirePermission(rbac auth.RBACService, resource string, action auth.Action) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromContext(r.Context())
			if user == nil {
				writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
				return
			}

			allowed, err := rbac.HasPermission(r.Context(), user.ID, user.Role, resource, action)
			if err != nil {
				writeJSONError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to evaluate permissions")
				return
			}

			if !allowed {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"error": map[string]any{
						"code":    "PERMISSION_DENIED",
						"message": "You do not have permission to access this resource",
						"details": map[string]any{
							"resource": resource,
							"action":   action,
						},
					},
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// UserFromContext retrieves the authenticated user from context
func UserFromContext(ctx context.Context) *auth.AuthenticatedUser {
	if u, ok := ctx.Value(UserCtxKey).(*auth.AuthenticatedUser); ok {
		return u
	}
	return nil
}

// SessionFromContext retrieves the active session from context
func SessionFromContext(ctx context.Context) *auth.Session {
	if s, ok := ctx.Value(SessionCtxKey).(*auth.Session); ok {
		return s
	}
	return nil
}

func extractToken(r *http.Request) string {
	// 1. Try session cookie first
	if cookie, err := r.Cookie(CookieSession); err == nil && cookie.Value != "" {
		return cookie.Value
	}

	// 2. Try Authorization: Bearer <token>
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return strings.TrimSpace(parts[1])
		}
	}

	return ""
}

func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}
