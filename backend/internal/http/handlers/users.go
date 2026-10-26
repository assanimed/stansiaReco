package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/http/middleware"
	"stansiareco/backend/internal/users"
)

type UsersHandler struct {
	userService users.Service
	db          *pgxpool.Pool
}

func NewUsersHandler(userService users.Service, db *pgxpool.Pool) *UsersHandler {
	return &UsersHandler{
		userService: userService,
		db:          db,
	}
}

// List handles GET /api/v1/users
func (h *UsersHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.userService.ListUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"users": list,
	})
}

// GetByID handles GET /api/v1/users/{userID}
func (h *UsersHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "userID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid user UUID")
		return
	}

	u, err := h.userService.GetUserByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, users.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "User not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(u)
}

// Create handles POST /api/v1/users
func (h *UsersHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req users.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	created, err := h.userService.CreateUser(r.Context(), req)
	if err != nil {
		if errors.Is(err, users.ErrEmailExists) {
			writeError(w, http.StatusConflict, "EMAIL_EXISTS", err.Error())
			return
		}
		if errors.Is(err, users.ErrInvalidRole) {
			writeError(w, http.StatusBadRequest, "INVALID_ROLE", err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	// Audit log
	actingUser := middleware.UserFromContext(r.Context())
	if actingUser != nil {
		_ = recordAudit(r.Context(), h.db, actingUser.ID, "USER_CREATE", "users", created.ID.String(), map[string]any{
			"email": created.Email,
			"role":  created.Role,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(created)
}

// Update handles PUT /api/v1/users/{userID}
func (h *UsersHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "userID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid user UUID")
		return
	}

	var req users.UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	updated, err := h.userService.UpdateUser(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, users.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "User not found")
			return
		}
		if errors.Is(err, users.ErrInvalidRole) {
			writeError(w, http.StatusBadRequest, "INVALID_ROLE", err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, "UPDATE_ERROR", err.Error())
		return
	}

	// Audit log
	actingUser := middleware.UserFromContext(r.Context())
	if actingUser != nil {
		_ = recordAudit(r.Context(), h.db, actingUser.ID, "USER_UPDATE", "users", updated.ID.String(), map[string]any{
			"email": updated.Email,
			"role":  updated.Role,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(updated)
}

// Delete handles DELETE /api/v1/users/{userID}
func (h *UsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "userID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid user UUID")
		return
	}

	actingUser := middleware.UserFromContext(r.Context())
	requestingUserID := uuid.Nil
	if actingUser != nil {
		requestingUserID = actingUser.ID
	}

	err = h.userService.DeleteUser(r.Context(), id, requestingUserID)
	if err != nil {
		if errors.Is(err, users.ErrCannotDeleteSelf) {
			writeError(w, http.StatusBadRequest, "SELF_DELETE_FORBIDDEN", err.Error())
			return
		}
		if errors.Is(err, users.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "User not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	// Audit log
	if actingUser != nil {
		_ = recordAudit(r.Context(), h.db, actingUser.ID, "USER_DELETE", "users", id.String(), nil, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "success",
		"message": "User deleted successfully",
	})
}
