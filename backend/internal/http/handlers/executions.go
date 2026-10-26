package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/execution"
	"stansiareco/backend/internal/http/middleware"
)

type ExecutionsHandler struct {
	service execution.ExecutionService
	db      *pgxpool.Pool
}

func NewExecutionsHandler(service execution.ExecutionService, db *pgxpool.Pool) *ExecutionsHandler {
	return &ExecutionsHandler{
		service: service,
		db:      db,
	}
}

// -----------------------------------------------------------------------------
// Pre-configured Scripts Registry Handlers
// -----------------------------------------------------------------------------

func (h *ExecutionsHandler) ListScripts(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	scripts, err := h.service.ListScripts(r.Context(), category)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"scripts": scripts,
	})
}

func (h *ExecutionsHandler) GetScript(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "scriptID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid script UUID")
		return
	}

	sc, err := h.service.GetScript(r.Context(), id)
	if err != nil {
		if errors.Is(err, execution.ErrScriptNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Script not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"script": sc,
	})
}

func (h *ExecutionsHandler) CreateScript(w http.ResponseWriter, r *http.Request) {
	var req execution.CreateScriptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	sc, err := h.service.CreateScript(r.Context(), req)
	if err != nil {
		if errors.Is(err, execution.ErrScriptSlugExists) {
			writeError(w, http.StatusConflict, "CONFLICT", err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "SCRIPT_CREATE", "script_registry", sc.ID.String(), map[string]any{
			"name":     sc.Name,
			"slug":     sc.Slug,
			"category": sc.Category,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"script":  sc,
		"message": "Pre-configured script saved to registry",
	})
}

func (h *ExecutionsHandler) UpdateScript(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "scriptID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid script UUID")
		return
	}

	var req execution.UpdateScriptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	sc, err := h.service.UpdateScript(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, execution.ErrScriptNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Script not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "SCRIPT_UPDATE", "script_registry", id.String(), map[string]any{
			"name": sc.Name,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"script":  sc,
		"message": "Script updated successfully",
	})
}

func (h *ExecutionsHandler) DeleteScript(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "scriptID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid script UUID")
		return
	}

	if err := h.service.DeleteScript(r.Context(), id); err != nil {
		if errors.Is(err, execution.ErrScriptNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Script not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "SCRIPT_DELETE", "script_registry", id.String(), nil, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "Script deleted from registry",
	})
}

// -----------------------------------------------------------------------------
// Remote Command & Script Execution Handlers
// -----------------------------------------------------------------------------

func (h *ExecutionsHandler) ListExecutions(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	jobs, err := h.service.ListExecutions(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"executions": jobs,
	})
}

func (h *ExecutionsHandler) GetExecution(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "jobID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid execution job UUID")
		return
	}

	job, err := h.service.GetExecution(r.Context(), id)
	if err != nil {
		if errors.Is(err, execution.ErrExecutionNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Execution job not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"execution": job,
	})
}

func (h *ExecutionsHandler) ExecuteCommand(w http.ResponseWriter, r *http.Request) {
	var req execution.ExecuteCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	jobs, err := h.service.ExecuteCommand(r.Context(), req, user.ID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "EXECUTION_FAILED", err.Error())
		return
	}

	_ = recordAudit(r.Context(), h.db, user.ID, "REMOTE_EXECUTION_RUN", "execution_jobs", "batch", map[string]any{
		"execution_type": req.ExecutionType,
		"jobs_count":     len(jobs),
		"use_localhost":  req.UseLocalhost,
	}, r.RemoteAddr, r.UserAgent())

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"executions": jobs,
		"message":    "Remote execution completed",
	})
}

func (h *ExecutionsHandler) StreamExecution(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		curr := w
		for {
			if u, hasUnwrap := curr.(interface{ Unwrap() http.ResponseWriter }); hasUnwrap {
				curr = u.Unwrap()
				if f, isFlusher := curr.(http.Flusher); isFlusher {
					flusher = f
					ok = true
					break
				}
			} else {
				break
			}
		}
	}
	if !ok {
		writeError(w, http.StatusBadRequest, "STREAMING_NOT_SUPPORTED", "HTTP response flusher not supported")
		return
	}

	var req execution.ExecuteCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	// Prepare SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	var streamMu sync.Mutex
	sendEvent := func(ev execution.StreamLogEvent) {
		streamMu.Lock()
		defer streamMu.Unlock()
		data, err := json.Marshal(ev)
		if err == nil {
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}

	jobs, err := h.service.ExecuteCommandStream(r.Context(), req, user.ID, sendEvent)
	if err != nil {
		sendEvent(execution.StreamLogEvent{
			Type:  "error",
			Error: err.Error(),
		})
	} else {
		sendEvent(execution.StreamLogEvent{
			Type: "complete",
			Jobs: jobs,
		})
		_ = recordAudit(r.Context(), h.db, user.ID, "REMOTE_EXECUTION_STREAM", "execution_jobs", "batch", map[string]any{
			"execution_type": req.ExecutionType,
			"jobs_count":     len(jobs),
			"use_localhost":  req.UseLocalhost,
		}, r.RemoteAddr, r.UserAgent())
	}
}

// -----------------------------------------------------------------------------
// Live SSH Terminal (TTY) Handlers
// -----------------------------------------------------------------------------

