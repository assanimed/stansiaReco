package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"stansiareco/backend/internal/servers"
)

type ServersHandler struct {
	providers servers.ProviderService
	mta       servers.MTAService
	ips       servers.IPService
	vmtas     servers.VMTAService
	proxies   servers.ProxyService
	actions   servers.ActionService
}

func NewServersHandler(
	providers servers.ProviderService,
	mta servers.MTAService,
	ips servers.IPService,
	vmtas servers.VMTAService,
	proxies servers.ProxyService,
	actions servers.ActionService,
) *ServersHandler {
	return &ServersHandler{
		providers: providers,
		mta:       mta,
		ips:       ips,
		vmtas:     vmtas,
		proxies:   proxies,
		actions:   actions,
	}
}

// -----------------------------------------------------------------------------
// Server Providers Endpoints
// -----------------------------------------------------------------------------

// ListProviders handles GET /api/v1/servers/providers
func (h *ServersHandler) ListProviders(w http.ResponseWriter, r *http.Request) {
	list, err := h.providers.ListProviders(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"providers": list})
}

// CreateProvider handles POST /api/v1/servers/providers
func (h *ServersHandler) CreateProvider(w http.ResponseWriter, r *http.Request) {
	var req servers.CreateProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request body")
		return
	}

	p, err := h.providers.CreateProvider(r.Context(), req)
	if err != nil {
		if errors.Is(err, servers.ErrProviderExists) {
			writeError(w, http.StatusConflict, "PROVIDER_EXISTS", err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"provider": p})
}

// GetProvider handles GET /api/v1/servers/providers/{providerID}
func (h *ServersHandler) GetProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider UUID")
		return
	}

	p, err := h.providers.GetProvider(r.Context(), id)
	if err != nil {
		if errors.Is(err, servers.ErrProviderNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Server provider not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"provider": p})
}

// UpdateProvider handles PUT /api/v1/servers/providers/{providerID}
func (h *ServersHandler) UpdateProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider UUID")
		return
	}

	var req servers.UpdateProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON payload")
		return
	}

	p, err := h.providers.UpdateProvider(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, servers.ErrProviderNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Server provider not found")
			return
		}
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"provider": p})
}

// DeleteProvider handles DELETE /api/v1/servers/providers/{providerID}
func (h *ServersHandler) DeleteProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid provider UUID")
		return
	}

	if err := h.providers.DeleteProvider(r.Context(), id); err != nil {
		if errors.Is(err, servers.ErrProviderNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Server provider not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "deleted"})
}

// -----------------------------------------------------------------------------
// MTA Servers Endpoints
// -----------------------------------------------------------------------------

// ListServers handles GET /api/v1/servers/mta
func (h *ServersHandler) ListServers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := servers.MTAServerFilter{
		Port25Status: q.Get("port_25_status"),
		Search:       q.Get("search"),
	}

	if provIDStr := q.Get("provider_id"); provIDStr != "" {
		if provID, err := uuid.Parse(provIDStr); err == nil {
			filter.ProviderID = &provID
		}
	}

	if mtaInst := q.Get("mta_installed"); mtaInst != "" {
		val := mtaInst == "true" || mtaInst == "1"
		filter.MTAInstalled = &val
	}

	list, err := h.mta.ListServers(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"servers": list})
}

// CreateServer handles POST /api/v1/servers/mta
func (h *ServersHandler) CreateServer(w http.ResponseWriter, r *http.Request) {
	var req servers.CreateMTAServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request body")
		return
	}

	srv, err := h.mta.CreateServer(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"server": srv})
}

// BulkCreateServers handles POST /api/v1/servers/mta/bulk
func (h *ServersHandler) BulkCreateServers(w http.ResponseWriter, r *http.Request) {
	var req servers.BulkAddMTAServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request body")
		return
	}

	result, err := h.mta.BulkCreateServers(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(result)
}

// GetServer handles GET /api/v1/servers/mta/{serverID}
func (h *ServersHandler) GetServer(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	srv, err := h.mta.GetServer(r.Context(), id)
	if err != nil {
		if errors.Is(err, servers.ErrServerNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"server": srv})
}

