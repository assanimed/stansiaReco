package domains

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrProviderNotFound  = errors.New("domain provider integration not found")
	ErrDomainNotFound    = errors.New("domain not found")
	ErrDomainExists      = errors.New("domain already exists in inventory")
	ErrDNSRecordNotFound = errors.New("DNS record not found")
	ErrInvalidIPPair     = errors.New("invalid IP replacement pair provided")
	ErrNoMatchingRecords = errors.New("no DNS records matched the replacement criteria")
)

type DomainProvider struct {
	ID           uuid.UUID  `json:"id"`
	ProviderType string     `json:"provider_type"` // "namecheap", "name.com", "godaddy"
	Name         string     `json:"name"`
	ApiUser      string     `json:"api_user"`
	AccountUser  string     `json:"account_user"`
	HasApiKey    bool       `json:"has_api_key"`
	HasApiSecret bool       `json:"has_api_secret"`
	ApiKeyHint   string     `json:"api_key_hint,omitempty"`
	ClientIP     string     `json:"client_ip"`
	Environment  string     `json:"environment"` // "production", "sandbox", "ote"
	IsActive     bool       `json:"is_active"`
	DomainCount  int        `json:"domain_count"`
	LastSyncedAt *time.Time `json:"last_synced_at,omitempty"`
	LastError    *string    `json:"last_error,omitempty"`
	Notes        string     `json:"notes,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type CreateProviderRequest struct {
	ProviderType string `json:"provider_type"` // "namecheap", "name.com", "godaddy"
	Name         string `json:"name"`
	ApiUser      string `json:"api_user"`
	AccountUser  string `json:"account_user"`
	ApiKey       string `json:"api_key"`
	ApiSecret    string `json:"api_secret,omitempty"`
	ClientIP     string `json:"client_ip,omitempty"`
	Environment  string `json:"environment"` // "production", "sandbox", "ote"
	Notes        string `json:"notes,omitempty"`
}

type UpdateProviderRequest struct {
	Name        *string `json:"name,omitempty"`
	ApiUser     *string `json:"api_user,omitempty"`
	AccountUser *string `json:"account_user,omitempty"`
	ApiKey      *string `json:"api_key,omitempty"`
	ApiSecret   *string `json:"api_secret,omitempty"`
	ClientIP    *string `json:"client_ip,omitempty"`
	Environment *string `json:"environment,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
	Notes       *string `json:"notes,omitempty"`
}

type Domain struct {
	ID                 uuid.UUID  `json:"id"`
	IntegrationID      *uuid.UUID `json:"integration_id,omitempty"`
	ProviderName       string     `json:"provider_name,omitempty"`
	ProviderType       string     `json:"provider_type,omitempty"`
	DomainName         string     `json:"domain_name"`
	ProviderDomainID   string     `json:"provider_domain_id,omitempty"`
	IsLocked           bool       `json:"is_locked"`
	AutoRenew          bool       `json:"auto_renew"`
	UsesNamecheapDNS   bool       `json:"uses_namecheap_dns"`
	Nameservers        []string   `json:"nameservers"`
	Status             string     `json:"status"` // "active", "expired", "pending", "sync_error"
	ExpiresAt          *time.Time `json:"expires_at,omitempty"`
	ProviderCreatedAt  *time.Time `json:"provider_created_at,omitempty"`
	RecordCount        int        `json:"record_count"`
	Notes              string     `json:"notes,omitempty"`
	LastSyncedAt       *time.Time `json:"last_synced_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type CreateDomainRequest struct {
	DomainName    string     `json:"domain_name"`
	IntegrationID *uuid.UUID `json:"integration_id,omitempty"`
	Status        string     `json:"status"`
	AutoRenew     bool       `json:"auto_renew"`
	IsLocked      bool       `json:"is_locked"`
	Nameservers   []string   `json:"nameservers,omitempty"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	Notes         string     `json:"notes,omitempty"`
}

type CreateBulkDomainsRequest struct {
	Domains       []string   `json:"domains"`
	IntegrationID *uuid.UUID `json:"integration_id,omitempty"`
	Status        string     `json:"status,omitempty"`
	AutoRenew     *bool      `json:"auto_renew,omitempty"`
	IsLocked      *bool      `json:"is_locked,omitempty"`
	Nameservers   []string   `json:"nameservers,omitempty"`
	Notes         string     `json:"notes,omitempty"`
}

type BulkDomainItemResult struct {
	DomainName string     `json:"domain_name"`
	ID         *uuid.UUID `json:"id,omitempty"`
	Status     string     `json:"status"` // "created", "skipped", "error"
	Error      string     `json:"error,omitempty"`
}

type CreateBulkDomainsResult struct {
	TotalCreated int                    `json:"total_created"`
	TotalSkipped int                    `json:"total_skipped"`
	TotalErrors  int                    `json:"total_errors"`
	Results      []BulkDomainItemResult `json:"results"`
}

