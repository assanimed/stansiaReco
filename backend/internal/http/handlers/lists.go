package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/http/middleware"
	"stansiareco/backend/internal/lists"
)

type ListsHandler struct {
	service lists.Service
	db      *pgxpool.Pool
}

func NewListsHandler(service lists.Service, db *pgxpool.Pool) *ListsHandler {
	return &ListsHandler{
		service: service,
		db:      db,
	}
}

// -----------------------------------------------------------------------------
// Mailbox Providers
// -----------------------------------------------------------------------------

func (h *ListsHandler) ListMailboxProviders(w http.ResponseWriter, r *http.Request) {
	onlyActive := r.URL.Query().Get("active") == "true"
	providers, err := h.service.ListMailboxProviders(r.Context(), onlyActive)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"providers": providers})
}

func (h *ListsHandler) GetMailboxProvider(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider ID")
		return
	}
	p, err := h.service.GetMailboxProvider(r.Context(), id)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Provider not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p)
}

func (h *ListsHandler) CreateMailboxProvider(w http.ResponseWriter, r *http.Request) {
	var req lists.CreateMailboxProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	p, err := h.service.CreateMailboxProvider(r.Context(), req)
	if errors.Is(err, lists.ErrConflict) {
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(p)
}

func (h *ListsHandler) UpdateMailboxProvider(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider ID")
		return
	}
	var req lists.UpdateMailboxProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	p, err := h.service.UpdateMailboxProvider(r.Context(), id, req)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Provider not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "UPDATE_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p)
}

// -----------------------------------------------------------------------------
// Sending ESPs
// -----------------------------------------------------------------------------

func (h *ListsHandler) ListSendingESPs(w http.ResponseWriter, r *http.Request) {
	onlyActive := r.URL.Query().Get("active") == "true"
	esps, err := h.service.ListSendingESPs(r.Context(), onlyActive)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"esps": esps})
}

func (h *ListsHandler) GetSendingESP(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid ESP ID")
		return
	}
	e, err := h.service.GetSendingESP(r.Context(), id)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Sending ESP not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(e)
}

func (h *ListsHandler) CreateSendingESP(w http.ResponseWriter, r *http.Request) {
	var req lists.CreateSendingESPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	e, err := h.service.CreateSendingESP(r.Context(), req)
	if errors.Is(err, lists.ErrConflict) {
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(e)
}

func (h *ListsHandler) UpdateSendingESP(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid ESP ID")
		return
	}
	var req lists.UpdateSendingESPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	e, err := h.service.UpdateSendingESP(r.Context(), id, req)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Sending ESP not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "UPDATE_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(e)
}

// -----------------------------------------------------------------------------
// Sending IP Pools
// -----------------------------------------------------------------------------

func (h *ListsHandler) ListSendingIPPools(w http.ResponseWriter, r *http.Request) {
	onlyActive := r.URL.Query().Get("active") == "true"
	pools, err := h.service.ListSendingIPPools(r.Context(), onlyActive)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"pools": pools})
}

func (h *ListsHandler) GetSendingIPPool(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid pool ID")
		return
	}
	p, err := h.service.GetSendingIPPool(r.Context(), id)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "IP pool not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p)
}

func (h *ListsHandler) CreateSendingIPPool(w http.ResponseWriter, r *http.Request) {
	var req lists.CreateSendingIPPoolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	p, err := h.service.CreateSendingIPPool(r.Context(), req)
	if errors.Is(err, lists.ErrConflict) {
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(p)
}

func (h *ListsHandler) UpdateSendingIPPool(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid pool ID")
		return
	}
	var req lists.UpdateSendingIPPoolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	p, err := h.service.UpdateSendingIPPool(r.Context(), id, req)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "IP pool not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "UPDATE_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p)
}

// -----------------------------------------------------------------------------
// Countries & Verticals
// -----------------------------------------------------------------------------

func (h *ListsHandler) ListCountries(w http.ResponseWriter, r *http.Request) {
	onlyActive := r.URL.Query().Get("active") == "true"
	cList, err := h.service.ListCountries(r.Context(), onlyActive)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"countries": cList})
}