// UpdateServer handles PUT /api/v1/servers/mta/{serverID}
func (h *ServersHandler) UpdateServer(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	var req servers.UpdateMTAServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request body")
		return
	}

	srv, err := h.mta.UpdateServer(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, servers.ErrServerNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
			return
		}
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"server": srv})
}

// DeleteServer handles DELETE /api/v1/servers/mta/{serverID}
func (h *ServersHandler) DeleteServer(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	if err := h.mta.DeleteServer(r.Context(), id); err != nil {
		if errors.Is(err, servers.ErrServerNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "deleted"})
}

// TestSSHConnection handles POST /api/v1/servers/mta/{serverID}/test-connection
func (h *ServersHandler) TestSSHConnection(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	result, err := h.mta.TestSSHConnection(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(result)
}

// -----------------------------------------------------------------------------
// Server IPs & nmcli Endpoints
// -----------------------------------------------------------------------------

// ListAllIPs handles GET /api/v1/servers/mta/ips
func (h *ServersHandler) ListAllIPs(w http.ResponseWriter, r *http.Request) {
	var serverID *uuid.UUID
	if sID := r.URL.Query().Get("server_id"); sID != "" {
		if parsed, err := uuid.Parse(sID); err == nil {
			serverID = &parsed
		}
	}

	list, err := h.ips.ListIPs(r.Context(), serverID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"ips": list})
}

// ListIPs handles GET /api/v1/servers/mta/{serverID}/ips
func (h *ServersHandler) ListIPs(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	list, err := h.ips.ListIPs(r.Context(), &id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"ips": list})
}

// AddIP handles POST /api/v1/servers/mta/{serverID}/ips
func (h *ServersHandler) AddIP(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	var req servers.AddServerIPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request body")
		return
	}
	req.ServerID = id

	item, err := h.ips.AddIP(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"ip": item})
}

// BulkAddIPs handles POST /api/v1/servers/mta/{serverID}/ips/bulk
func (h *ServersHandler) BulkAddIPs(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	var req servers.BulkAddIPsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request body")
		return
	}
	req.ServerID = id

	created, err := h.ips.BulkAddIPs(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"ips": created, "count": len(created)})
}

// DeleteIP handles DELETE /api/v1/servers/mta/{serverID}/ips/{ipID}
func (h *ServersHandler) DeleteIP(w http.ResponseWriter, r *http.Request) {
	ipIDStr := chi.URLParam(r, "ipID")
	ipID, err := uuid.Parse(ipIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid IP UUID")
		return
	}

	if err := h.ips.DeleteIP(r.Context(), ipID); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "deleted"})
}

