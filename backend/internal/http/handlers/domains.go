package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/domains"
	"stansiareco/backend/internal/http/middleware"
)

type DomainsHandler struct {
	service domains.DomainService
	db      *pgxpool.Pool
}

func NewDomainsHandler(service domains.DomainService, db *pgxpool.Pool) *DomainsHandler {
	return &DomainsHandler{
		service: service,
		db:      db,
	}
}

// -----------------------------------------------------------------------------
// Providers Handlers
// -----------------------------------------------------------------------------

func (h *DomainsHandler) ListProviders(w http.ResponseWriter, r *http.Request) {
	providersList, err := h.service.ListProviders(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"providers": providersList,
	})
}

func (h *DomainsHandler) GetProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider UUID")
		return
	}

	p, err := h.service.GetProvider(r.Context(), id)
	if err != nil {
		if errors.Is(err, domains.ErrProviderNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Domain provider not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"provider": p,
	})
}

func (h *DomainsHandler) CreateProvider(w http.ResponseWriter, r *http.Request) {
	var req domains.CreateProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	p, err := h.service.CreateProvider(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DOMAIN_PROVIDER_CREATE", "provider_integrations", p.ID.String(), map[string]any{
			"name":          p.Name,
			"provider_type": p.ProviderType,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"provider": p,
		"message":  "Domain provider created successfully",
	})
}

func (h *DomainsHandler) UpdateProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider UUID")
		return
	}

	var req domains.UpdateProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	p, err := h.service.UpdateProvider(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, domains.ErrProviderNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Domain provider not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DOMAIN_PROVIDER_UPDATE", "provider_integrations", id.String(), map[string]any{
			"name": p.Name,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"provider": p,
		"message":  "Domain provider updated successfully",
	})
}

func (h *DomainsHandler) DeleteProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider UUID")
		return
	}

	if err := h.service.DeleteProvider(r.Context(), id); err != nil {
		if errors.Is(err, domains.ErrProviderNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Domain provider not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DOMAIN_PROVIDER_DELETE", "provider_integrations", id.String(), nil, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "Domain provider removed successfully",
	})
}

func (h *DomainsHandler) TestProviderConnection(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider UUID")
		return
	}

	result, err := h.service.TestProviderConnection(r.Context(), id)
	if err != nil {
		if errors.Is(err, domains.ErrProviderNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Domain provider not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func (h *DomainsHandler) SyncProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider UUID")
		return
	}

	count, err := h.service.SyncProviderDomains(r.Context(), id)
	if err != nil {
		if errors.Is(err, domains.ErrProviderNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Domain provider not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"synced_count": count,
		"message":      "Domain provider synchronized successfully",
	})
}

// -----------------------------------------------------------------------------
// Domains Handlers
// -----------------------------------------------------------------------------

func (h *DomainsHandler) ListDomains(w http.ResponseWriter, r *http.Request) {
	filter := domains.DomainFilter{
		Search: r.URL.Query().Get("search"),
		Status: r.URL.Query().Get("status"),
	}

	if providerIDStr := r.URL.Query().Get("provider_id"); providerIDStr != "" {
		if pid, err := uuid.Parse(providerIDStr); err == nil {
			filter.IntegrationID = &pid
		}
	}

	domainsList, err := h.service.ListDomains(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"domains": domainsList,
	})
}

func (h *DomainsHandler) GetDomain(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "domainID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid domain UUID")
		return
	}

	d, err := h.service.GetDomain(r.Context(), id)
	if err != nil {
		if errors.Is(err, domains.ErrDomainNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"domain": d,
	})
}

func (h *DomainsHandler) CreateDomain(w http.ResponseWriter, r *http.Request) {
	var req domains.CreateDomainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	d, err := h.service.CreateDomain(r.Context(), req)
	if err != nil {
		if errors.Is(err, domains.ErrDomainExists) {
			writeError(w, http.StatusConflict, "CONFLICT", "Domain already exists in inventory")
			return
		}
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DOMAIN_CREATE", "domains", d.ID.String(), map[string]any{
			"domain_name": d.DomainName,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"domain":  d,
		"message": "Domain added successfully",
	})
}