func (h *ListsHandler) CreateCountry(w http.ResponseWriter, r *http.Request) {
	var req lists.CreateCountryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	c, err := h.service.CreateCountry(r.Context(), req)
	if errors.Is(err, lists.ErrConflict) {
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(c)
}

func (h *ListsHandler) ToggleCountry(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid country ID")
		return
	}
	var req struct {
		IsActive bool `json:"is_active"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if err := h.service.ToggleCountry(r.Context(), id, req.IsActive); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"message": "Country updated"})
}

func (h *ListsHandler) ListVerticals(w http.ResponseWriter, r *http.Request) {
	onlyActive := r.URL.Query().Get("active") == "true"
	vList, err := h.service.ListVerticals(r.Context(), onlyActive)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"verticals": vList})
}

func (h *ListsHandler) CreateVertical(w http.ResponseWriter, r *http.Request) {
	var req lists.CreateVerticalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	v, err := h.service.CreateVertical(r.Context(), req)
	if errors.Is(err, lists.ErrConflict) {
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(v)
}

func (h *ListsHandler) ToggleVertical(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid vertical ID")
		return
	}
	var req struct {
		IsActive bool `json:"is_active"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if err := h.service.ToggleVertical(r.Context(), id, req.IsActive); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"message": "Vertical updated"})
}

// -----------------------------------------------------------------------------
// Mail Lists
// -----------------------------------------------------------------------------

func (h *ListsHandler) ListMailLists(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page <= 0 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize <= 0 {
		pageSize = 20
	}

	filter := lists.ListFilter{
		Search:    r.URL.Query().Get("search"),
		Status:    r.URL.Query().Get("status"),
		Page:      page,
		PageSize:  pageSize,
		SortBy:    r.URL.Query().Get("sortBy"),
		SortOrder: r.URL.Query().Get("sortOrder"),
	}
	if pID, err := uuid.Parse(r.URL.Query().Get("provider_id")); err == nil {
		filter.ProviderID = &pID
	}
	if cID, err := uuid.Parse(r.URL.Query().Get("country_id")); err == nil {
		filter.CountryID = &cID
	}
	if vID, err := uuid.Parse(r.URL.Query().Get("vertical_id")); err == nil {
		filter.VerticalID = &vID
	}
	if minStr := r.URL.Query().Get("min_contacts"); minStr != "" {
		if val, err := strconv.ParseInt(minStr, 10, 64); err == nil {
			filter.MinContacts = &val
		}
	}
	if maxStr := r.URL.Query().Get("max_contacts"); maxStr != "" {
		if val, err := strconv.ParseInt(maxStr, 10, 64); err == nil {
			filter.MaxContacts = &val
		}
	}

	mLists, total, err := h.service.ListMailLists(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"lists":       mLists,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

func (h *ListsHandler) GetMailList(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid list ID")
		return
	}
	l, err := h.service.GetMailList(r.Context(), id)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Mail list not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(l)
}

func (h *ListsHandler) CreateMailList(w http.ResponseWriter, r *http.Request) {
	var req lists.CreateMailListRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	l, err := h.service.CreateMailList(r.Context(), req)
	if errors.Is(err, lists.ErrConflict) {
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(l)
}

func (h *ListsHandler) UpdateMailList(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid list ID")
		return
	}
	var req lists.UpdateMailListRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	l, err := h.service.UpdateMailList(r.Context(), id, req)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Mail list not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "UPDATE_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(l)
}

func (h *ListsHandler) SetMailListStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid list ID")
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	if err := h.service.SetMailListStatus(r.Context(), id, req.Status); err != nil {
		writeError(w, http.StatusBadRequest, "STATUS_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"message": "List status updated", "status": req.Status})
}

func (h *ListsHandler) GetMailListMetrics(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid list ID")
		return
	}
	m, err := h.service.GetMailListMetrics(r.Context(), id)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Mail list not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(m)
}

func (h *ListsHandler) GetGlobalSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.service.GetGlobalSummary(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(summary)
}

// -----------------------------------------------------------------------------
// Contacts
// -----------------------------------------------------------------------------

func (h *ListsHandler) ListContacts(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page <= 0 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize <= 0 {
		pageSize = 25
	}

	filter := lists.ContactFilter{
		Search:      r.URL.Query().Get("search"),
		CountryCode: r.URL.Query().Get("country_code"),
		Page:        page,
		PageSize:    pageSize,
	}
	if lID, err := uuid.Parse(r.URL.Query().Get("list_id")); err == nil {
		filter.ListID = &lID
	}
	parseBool := func(key string) *bool {
		if val := r.URL.Query().Get(key); val != "" {
			b := val == "true"
			return &b
		}
		return nil
	}
	filter.IsClean = parseBool("is_clean")
	filter.IsOpener = parseBool("is_opener")
	filter.IsClicker = parseBool("is_clicker")
	filter.IsUnsub = parseBool("is_unsub")
	filter.IsOptout = parseBool("is_optout")
	filter.IsBlacklisted = parseBool("is_blacklisted")
	filter.IsHardBounced = parseBool("is_hard_bounced")

	contactsList, total, err := h.service.ListContacts(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"contacts":    contactsList,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

func (h *ListsHandler) GetContact(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid contact ID")
		return
	}
	c, err := h.service.GetContact(r.Context(), id)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Contact not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(c)
}

func (h *ListsHandler) CreateContact(w http.ResponseWriter, r *http.Request) {
	var req lists.CreateContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	c, err := h.service.CreateContact(r.Context(), req)
	if errors.Is(err, lists.ErrConflict) {
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(c)
}

func (h *ListsHandler) UpdateContact(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid contact ID")
		return
	}
	var req lists.UpdateContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	c, err := h.service.UpdateContact(r.Context(), id, req)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Contact not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "UPDATE_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(c)
}

func (h *ListsHandler) DeleteContact(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid contact ID")
		return
	}
	if err := h.service.DeleteContact(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"message": "Contact deleted"})
}

