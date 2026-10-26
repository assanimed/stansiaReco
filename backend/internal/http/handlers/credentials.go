package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/credentials"
	"stansiareco/backend/internal/http/middleware"
)

type CredentialsHandler struct {
	credentialService credentials.Service
	db                *pgxpool.Pool
}

func NewCredentialsHandler(credentialService credentials.Service, db *pgxpool.Pool) *CredentialsHandler {
	return &CredentialsHandler{
		credentialService: credentialService,
		db:                db,
	}
}

// List handles GET /api/v1/credentials
func (h *CredentialsHandler) List(w http.ResponseWriter, r *http.Request) {
	credType := r.URL.Query().Get("type")
	list, err := h.credentialService.ListCredentials(r.Context(), credType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"credentials": list,
	})
}

// GetByID handles GET /api/v1/credentials/{credentialID}
func (h *CredentialsHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "credentialID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid credential UUID")
		return
	}

	cred, err := h.credentialService.GetCredential(r.Context(), id)
	if err != nil {
		if errors.Is(err, credentials.ErrCredentialNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Credential not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"credential": cred,
	})
}

// Create handles POST /api/v1/credentials
func (h *CredentialsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req credentials.CreateCredentialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON payload")
		return
	}

	created, err := h.credentialService.CreateCredential(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	actingUser := middleware.UserFromContext(r.Context())
	if actingUser != nil {
		_ = recordAudit(r.Context(), h.db, actingUser.ID, "CREDENTIAL_CREATE", "credentials", created.ID.String(), map[string]any{
			"name":      created.Name,
			"cred_type": created.CredType,
			"username":  created.Username,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"credential": created,
	})
}

// Delete handles DELETE /api/v1/credentials/{credentialID}
func (h *CredentialsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "credentialID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid credential UUID")
		return
	}

	err = h.credentialService.DeleteCredential(r.Context(), id)
	if err != nil {
		if errors.Is(err, credentials.ErrCredentialNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Credential not found")
			return
		}
		if errors.Is(err, credentials.ErrCredentialInUse) {
			writeError(w, http.StatusConflict, "CREDENTIAL_IN_USE", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	actingUser := middleware.UserFromContext(r.Context())
	if actingUser != nil {
		_ = recordAudit(r.Context(), h.db, actingUser.ID, "CREDENTIAL_DELETE", "credentials", id.String(), nil, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "Credential removed successfully from vault",
	})
}