func (h *DomainsHandler) CreateBulkDomains(w http.ResponseWriter, r *http.Request) {
	var req domains.CreateBulkDomainsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	if len(req.Domains) == 0 {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", "At least one domain name must be provided")
		return
	}

	res, err := h.service.CreateBulkDomains(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BULK_CREATE_FAILED", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DOMAIN_BULK_CREATE", "domains", user.ID.String(), map[string]any{
			"total_created": res.TotalCreated,
			"total_skipped": res.TotalSkipped,
			"total_errors":  res.TotalErrors,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"total_created": res.TotalCreated,
		"total_skipped": res.TotalSkipped,
		"total_errors":  res.TotalErrors,
		"results":       res.Results,
		"message":       fmt.Sprintf("Successfully processed %d domain(s): %d created, %d skipped, %d failed", len(req.Domains), res.TotalCreated, res.TotalSkipped, res.TotalErrors),
	})
}

func (h *DomainsHandler) UpdateDomain(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "domainID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid domain UUID")
		return
	}

	var req domains.UpdateDomainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	d, err := h.service.UpdateDomain(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, domains.ErrDomainNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DOMAIN_UPDATE", "domains", id.String(), map[string]any{
			"domain_name": d.DomainName,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"domain":  d,
		"message": "Domain updated successfully",
	})
}

func (h *DomainsHandler) DeleteDomain(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "domainID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid domain UUID")
		return
	}

	if err := h.service.DeleteDomain(r.Context(), id); err != nil {
		if errors.Is(err, domains.ErrDomainNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DOMAIN_DELETE", "domains", id.String(), nil, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "Domain removed successfully",
	})
}

func (h *DomainsHandler) SyncAllDomains(w http.ResponseWriter, r *http.Request) {
	providersList, err := h.service.ListProviders(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	total := 0
	for _, p := range providersList {
		c, _ := h.service.SyncProviderDomains(r.Context(), p.ID)
		total += c
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":      "Domain synchronization completed",
		"total_synced": total,
	})
}

func (h *DomainsHandler) SyncDomain(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "domainID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid domain UUID")
		return
	}

	result, err := h.service.SyncDomainRecords(r.Context(), id)
	if err != nil {
		if errors.Is(err, domains.ErrDomainNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// -----------------------------------------------------------------------------
// DNS Records Handlers
// -----------------------------------------------------------------------------

func (h *DomainsHandler) ListDNSRecords(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainID")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid domain UUID")
		return
	}

	records, err := h.service.ListDNSRecords(r.Context(), domainID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"records": records,
	})
}

func (h *DomainsHandler) CreateDNSRecord(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainID")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid domain UUID")
		return
	}

	var req domains.CreateDNSRecordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	record, err := h.service.CreateDNSRecord(r.Context(), domainID, req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DNS_RECORD_CREATE", "dns_records", record.ID.String(), map[string]any{
			"domain_id":   domainID.String(),
			"record_type": record.RecordType,
			"host_name":   record.HostName,
			"value":       record.RecordValue,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"record":  record,
		"message": "DNS record created successfully",
	})
}

func (h *DomainsHandler) UpdateDNSRecord(w http.ResponseWriter, r *http.Request) {
	recordIDStr := chi.URLParam(r, "recordID")
	recordID, err := uuid.Parse(recordIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid DNS record UUID")
		return
	}

	var req domains.UpdateDNSRecordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	record, err := h.service.UpdateDNSRecord(r.Context(), recordID, req)
	if err != nil {
		if errors.Is(err, domains.ErrDNSRecordNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "DNS record not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DNS_RECORD_UPDATE", "dns_records", recordID.String(), map[string]any{
			"record_type": record.RecordType,
			"host_name":   record.HostName,
			"value":       record.RecordValue,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"record":  record,
		"message": "DNS record updated successfully",
	})
}

func (h *DomainsHandler) DeleteDNSRecord(w http.ResponseWriter, r *http.Request) {
	recordIDStr := chi.URLParam(r, "recordID")
	recordID, err := uuid.Parse(recordIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid DNS record UUID")
		return
	}

	if err := h.service.DeleteDNSRecord(r.Context(), recordID); err != nil {
		if errors.Is(err, domains.ErrDNSRecordNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "DNS record not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DNS_RECORD_DELETE", "dns_records", recordID.String(), nil, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "DNS record removed successfully",
	})
}

type BulkDeleteDNSRecordsRequest struct {
	RecordIDs []uuid.UUID `json:"record_ids"`
}

type FlushDomainsDNSRecordsRequest struct {
	DomainIDs []uuid.UUID `json:"domain_ids"`
}

func (h *DomainsHandler) BulkDeleteDNSRecords(w http.ResponseWriter, r *http.Request) {
	var req BulkDeleteDNSRecordsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}
	if len(req.RecordIDs) == 0 {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", "At least one record_id must be provided")
		return
	}

	deletedCount, err := h.service.BulkDeleteDNSRecords(r.Context(), req.RecordIDs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DNS_RECORD_BULK_DELETE", "dns_records", "bulk", map[string]any{
			"deleted_count": deletedCount,
			"record_ids":    req.RecordIDs,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":       fmt.Sprintf("Deleted %d DNS record(s) successfully", deletedCount),
		"deleted_count": deletedCount,
	})
}

