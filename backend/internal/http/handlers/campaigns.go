package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/campaigns"
	"stansiareco/backend/internal/http/middleware"
)

type CampaignsHandler struct {
	service campaigns.Service
	db      *pgxpool.Pool
}

func NewCampaignsHandler(service campaigns.Service, db *pgxpool.Pool) *CampaignsHandler {
	return &CampaignsHandler{
		service: service,
		db:      db,
	}
}

// -----------------------------------------------------------------------------
// Campaigns CRUD & Lifecycle
// -----------------------------------------------------------------------------

func (h *CampaignsHandler) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))

	var listID *uuid.UUID
	if rawListID := r.URL.Query().Get("mail_list_id"); rawListID != "" {
		if parsed, err := uuid.Parse(rawListID); err == nil {
			listID = &parsed
		}
	}

	filter := campaigns.CampaignFilter{
		Search:     r.URL.Query().Get("search"),
		Status:     r.URL.Query().Get("status"),
		MailListID: listID,
		Page:       page,
		PageSize:   pageSize,
	}

	items, total, err := h.service.List(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"campaigns": items,
		"total":     total,
		"page":      filter.Page,
		"page_size": filter.PageSize,
	})
}

func (h *CampaignsHandler) GetSummaryKPIs(w http.ResponseWriter, r *http.Request) {
	kpis, err := h.service.GetSummaryKPIs(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(kpis)
}

func (h *CampaignsHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	c, err := h.service.GetByID(r.Context(), id)
	if errors.Is(err, campaigns.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Campaign not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"campaign": c})
}

func (h *CampaignsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req campaigns.CreateCampaignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid JSON payload")
		return
	}

	user := middleware.UserFromContext(r.Context())
	var userID uuid.UUID
	if user != nil {
		userID = user.ID
	}

	c, err := h.service.Create(r.Context(), req, userID)
	if errors.Is(err, campaigns.ErrValidationFail) {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"campaign": c})
}

func (h *CampaignsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	var req campaigns.UpdateCampaignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid JSON payload")
		return
	}

	c, err := h.service.Update(r.Context(), id, req)
	if errors.Is(err, campaigns.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Campaign not found")
		return
	}
	if errors.Is(err, campaigns.ErrInvalidStatus) {
		writeError(w, http.StatusConflict, "INVALID_STATUS", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"campaign": c})
}

func (h *CampaignsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	err = h.service.Delete(r.Context(), id)
	if errors.Is(err, campaigns.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Campaign not found")
		return
	}
	if errors.Is(err, campaigns.ErrInvalidStatus) {
		writeError(w, http.StatusConflict, "INVALID_STATUS", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true})
}

// -----------------------------------------------------------------------------
// Lifecycle Controls (Launch, Pause, Resume, Cancel)
// -----------------------------------------------------------------------------

func (h *CampaignsHandler) Launch(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	c, err := h.service.Launch(r.Context(), id)
	if errors.Is(err, campaigns.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Campaign not found")
		return
	}
	if errors.Is(err, campaigns.ErrInvalidStatus) {
		writeError(w, http.StatusConflict, "INVALID_STATUS", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":  "Campaign queued for dispatching",
		"campaign": c,
	})
}

func (h *CampaignsHandler) Pause(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	c, err := h.service.Pause(r.Context(), id)
	if errors.Is(err, campaigns.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Campaign not found")
		return
	}
	if errors.Is(err, campaigns.ErrInvalidStatus) {
		writeError(w, http.StatusConflict, "INVALID_STATUS", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":  "Campaign paused",
		"campaign": c,
	})
}

func (h *CampaignsHandler) Resume(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	c, err := h.service.Resume(r.Context(), id)
	if errors.Is(err, campaigns.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Campaign not found")
		return
	}
	if errors.Is(err, campaigns.ErrInvalidStatus) {
		writeError(w, http.StatusConflict, "INVALID_STATUS", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":  "Campaign resumed",
		"campaign": c,
	})
}

func (h *CampaignsHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	c, err := h.service.Cancel(r.Context(), id)
	if errors.Is(err, campaigns.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Campaign not found")
		return
	}
	if errors.Is(err, campaigns.ErrInvalidStatus) {
		writeError(w, http.StatusConflict, "INVALID_STATUS", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":  "Campaign cancelled",
		"campaign": c,
	})
}

// -----------------------------------------------------------------------------
// Logs, Preview & Test Send
// -----------------------------------------------------------------------------

func (h *CampaignsHandler) ListLogs(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))

	logs, total, err := h.service.ListLogs(r.Context(), id, page, pageSize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"logs":      logs,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func (h *CampaignsHandler) Preview(w http.ResponseWriter, r *http.Request) {
	var req campaigns.PreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid JSON payload")
		return
	}

	resp, err := h.service.Preview(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *CampaignsHandler) TestSend(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	var req campaigns.TestSendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid JSON payload")
		return
	}

	log, err := h.service.TestSend(r.Context(), id, req)
	if errors.Is(err, campaigns.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Campaign not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "Test email spooled successfully",
		"log":     log,
	})
}

func (h *CampaignsHandler) EstimateAudience(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MailListID     uuid.UUID                `json:"mail_list_id"`
		AudienceFilter campaigns.AudienceFilter `json:"audience_filter"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid JSON payload")
		return
	}

	if req.MailListID == uuid.Nil {
		writeError(w, http.StatusBadRequest, "MISSING_LIST_ID", "mail_list_id is required")
		return
	}

	est, err := h.service.EstimateAudience(r.Context(), req.MailListID, req.AudienceFilter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(est)
}

// -----------------------------------------------------------------------------
// Spool File Inspection & Download Bundle
// -----------------------------------------------------------------------------

func (h *CampaignsHandler) GetSpoolFiles(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	files, err := h.service.GetSpoolFiles(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"files": files})
}

func (h *CampaignsHandler) ReadSpoolFile(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	fileName := r.URL.Query().Get("file")
	if fileName == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FILE", "file query parameter is required")
		return
	}

	content, err := h.service.ReadSpoolFile(r.Context(), id, fileName)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Spool file not found")
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write(content)
}

func (h *CampaignsHandler) DownloadSpoolZip(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid campaign ID")
		return
	}

	reader, size, err := h.service.ArchiveSpool(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer func() { _ = reader.Close() }()

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"campaign-%s-spool.zip\"", id.String()[:8]))
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))

	_, _ = io.Copy(w, reader)
}