type UpdateDomainRequest struct {
	IntegrationID *uuid.UUID `json:"integration_id,omitempty"`
	Status        *string    `json:"status,omitempty"`
	AutoRenew     *bool      `json:"auto_renew,omitempty"`
	IsLocked      *bool      `json:"is_locked,omitempty"`
	Nameservers   []string   `json:"nameservers,omitempty"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	Notes         *string    `json:"notes,omitempty"`
}

type DomainFilter struct {
	Search        string
	IntegrationID *uuid.UUID
	Status        string
}

type DNSRecord struct {
	ID          uuid.UUID `json:"id"`
	DomainID    uuid.UUID `json:"domain_id"`
	DomainName  string    `json:"domain_name,omitempty"`
	RecordType  string    `json:"record_type"` // "A", "AAAA", "CNAME", "MX", "TXT", "NS", "SPF"
	HostName    string    `json:"host_name"`   // "@", "mail", "smtp", etc.
	RecordValue string    `json:"record_value"`
	TTL         int       `json:"ttl"`
	MXPriority  *int      `json:"mx_priority,omitempty"`
	IsManaged   bool      `json:"is_managed"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateDNSRecordRequest struct {
	RecordType  string `json:"record_type"`
	HostName    string `json:"host_name"`
	RecordValue string `json:"record_value"`
	TTL         int    `json:"ttl"`
	MXPriority  *int   `json:"mx_priority,omitempty"`
}

type UpdateDNSRecordRequest struct {
	RecordType  *string `json:"record_type,omitempty"`
	HostName    *string `json:"host_name,omitempty"`
	RecordValue *string `json:"record_value,omitempty"`
	TTL         *int    `json:"ttl,omitempty"`
	MXPriority  *int    `json:"mx_priority,omitempty"`
}

type IPReplacementPair struct {
	OldIP string `json:"old_ip"`
	NewIP string `json:"new_ip"`
}

type IPReplacementRequest struct {
	DomainID *uuid.UUID          `json:"domain_id,omitempty"` // nil = across all domains
	Pairs    []IPReplacementPair `json:"pairs"`
}

type IPReplacementChange struct {
	RecordID   uuid.UUID `json:"record_id"`
	DomainID   uuid.UUID `json:"domain_id"`
	DomainName string    `json:"domain_name"`
	HostName   string    `json:"host_name"`
	RecordType string    `json:"record_type"`
	OldValue   string    `json:"old_value"`
	NewValue   string    `json:"new_value"`
}

type IPReplacementResult struct {
	TotalMatches int                   `json:"total_matches"`
	TotalUpdated int                   `json:"total_updated"`
	Changes      []IPReplacementChange `json:"changes"`
}

type TestConnectionResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Latency string `json:"latency"`
}

type SyncDomainResult struct {
	DomainID      uuid.UUID `json:"domain_id"`
	DomainName    string    `json:"domain_name"`
	Source        string    `json:"source"` // "namecheap_api", "dns_lookup"
	RecordsSynced int       `json:"records_synced"`
	Message       string    `json:"message"`
	Warnings      []string  `json:"warnings,omitempty"`
}

type DeployCustomRecordRequest struct {
	DomainIDs   []uuid.UUID `json:"domain_ids,omitempty"` // empty or nil = all domains
	RecordType  string      `json:"record_type"`          // "TXT", "CNAME", "MX", "A", etc.
	HostName    string      `json:"host_name"`            // e.g. "default._domainkey", "_dmarc", "@"
	RecordValue string      `json:"record_value"`         // e.g. "v=DKIM1; k=rsa; p=MIGf..."
	TTL         int         `json:"ttl"`                  // default 1800
	MXPriority  *int        `json:"mx_priority,omitempty"`
	Overwrite   bool        `json:"overwrite"`            // if record with same (domain_id, host_name, record_type) exists: update vs skip
}

type DeployCustomRecordResult struct {
	TotalTargeted int      `json:"total_targeted"`
	CreatedCount  int      `json:"created_count"`
	UpdatedCount  int      `json:"updated_count"`
	SkippedCount  int      `json:"skipped_count"`
	AffectedNames []string `json:"affected_names"`
	Errors        []string `json:"errors,omitempty"`
}

type DeploySPFRequest struct {
	DomainIDs []uuid.UUID `json:"domain_ids,omitempty"` // empty or nil = all domains
	SPFRecord string      `json:"spf_record"`          // e.g. "v=spf1 a mx ip4:185.253.54.100 include:abc.com ~all"
	Mode      string      `json:"mode"`                // "replace" or "merge"
	TTL       int         `json:"ttl"`                 // default 1800
}

type DeploySPFResult struct {
	TotalTargeted int      `json:"total_targeted"`
	UpdatedCount  int      `json:"updated_count"`
	CreatedCount  int      `json:"created_count"`
	AffectedNames []string `json:"affected_names"`
	Errors        []string `json:"errors,omitempty"`
}

type DomainSPFStatus struct {
	DomainID    uuid.UUID `json:"domain_id"`
	DomainName  string    `json:"domain_name"`
	HasSPF      bool      `json:"has_spf"`
	SPFRecord   string    `json:"spf_record,omitempty"`
	LookupCount int       `json:"lookup_count"`
	IsValid     bool      `json:"is_valid"`
}