func (h *DomainsHandler) FlushDomainsDNSRecords(w http.ResponseWriter, r *http.Request) {
	var req FlushDomainsDNSRecordsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}
	if len(req.DomainIDs) == 0 {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", "At least one domain_id must be provided")
		return
	}

	deletedCount, err := h.service.FlushDomainsDNSRecords(r.Context(), req.DomainIDs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DNS_DOMAINS_FLUSH", "dns_records", "flush", map[string]any{
			"deleted_records_count": deletedCount,
			"domain_ids":            req.DomainIDs,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":               fmt.Sprintf("Flushed %d DNS record(s) across %d domain(s)", deletedCount, len(req.DomainIDs)),
		"deleted_records_count": deletedCount,
		"domains_count":         len(req.DomainIDs),
	})
}

func (h *DomainsHandler) FlushSingleDomainDNSRecords(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainID")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid domain UUID")
		return
	}

	deletedCount, err := h.service.FlushDomainsDNSRecords(r.Context(), []uuid.UUID{domainID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DNS_DOMAIN_FLUSH", "dns_records", domainID.String(), map[string]any{
			"deleted_records_count": deletedCount,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":               fmt.Sprintf("Flushed %d DNS record(s) for domain", deletedCount),
		"deleted_records_count": deletedCount,
		"domain_id":             domainID.String(),
	})
}

// -----------------------------------------------------------------------------
// Bulk DNS IP Replacement Handlers
// -----------------------------------------------------------------------------

func (h *DomainsHandler) PreviewIPReplacement(w http.ResponseWriter, r *http.Request) {
	var req domains.IPReplacementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	result, err := h.service.PreviewIPReplacement(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func (h *DomainsHandler) ExecuteIPReplacement(w http.ResponseWriter, r *http.Request) {
	var req domains.IPReplacementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON body")
		return
	}

	user := middleware.UserFromContext(r.Context())
	userID := uuid.Nil
	if user != nil {
		userID = user.ID
	}

	result, err := h.service.ExecuteIPReplacement(r.Context(), req, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DNS_BULK_IP_REPLACEMENT", "dns_records", "bulk", map[string]any{
			"total_updated": result.TotalUpdated,
			"pairs_count":   len(req.Pairs),
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func (h *DomainsHandler) GetOutboundIP(w http.ResponseWriter, r *http.Request) {
	ip := domains.DetectOutboundIP()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"outbound_ip": ip,
	})
}

// DeployCustomRecord handles bulk custom DNS record deployment (e.g. DKIM, DMARC) across multiple domains
func (h *DomainsHandler) DeployCustomRecord(w http.ResponseWriter, r *http.Request) {
	var req domains.DeployCustomRecordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON payload")
		return
	}

	if strings.TrimSpace(req.RecordValue) == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", "Record value cannot be empty")
		return
	}

	result, err := h.service.DeployCustomRecord(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DNS_CUSTOM_RECORD_DEPLOY", "dns_records", "bulk", map[string]any{
			"record_type":    req.RecordType,
			"host_name":      req.HostName,
			"total_targeted": result.TotalTargeted,
			"created_count":  result.CreatedCount,
			"updated_count":  result.UpdatedCount,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// DeploySPF handles deploying or merging SPF records across multiple domains
func (h *DomainsHandler) DeploySPF(w http.ResponseWriter, r *http.Request) {
	var req domains.DeploySPFRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Malformed JSON payload")
		return
	}

	if strings.TrimSpace(req.SPFRecord) == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION_FAILED", "SPF record content cannot be empty")
		return
	}

	result, err := h.service.DeploySPF(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user != nil {
		_ = recordAudit(r.Context(), h.db, user.ID, "DNS_SPF_DEPLOY", "dns_records", "bulk", map[string]any{
			"total_targeted": result.TotalTargeted,
			"created_count":  result.CreatedCount,
			"updated_count":  result.UpdatedCount,
			"mode":           req.Mode,
		}, r.RemoteAddr, r.UserAgent())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// ListSPFStatus handles GET /api/v1/dns/spf/status
func (h *DomainsHandler) ListSPFStatus(w http.ResponseWriter, r *http.Request) {
	list, err := h.service.ListDomainsSPFStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"domains": list,
	})
}