// -----------------------------------------------------------------------------
// Suppressions
// -----------------------------------------------------------------------------

func (h *ListsHandler) ListSuppressions(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page <= 0 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize <= 0 {
		pageSize = 25
	}

	filter := lists.SuppressionFilter{
		Search:   r.URL.Query().Get("search"),
		Reason:   r.URL.Query().Get("reason"),
		Page:     page,
		PageSize: pageSize,
	}
	if lID, err := uuid.Parse(r.URL.Query().Get("list_id")); err == nil {
		filter.ListID = &lID
	}

	suppressionsList, total, err := h.service.ListSuppressions(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"suppressions": suppressionsList,
		"total":        total,
		"page":         page,
		"page_size":    pageSize,
		"total_pages":  (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

func (h *ListsHandler) CreateSuppression(w http.ResponseWriter, r *http.Request) {
	var req lists.CreateSuppressionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	sup, err := h.service.CreateSuppression(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "CREATION_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(sup)
}

func (h *ListsHandler) BulkCreateSuppressions(w http.ResponseWriter, r *http.Request) {
	var req lists.BulkSuppressionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	count, err := h.service.BulkCreateSuppressions(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"count": count, "message": fmt.Sprintf("Added %d suppression record(s)", count)})
}

func (h *ListsHandler) DeleteSuppression(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid suppression ID")
		return
	}
	if err := h.service.DeleteSuppression(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"message": "Suppression removed"})
}

// -----------------------------------------------------------------------------
// Import Jobs
// -----------------------------------------------------------------------------

func (h *ListsHandler) ListImportJobs(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page <= 0 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize <= 0 {
		pageSize = 20
	}

	filter := lists.ImportJobFilter{
		Status:   r.URL.Query().Get("status"),
		Page:     page,
		PageSize: pageSize,
	}
	if lID, err := uuid.Parse(r.URL.Query().Get("list_id")); err == nil {
		filter.ListID = &lID
	}

	jobs, total, err := h.service.ListImportJobs(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jobs":        jobs,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

func (h *ListsHandler) GetImportJob(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid job ID")
		return
	}
	job, err := h.service.GetImportJob(r.Context(), id)
	if errors.Is(err, lists.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Import job not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(job)
}

func (h *ListsHandler) PreviewCSV(w http.ResponseWriter, r *http.Request) {
	// 50 MB max upload
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_FILE", "File too large or malformed multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "NO_FILE", "No file found in multipart upload (field 'file' required)")
		return
	}
	defer file.Close()

	// Ensure upload directory exists
	uploadDir := filepath.Join(os.TempDir(), "stansiareco_imports")
	_ = os.MkdirAll(uploadDir, 0755)

	tempFileName := fmt.Sprintf("upload_%s_%s", uuid.New().String(), filepath.Base(header.Filename))
	tempFilePath := filepath.Join(uploadDir, tempFileName)

	dst, err := os.Create(tempFilePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "FILE_SAVE_FAILED", "Failed to stage file for parsing")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		writeError(w, http.StatusInternalServerError, "FILE_SAVE_FAILED", "Failed to write staged file")
		return
	}

	preview, err := lists.PreviewCSV(tempFilePath, 10)
	if err != nil {
		_ = os.Remove(tempFilePath)
		writeError(w, http.StatusBadRequest, "CSV_PARSE_FAILED", err.Error())
		return
	}
	preview.Filename = header.Filename

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"preview":       preview,
		"staged_file":   tempFilePath,
		"original_name": header.Filename,
		"size_bytes":    header.Size,
	})
}