// MarkIPConfigured handles POST /api/v1/servers/mta/{serverID}/ips/{ipID}/mark-configured
func (h *ServersHandler) MarkIPConfigured(w http.ResponseWriter, r *http.Request) {
	ipIDStr := chi.URLParam(r, "ipID")
	ipID, err := uuid.Parse(ipIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid IP UUID")
		return
	}

	var body struct {
		Configured bool `json:"configured"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	if err := h.ips.MarkConfigured(r.Context(), ipID, body.Configured); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "updated", "is_configured": body.Configured})
}

// GetNmcliScript handles GET /api/v1/servers/mta/{serverID}/nmcli-script
func (h *ServersHandler) GetNmcliScript(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	script, err := h.ips.GenerateNmcliScript(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"script": script})
}

type ApplyIPsRequestPayload struct {
	IPIDs []uuid.UUID `json:"ip_ids,omitempty"`
}

// ApplyIPsToServer handles POST /api/v1/servers/mta/{serverID}/ips/apply
func (h *ServersHandler) ApplyIPsToServer(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	var payload ApplyIPsRequestPayload
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&payload)
	}

	res, err := h.ips.ApplyIPsToServer(r.Context(), id, payload.IPIDs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "APPLY_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if !res.Success {
		w.WriteHeader(http.StatusUnprocessableEntity)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": res.Success,
		"result":  res,
		"output":  res.Output,
		"message": res.Message,
		"count":   res.Count,
		"error":   res.Error,
	})
}

// -----------------------------------------------------------------------------
// VMTAs Endpoints
// -----------------------------------------------------------------------------

// ListVMTAs handles GET /api/v1/servers/vmtas
func (h *ServersHandler) ListVMTAs(w http.ResponseWriter, r *http.Request) {
	var srvID *uuid.UUID
	if srvIDStr := r.URL.Query().Get("server_id"); srvIDStr != "" {
		if id, err := uuid.Parse(srvIDStr); err == nil {
			srvID = &id
		}
	}

	list, err := h.vmtas.ListVMTAs(r.Context(), srvID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"vmtas": list})
}

// CreateVMTA handles POST /api/v1/servers/mta/{serverID}/vmtas
func (h *ServersHandler) CreateVMTA(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	var req servers.CreateVMTARequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request body")
		return
	}
	req.ServerID = id

	item, err := h.vmtas.CreateVMTA(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"vmta": item})
}

// BulkCreateVMTAs handles POST /api/v1/servers/mta/{serverID}/vmtas/bulk
func (h *ServersHandler) BulkCreateVMTAs(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	var req servers.BulkCreateVMTAsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request body")
		return
	}
	req.ServerID = id

	list, err := h.vmtas.BulkCreateVMTAs(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"vmtas": list, "count": len(list)})
}

// DeleteVMTA handles DELETE /api/v1/servers/vmtas/{vmtaID}
func (h *ServersHandler) DeleteVMTA(w http.ResponseWriter, r *http.Request) {
	vmtaIDStr := chi.URLParam(r, "vmtaID")
	vmtaID, err := uuid.Parse(vmtaIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid VMTA UUID")
		return
	}

	if err := h.vmtas.DeleteVMTA(r.Context(), vmtaID); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "deleted"})
}

// GetVMTAConfig handles GET /api/v1/servers/mta/{serverID}/vmta-config
func (h *ServersHandler) GetVMTAConfig(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	mtaType := r.URL.Query().Get("type")
	if mtaType == "" {
		mtaType = "postfix"
	}

	configStr, err := h.vmtas.GenerateVMTAConfig(r.Context(), id, mtaType)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"config": configStr, "mta_type": mtaType})
}

// -----------------------------------------------------------------------------
// Proxy Servers Endpoints
// -----------------------------------------------------------------------------

// ListProxies handles GET /api/v1/servers/proxies
func (h *ServersHandler) ListProxies(w http.ResponseWriter, r *http.Request) {
	list, err := h.proxies.ListProxies(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"proxies": list})
}

// GetProxy handles GET /api/v1/servers/mta/{serverID}/proxy
func (h *ServersHandler) GetProxy(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	px, err := h.proxies.GetProxy(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"proxy": px})
}

// UpdateProxy handles PUT /api/v1/servers/mta/{serverID}/proxy
func (h *ServersHandler) UpdateProxy(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	var req servers.UpdateProxyConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request body")
		return
	}

	px, err := h.proxies.UpdateProxy(r.Context(), id, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"proxy": px})
}

// GetProxyInstallScript handles GET /api/v1/servers/mta/{serverID}/proxy/install-script
func (h *ServersHandler) GetProxyInstallScript(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	script, err := h.proxies.GenerateInstallScript(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"script": script})
}

// -----------------------------------------------------------------------------
// Actions & MTA Installation Endpoints
// -----------------------------------------------------------------------------

// GetActions handles GET /api/v1/servers/actions
func (h *ServersHandler) GetActions(w http.ResponseWriter, r *http.Request) {
	actions := h.actions.GetStandardActions()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"actions": actions})
}

// InstallMTA handles POST /api/v1/servers/mta/{serverID}/install
func (h *ServersHandler) InstallMTA(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "serverID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid server UUID")
		return
	}

	var opts servers.MTAInstallOptions
	if err := json.NewDecoder(r.Body).Decode(&opts); err != nil {
		// allow empty body with defaults
		opts = servers.MTAInstallOptions{Software: "postfix", EnableTLS: true}
	}
	if opts.Software == "" {
		opts.Software = "postfix"
	}

	script, err := h.actions.GenerateMTAInstallScript(r.Context(), id, opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"script":   script,
		"software": opts.Software,
		"message":  "Installation script prepared successfully.",
	})
}