func (h *ExecutionsHandler) ListTerminalSessions(w http.ResponseWriter, r *http.Request) {
	sessions := h.service.ListTerminalSessions()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"sessions": sessions,
	})
}

func (h *ExecutionsHandler) CreateTerminalSession(w http.ResponseWriter, r *http.Request) {
	var req execution.CreateTerminalSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	user := middleware.UserFromContext(r.Context())
	userID := uuid.Nil
	if user != nil {
		userID = user.ID
	}

	sessionInfo, err := h.service.CreateTerminalSession(r.Context(), req, userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "TERMINAL_CONNECT_FAILED", err.Error())
		return
	}

	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "SSH_TTY_OPEN", "terminal_sessions", sessionInfo.SessionID, map[string]any{
			"server_name": sessionInfo.ServerName,
			"server_host": sessionInfo.ServerHost,
			"is_local":    sessionInfo.IsLocal,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"session": sessionInfo,
	})
}

func (h *ExecutionsHandler) WriteTerminalInput(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	var payload struct {
		Data string `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	if err := h.service.WriteTerminalInput(sessionID, payload.Data); err != nil {
		if errors.Is(err, execution.ErrSessionNotFound) {
			writeError(w, http.StatusNotFound, "SESSION_NOT_FOUND", err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, "WRITE_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status": "ok",
	})
}

func (h *ExecutionsHandler) ReadTerminalOutput(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	offset := 0
	if offStr := r.URL.Query().Get("offset"); offStr != "" {
		if parsed, err := strconv.Atoi(offStr); err == nil {
			offset = parsed
		}
	}

	chunk, err := h.service.ReadTerminalOutput(sessionID, offset)
	if err != nil {
		if errors.Is(err, execution.ErrSessionNotFound) {
			writeError(w, http.StatusNotFound, "SESSION_NOT_FOUND", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "READ_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(chunk)
}

func (h *ExecutionsHandler) ResizeTerminal(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	var payload struct {
		Cols int `json:"cols"`
		Rows int `json:"rows"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	if err := h.service.ResizeTerminal(sessionID, payload.Cols, payload.Rows); err != nil {
		writeError(w, http.StatusBadRequest, "RESIZE_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status": "resized",
	})
}

func (h *ExecutionsHandler) CloseTerminalSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	_ = h.service.CloseTerminalSession(sessionID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "Terminal session closed",
	})
}

func (h *ExecutionsHandler) ServeTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	h.service.ServeTerminalWebSocket(w, r, sessionID)
}

// -----------------------------------------------------------------------------
// iRedMail Server Deployments & DNS Automation Pipeline Handlers
// -----------------------------------------------------------------------------

func (h *ExecutionsHandler) ListIRedMailServers(w http.ResponseWriter, r *http.Request) {
	servers, err := h.service.ListIRedMailServers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"iredmail_servers": servers,
	})
}

func (h *ExecutionsHandler) GetIRedMailServer(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid iRedMail server UUID")
		return
	}

	srv, err := h.service.GetIRedMailServer(r.Context(), id)
	if err != nil {
		if errors.Is(err, execution.ErrIRedMailNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"iredmail_server": srv,
	})
}

func (h *ExecutionsHandler) CheckServerUbuntuOS(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		ServerID uuid.UUID `json:"server_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.ServerID == uuid.Nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Valid server_id is required")
		return
	}

	res, err := h.service.CheckServerUbuntuOS(r.Context(), payload.ServerID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "OS_CHECK_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}

func (h *ExecutionsHandler) CreateIRedMailServer(w http.ResponseWriter, r *http.Request) {
	var req execution.CreateIRedMailServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	srv, err := h.service.CreateIRedMailServer(r.Context(), req, user.ID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "DEPLOYMENT_FAILED", err.Error())
		return
	}

	_ = recordAudit(r.Context(), h.db, user.ID, "IREDMAIL_DEPLOY_START", "iredmail_servers", srv.ID.String(), map[string]any{
		"server_id":   srv.ServerID,
		"domain_id":   srv.DomainID,
		"hostname":    srv.Hostname,
		"mail_domain": srv.MailDomain,
	}, r.RemoteAddr, r.UserAgent())

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"iredmail_server": srv,
		"message":         "iRedMail deployment pipeline started",
	})
}

func (h *ExecutionsHandler) RetryIRedMailServer(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid iRedMail server UUID")
		return
	}

	srv, err := h.service.RetryIRedMailServer(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadRequest, "RETRY_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"iredmail_server": srv,
		"message":         "iRedMail deployment pipeline restarted",
	})
}

func (h *ExecutionsHandler) SyncIRedMailDNSAndDKIM(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid iRedMail server UUID")
		return
	}

	srv, err := h.service.SyncIRedMailDNSAndDKIM(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadRequest, "DNS_SYNC_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"iredmail_server": srv,
		"message":         "DKIM key extracted and all DNS records synchronized to registrar",
	})
}

func (h *ExecutionsHandler) DeleteIRedMailServer(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid iRedMail server UUID")
		return
	}

	removeContainer := r.URL.Query().Get("remove_container") == "true"
	if err := h.service.DeleteIRedMailServer(r.Context(), id, removeContainer); err != nil {
		if errors.Is(err, execution.ErrIRedMailNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "DELETE_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "iRedMail server deployment removed",
	})
}