func (h *ListsHandler) CreateImportJob(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	var userID uuid.UUID
	if user != nil {
		userID = user.ID
	}

	var req struct {
		ListID            uuid.UUID      `json:"list_id"`
		StagedFilePath    string         `json:"staged_file_path"`
		Filename          string         `json:"filename"`
		FileSizeBytes     int64          `json:"file_size_bytes"`
		ColumnMapping     map[string]int `json:"column_mapping"`
		DuplicateStrategy string         `json:"duplicate_strategy"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}

	if req.ListID == uuid.Nil {
		writeError(w, http.StatusBadRequest, "INVALID_LIST", "Destination list_id is required")
		return
	}
	if req.StagedFilePath == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FILE", "Staged file path required")
		return
	}
	if _, err := os.Stat(req.StagedFilePath); err != nil {
		writeError(w, http.StatusBadRequest, "FILE_NOT_FOUND", "Staged upload file was not found on server")
		return
	}

	job := &lists.ImportJob{
		ID:                uuid.New(),
		ListID:            req.ListID,
		CreatedBy:         userID,
		Filename:          req.Filename,
		FilePath:          req.StagedFilePath,
		FileSizeBytes:     req.FileSizeBytes,
		Status:            "queued",
		ColumnMapping:     req.ColumnMapping,
		DuplicateStrategy: req.DuplicateStrategy,
	}

	if err := h.service.CreateImportJob(r.Context(), job); err != nil {
		writeError(w, http.StatusInternalServerError, "JOB_CREATION_FAILED", err.Error())
		return
	}

	// Trigger asynchronous processing goroutine immediately
	go func(j lists.ImportJob) {
		bgCtx := context.Background()
		_ = h.service.UpdateImportJobStatus(bgCtx, j.ID, "processing")
		_ = lists.ProcessCSVImportJob(bgCtx, h.db, &j)
		_ = h.service.SaveImportJobResults(bgCtx, &j)
	}(*job)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(job)
}

func (h *ListsHandler) CancelImportJob(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid job ID")
		return
	}
	if err := h.service.CancelImportJob(r.Context(), id); err != nil {
		writeError(w, http.StatusBadRequest, "CANCEL_FAILED", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"message": "Import job cancelled"})
}

// -----------------------------------------------------------------------------
// Data Quality, Events, and Settings
// -----------------------------------------------------------------------------

func (h *ListsHandler) GetDataQualityReport(w http.ResponseWriter, r *http.Request) {
	var listID *uuid.UUID
	if lStr := r.URL.Query().Get("list_id"); lStr != "" {
		if id, err := uuid.Parse(lStr); err == nil {
			listID = &id
		}
	}
	report, err := h.service.GetDataQualityReport(r.Context(), listID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(report)
}

func (h *ListsHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page <= 0 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize <= 0 {
		pageSize = 25
	}
	filter := lists.EventFilter{
		EventType: r.URL.Query().Get("event_type"),
		Email:     r.URL.Query().Get("email"),
		Page:      page,
		PageSize:  pageSize,
	}
	if lStr := r.URL.Query().Get("list_id"); lStr != "" {
		if id, err := uuid.Parse(lStr); err == nil {
			filter.ListID = &id
		}
	}
	events, total, err := h.service.ListEvents(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"events":      events,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

func (h *ListsHandler) GetDataSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.service.GetDataSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(settings)
}

func (h *ListsHandler) UpdateDataSettings(w http.ResponseWriter, r *http.Request) {
	var req map[string]any
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload")
		return
	}
	for k, v := range req {
		if err := h.service.UpdateDataSettings(r.Context(), k, v); err != nil {
			writeError(w, http.StatusInternalServerError, "UPDATE_FAILED", err.Error())
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"message": "Data settings updated successfully"})
}
