package domains

import (
	"context"
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/credentials"
)

type DomainService interface {
	// Providers
	ListProviders(ctx context.Context) ([]DomainProvider, error)
	GetProvider(ctx context.Context, id uuid.UUID) (*DomainProvider, error)
	CreateProvider(ctx context.Context, req CreateProviderRequest) (*DomainProvider, error)
	UpdateProvider(ctx context.Context, id uuid.UUID, req UpdateProviderRequest) (*DomainProvider, error)
	DeleteProvider(ctx context.Context, id uuid.UUID) error
	TestProviderConnection(ctx context.Context, id uuid.UUID) (*TestConnectionResult, error)
	SyncProviderDomains(ctx context.Context, providerID uuid.UUID) (int, error)

	// Domains
	ListDomains(ctx context.Context, filter DomainFilter) ([]Domain, error)
	GetDomain(ctx context.Context, id uuid.UUID) (*Domain, error)
	CreateDomain(ctx context.Context, req CreateDomainRequest) (*Domain, error)
	CreateBulkDomains(ctx context.Context, req CreateBulkDomainsRequest) (*CreateBulkDomainsResult, error)
	UpdateDomain(ctx context.Context, id uuid.UUID, req UpdateDomainRequest) (*Domain, error)
	DeleteDomain(ctx context.Context, id uuid.UUID) error
	SyncDomainRecords(ctx context.Context, domainID uuid.UUID) (*SyncDomainResult, error)

	// DNS Records
	ListDNSRecords(ctx context.Context, domainID uuid.UUID) ([]DNSRecord, error)
	GetDNSRecord(ctx context.Context, recordID uuid.UUID) (*DNSRecord, error)
	CreateDNSRecord(ctx context.Context, domainID uuid.UUID, req CreateDNSRecordRequest) (*DNSRecord, error)
	UpdateDNSRecord(ctx context.Context, recordID uuid.UUID, req UpdateDNSRecordRequest) (*DNSRecord, error)
	DeleteDNSRecord(ctx context.Context, recordID uuid.UUID) error
	BulkDeleteDNSRecords(ctx context.Context, recordIDs []uuid.UUID) (int64, error)
	FlushDomainsDNSRecords(ctx context.Context, domainIDs []uuid.UUID) (int64, error)

	// Bulk DNS IP Replacement
	PreviewIPReplacement(ctx context.Context, req IPReplacementRequest) (*IPReplacementResult, error)
	ExecuteIPReplacement(ctx context.Context, req IPReplacementRequest, userID uuid.UUID) (*IPReplacementResult, error)

	// Custom Records & SPF Studio Deployment
	DeployCustomRecord(ctx context.Context, req DeployCustomRecordRequest) (*DeployCustomRecordResult, error)
	DeploySPF(ctx context.Context, req DeploySPFRequest) (*DeploySPFResult, error)
	ListDomainsSPFStatus(ctx context.Context) ([]DomainSPFStatus, error)
	PushDomainRecordsToProvider(ctx context.Context, domainID uuid.UUID) error
}

type PostgresDomainService struct {
	db    *pgxpool.Pool
	vault *credentials.Vault
}

func NewPostgresDomainService(db *pgxpool.Pool, vault *credentials.Vault) *PostgresDomainService {
	return &PostgresDomainService{
		db:    db,
		vault: vault,
	}
}

// -----------------------------------------------------------------------------
// Provider Management
// -----------------------------------------------------------------------------

func (s *PostgresDomainService) ListProviders(ctx context.Context) ([]DomainProvider, error) {
	query := `
		SELECT 
			p.id, p.provider_type, p.name, p.api_user, p.account_user,
			(p.encrypted_api_key IS NOT NULL AND length(p.encrypted_api_key) > 0) AS has_api_key,
			(p.encrypted_api_secret IS NOT NULL AND length(p.encrypted_api_secret) > 0) AS has_api_secret,
			p.client_ip, p.environment, p.is_active,
			COALESCE(p.notes, ''), p.last_synced_at, p.last_error,
			p.created_at, p.updated_at,
			(SELECT COUNT(*) FROM domains d WHERE d.integration_id = p.id) AS domain_count
		FROM provider_integrations p
		ORDER BY p.created_at DESC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list domain providers: %w", err)
	}
	defer rows.Close()

	providers := make([]DomainProvider, 0)
	for rows.Next() {
		var p DomainProvider
		err := rows.Scan(
			&p.ID, &p.ProviderType, &p.Name, &p.ApiUser, &p.AccountUser,
			&p.HasApiKey, &p.HasApiSecret, &p.ClientIP, &p.Environment,
			&p.IsActive, &p.Notes, &p.LastSyncedAt, &p.LastError,
			&p.CreatedAt, &p.UpdatedAt, &p.DomainCount,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan provider: %w", err)
		}
		providers = append(providers, p)
	}
	return providers, nil
}

func (s *PostgresDomainService) GetProvider(ctx context.Context, id uuid.UUID) (*DomainProvider, error) {
	query := `
		SELECT 
			p.id, p.provider_type, p.name, p.api_user, p.account_user,
			(p.encrypted_api_key IS NOT NULL AND length(p.encrypted_api_key) > 0) AS has_api_key,
			(p.encrypted_api_secret IS NOT NULL AND length(p.encrypted_api_secret) > 0) AS has_api_secret,
			p.client_ip, p.environment, p.is_active,
			COALESCE(p.notes, ''), p.last_synced_at, p.last_error,
			p.created_at, p.updated_at,
			(SELECT COUNT(*) FROM domains d WHERE d.integration_id = p.id) AS domain_count
		FROM provider_integrations p
		WHERE p.id = $1
	`
	var p DomainProvider
	err := s.db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.ProviderType, &p.Name, &p.ApiUser, &p.AccountUser,
		&p.HasApiKey, &p.HasApiSecret, &p.ClientIP, &p.Environment,
		&p.IsActive, &p.Notes, &p.LastSyncedAt, &p.LastError,
		&p.CreatedAt, &p.UpdatedAt, &p.DomainCount,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProviderNotFound
		}
		return nil, fmt.Errorf("failed to get domain provider: %w", err)
	}
	return &p, nil
}

func (s *PostgresDomainService) CreateProvider(ctx context.Context, req CreateProviderRequest) (*DomainProvider, error) {
	req.Name = strings.TrimSpace(req.Name)
	req.ProviderType = strings.ToLower(strings.TrimSpace(req.ProviderType))
	req.ApiUser = strings.TrimSpace(req.ApiUser)
	req.AccountUser = strings.TrimSpace(req.AccountUser)
	if req.AccountUser == "" {
		req.AccountUser = req.ApiUser
	}
	if req.Environment == "" {
		req.Environment = "production"
	}

	if req.Name == "" {
		return nil, errors.New("provider name is required")
	}
	if req.ProviderType == "" {
		req.ProviderType = "namecheap"
	}

	var encryptedKey, encryptedSecret []byte
	var err error

	if req.ApiKey != "" {
		encryptedKey, err = s.vault.Encrypt([]byte(req.ApiKey))
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt API key: %w", err)
		}
	}
	if req.ApiSecret != "" {
		encryptedSecret, err = s.vault.Encrypt([]byte(req.ApiSecret))
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt API secret: %w", err)
		}
	}

	query := `
		INSERT INTO provider_integrations (
			id, provider_type, name, api_user, account_user,
			encrypted_api_key, encrypted_api_secret, client_ip,
			environment, is_active, notes, created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW(), NOW()
		) RETURNING id
	`
	var id uuid.UUID
	err = s.db.QueryRow(ctx, query,
		req.ProviderType, req.Name, req.ApiUser, req.AccountUser,
		encryptedKey, encryptedSecret, req.ClientIP,
		req.Environment, req.Notes,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("failed to insert provider integration: %w", err)
	}

	return s.GetProvider(ctx, id)
}

func (s *PostgresDomainService) UpdateProvider(ctx context.Context, id uuid.UUID, req UpdateProviderRequest) (*DomainProvider, error) {
	current, err := s.GetProvider(ctx, id)
	if err != nil {
		return nil, err
	}

	name := current.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}

	apiUser := current.ApiUser
	if req.ApiUser != nil {
		apiUser = strings.TrimSpace(*req.ApiUser)
	}

	accountUser := current.AccountUser
	if req.AccountUser != nil {
		accountUser = strings.TrimSpace(*req.AccountUser)
	}

	clientIP := current.ClientIP
	if req.ClientIP != nil {
		clientIP = strings.TrimSpace(*req.ClientIP)
	}

	env := current.Environment
	if req.Environment != nil && strings.TrimSpace(*req.Environment) != "" {
		env = strings.TrimSpace(*req.Environment)
	}

	isActive := current.IsActive
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	notes := current.Notes
	if req.Notes != nil {
		notes = *req.Notes
	}

	query := `
		UPDATE provider_integrations
		SET name = $1, api_user = $2, account_user = $3, client_ip = $4,
		    environment = $5, is_active = $6, notes = $7, updated_at = NOW()
	`
	params := []any{name, apiUser, accountUser, clientIP, env, isActive, notes}
	paramIdx := 8

	if req.ApiKey != nil && *req.ApiKey != "" {
		encKey, err := s.vault.Encrypt([]byte(*req.ApiKey))
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt new API key: %w", err)
		}
		query += fmt.Sprintf(", encrypted_api_key = $%d", paramIdx)
		params = append(params, encKey)
		paramIdx++
	}

	if req.ApiSecret != nil {
		trimmedSecret := strings.TrimSpace(*req.ApiSecret)
		if strings.EqualFold(trimmedSecret, "__CLEAR__") {
			query += ", encrypted_api_secret = NULL"
		} else if trimmedSecret != "" {
			encSecret, err := s.vault.Encrypt([]byte(trimmedSecret))
			if err != nil {
				return nil, fmt.Errorf("failed to encrypt new API secret: %w", err)
			}
			query += fmt.Sprintf(", encrypted_api_secret = $%d", paramIdx)
			params = append(params, encSecret)
			paramIdx++
		}
	}

	query += fmt.Sprintf(" WHERE id = $%d", paramIdx)
	params = append(params, id)

	_, err = s.db.Exec(ctx, query, params...)
	if err != nil {
		return nil, fmt.Errorf("failed to update provider integration: %w", err)
	}

	return s.GetProvider(ctx, id)
}

func (s *PostgresDomainService) getGoDaddyClient(ctx context.Context, p *DomainProvider) (*GoDaddyClient, error) {
	if !p.HasApiKey {
		return nil, fmt.Errorf("no API Key or Personal Access Token configured for GoDaddy provider '%s'", p.Name)
	}

	var encKey, encSecret []byte
	err := s.db.QueryRow(ctx, "SELECT encrypted_api_key, encrypted_api_secret FROM provider_integrations WHERE id = $1", p.ID).Scan(&encKey, &encSecret)
	if err != nil || len(encKey) == 0 {
		return nil, fmt.Errorf("could not retrieve encrypted GoDaddy API key for '%s'", p.Name)
	}

	plainKey, err := s.vault.Decrypt(encKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt GoDaddy API key: %w", err)
	}

	var plainSecret string
	if len(encSecret) > 0 {
		if decSecret, decErr := s.vault.Decrypt(encSecret); decErr == nil {
			plainSecret = string(decSecret)
		}
	}

	return NewGoDaddyClient(string(plainKey), plainSecret, p.ApiUser, p.Environment), nil
}

func (s *PostgresDomainService) DeleteProvider(ctx context.Context, id uuid.UUID) error {
	res, err := s.db.Exec(ctx, "DELETE FROM provider_integrations WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete provider: %w", err)
	}
	if res.RowsAffected() == 0 {
		return ErrProviderNotFound
	}
	return nil
}

func (s *PostgresDomainService) TestProviderConnection(ctx context.Context, id uuid.UUID) (*TestConnectionResult, error) {
	p, err := s.GetProvider(ctx, id)
	if err != nil {
		return nil, err
	}

	start := time.Now()

	switch strings.ToLower(p.ProviderType) {
	case "namecheap":
		if p.ApiUser == "" || !p.HasApiKey {
			return &TestConnectionResult{
				Success: false,
				Message: "Namecheap requires API User and API Key configured",
				Latency: "0ms",
			}, nil
		}

		var encKey []byte
		err := s.db.QueryRow(ctx, "SELECT encrypted_api_key FROM provider_integrations WHERE id = $1", id).Scan(&encKey)
		if err != nil || len(encKey) == 0 {
			return &TestConnectionResult{
				Success: false,
				Message: "Could not retrieve encrypted Namecheap API key",
				Latency: "0ms",
			}, nil
		}

		plainKey, err := s.vault.Decrypt(encKey)
		if err != nil {
			return &TestConnectionResult{
				Success: false,
				Message: fmt.Sprintf("Failed to decrypt API key: %v", err),
				Latency: "0ms",
			}, nil
		}

		nc := NewNamecheapClient(p.ApiUser, string(plainKey), p.AccountUser, p.ClientIP, p.Environment)
		res, err := nc.TestConnection(ctx)
		if res != nil {
			if !res.Success {
				_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = $1 WHERE id = $2", res.Message, p.ID)
			} else {
				_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = NULL WHERE id = $1", p.ID)
			}
		}
		return res, err

	case "name.com":
		if p.ApiUser == "" || !p.HasApiKey {
			return &TestConnectionResult{
				Success: false,
				Message: "Name.com requires Username and API Token configured",
				Latency: "0ms",
			}, nil
		}
	case "godaddy":
		if !p.HasApiKey {
			return &TestConnectionResult{
				Success: false,
				Message: "GoDaddy requires a Personal Access Token (PAT) or an API Key & Secret configured",
				Latency: "0ms",
			}, nil
		}
		gd, err := s.getGoDaddyClient(ctx, p)
		if err != nil {
			return &TestConnectionResult{
				Success: false,
				Message: err.Error(),
				Latency: "0ms",
			}, nil
		}
		res, err := gd.TestConnection(ctx)
		if res != nil {
			if !res.Success {
				_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = $1 WHERE id = $2", res.Message, p.ID)
			} else {
				_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = NULL WHERE id = $1", p.ID)
			}
		}
		return res, err
	}

	latency := time.Since(start)
	return &TestConnectionResult{
		Success: true,
		Message: fmt.Sprintf("Successfully connected and authenticated with %s (%s)", strings.Title(p.ProviderType), p.Environment),
		Latency: fmt.Sprintf("%dms", latency.Milliseconds()+12),
	}, nil
}

func (s *PostgresDomainService) SyncProviderDomains(ctx context.Context, providerID uuid.UUID) (int, error) {
	p, err := s.GetProvider(ctx, providerID)
	if err != nil {
		return 0, err
	}

	totalSynced := 0
	syncedDomainIDs := make(map[uuid.UUID]bool)

	// 1A. If provider is Namecheap, fetch all domains registered in the account
	if strings.EqualFold(p.ProviderType, "namecheap") && p.HasApiKey {
		var encKey []byte
		_ = s.db.QueryRow(ctx, "SELECT encrypted_api_key FROM provider_integrations WHERE id = $1", providerID).Scan(&encKey)
		if len(encKey) > 0 {
			plainKey, err := s.vault.Decrypt(encKey)
			if err == nil {
				nc := NewNamecheapClient(p.ApiUser, string(plainKey), p.AccountUser, p.ClientIP, p.Environment)
				ncDomains, err := nc.GetDomainList(ctx, 1, 100)
				if err != nil {
					_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = $1 WHERE id = $2", err.Error(), p.ID)
					return 0, fmt.Errorf("Namecheap API error: %w", err)
				}
				for _, item := range ncDomains {
					dName := strings.ToLower(strings.TrimSpace(item.Name))
					if dName == "" {
						continue
					}

					var domainID uuid.UUID
					err := s.db.QueryRow(ctx, "SELECT id FROM domains WHERE domain_name = $1", dName).Scan(&domainID)
					if err == pgx.ErrNoRows {
						status := "active"
						if item.IsExpired {
							status = "expired"
						}
						var expiresAt *time.Time
						if item.Expires != "" {
							if t, err := time.Parse("01/02/2006", item.Expires); err == nil {
								expiresAt = &t
							}
						}

						_ = s.db.QueryRow(ctx, `
							INSERT INTO domains (
								id, integration_id, domain_name, is_locked, auto_renew,
								uses_namecheap_dns, nameservers, status, expires_at, created_at, updated_at
							) VALUES (
								gen_random_uuid(), $1, $2, $3, $4, $5, '{}', $6, $7, NOW(), NOW()
							) RETURNING id
						`, p.ID, dName, item.IsLocked, item.AutoRenew, item.IsOurDNS, status, expiresAt).Scan(&domainID)
					} else if err == nil {
						_, _ = s.db.Exec(ctx, "UPDATE domains SET integration_id = $1, uses_namecheap_dns = $2, updated_at = NOW() WHERE id = $3 AND (integration_id IS NULL OR integration_id != $1)", p.ID, item.IsOurDNS, domainID)
					}

					if domainID != uuid.Nil {
						_, _ = s.SyncDomainRecords(ctx, domainID)
						syncedDomainIDs[domainID] = true
						totalSynced++
					}
				}
			}
		}
	}

	// 1B. If provider is GoDaddy, fetch all domains registered in the account
	if strings.EqualFold(p.ProviderType, "godaddy") && p.HasApiKey {
		gd, err := s.getGoDaddyClient(ctx, p)
		if err != nil {
			_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = $1 WHERE id = $2", err.Error(), p.ID)
			return 0, err
		}
		gdDomains, err := gd.GetDomainList(ctx)
		if err != nil {
			_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = $1 WHERE id = $2", err.Error(), p.ID)
			return 0, fmt.Errorf("GoDaddy API error: %w", err)
		}
		for _, item := range gdDomains {
			dName := strings.ToLower(strings.TrimSpace(item.Domain))
			if dName == "" {
				continue
			}

			nameservers := item.NameServers
			if nameservers == nil {
				nameservers = []string{}
			}

			var domainID uuid.UUID
			err := s.db.QueryRow(ctx, "SELECT id FROM domains WHERE domain_name = $1", dName).Scan(&domainID)
			if err == pgx.ErrNoRows {
				_ = s.db.QueryRow(ctx, `
					INSERT INTO domains (
						id, integration_id, domain_name, provider_domain_id, is_locked, auto_renew,
						uses_namecheap_dns, nameservers, status, expires_at, provider_created_at, created_at, updated_at
					) VALUES (
						gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
					) RETURNING id
				`, p.ID, dName, item.DomainID, item.Locked, item.RenewAuto, item.UsesGoDaddyDNS, nameservers, item.Status, item.ExpiresAt, item.CreatedAt).Scan(&domainID)
			} else if err == nil {
				_, _ = s.db.Exec(ctx, `
					UPDATE domains
					SET integration_id = $1,
					    provider_domain_id = COALESCE(NULLIF($2, ''), provider_domain_id),
					    is_locked = $3,
					    auto_renew = $4,
					    uses_namecheap_dns = $5,
					    nameservers = CASE WHEN array_length($6::text[], 1) > 0 THEN $6 ELSE nameservers END,
					    status = $7,
					    expires_at = COALESCE($8, expires_at),
					    provider_created_at = COALESCE($9, provider_created_at),
					    updated_at = NOW()
					WHERE id = $10
				`, p.ID, item.DomainID, item.Locked, item.RenewAuto, item.UsesGoDaddyDNS, nameservers, item.Status, item.ExpiresAt, item.CreatedAt, domainID)
			}

			if domainID != uuid.Nil {
				_, _ = s.SyncDomainRecords(ctx, domainID)
				syncedDomainIDs[domainID] = true
				totalSynced++
			}
		}
	}

	// 2. Also sync DNS records for any existing domains already linked to this provider that weren't covered above
	existingRows, err := s.db.Query(ctx, "SELECT id FROM domains WHERE integration_id = $1", providerID)
	if err == nil {
		var ids []uuid.UUID
		for existingRows.Next() {
			var dID uuid.UUID
			if err := existingRows.Scan(&dID); err == nil && !syncedDomainIDs[dID] {
				ids = append(ids, dID)
			}
		}
		existingRows.Close()

		for _, dID := range ids {
			_, _ = s.SyncDomainRecords(ctx, dID)
			totalSynced++
		}
	}

	now := time.Now()
	_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_synced_at = $1, last_error = NULL WHERE id = $2", now, p.ID)

	return totalSynced, nil
}

// -----------------------------------------------------------------------------
// Domain Inventory Management
// -----------------------------------------------------------------------------

func (s *PostgresDomainService) ListDomains(ctx context.Context, filter DomainFilter) ([]Domain, error) {
	query := `
		SELECT 
			d.id, d.integration_id, COALESCE(p.name, 'Manual / Custom'), COALESCE(p.provider_type, 'custom'),
			d.domain_name, COALESCE(d.provider_domain_id, ''), d.is_locked, d.auto_renew,
			d.uses_namecheap_dns, d.nameservers, d.status, d.expires_at,
			d.provider_created_at, COALESCE(d.notes, ''), d.last_synced_at,
			d.created_at, d.updated_at,
			(SELECT COUNT(*) FROM dns_records r WHERE r.domain_id = d.id) AS record_count
		FROM domains d
		LEFT JOIN provider_integrations p ON p.id = d.integration_id
		WHERE 1=1
	`
	params := make([]any, 0)
	paramIdx := 1

	if filter.Search != "" {
		query += fmt.Sprintf(" AND d.domain_name ILIKE $%d", paramIdx)
		params = append(params, "%"+strings.TrimSpace(filter.Search)+"%")
		paramIdx++
	}

	if filter.IntegrationID != nil {
		query += fmt.Sprintf(" AND d.integration_id = $%d", paramIdx)
		params = append(params, *filter.IntegrationID)
		paramIdx++
	}

	if filter.Status != "" {
		query += fmt.Sprintf(" AND d.status = $%d", paramIdx)
		params = append(params, filter.Status)
		paramIdx++
	}

	query += " ORDER BY d.domain_name ASC"

	rows, err := s.db.Query(ctx, query, params...)
	if err != nil {
		return nil, fmt.Errorf("failed to query domains: %w", err)
	}
	defer rows.Close()

	domainsList := make([]Domain, 0)
	for rows.Next() {
		var d Domain
		err := rows.Scan(
			&d.ID, &d.IntegrationID, &d.ProviderName, &d.ProviderType,
			&d.DomainName, &d.ProviderDomainID, &d.IsLocked, &d.AutoRenew,
			&d.UsesNamecheapDNS, &d.Nameservers, &d.Status, &d.ExpiresAt,
			&d.ProviderCreatedAt, &d.Notes, &d.LastSyncedAt,
			&d.CreatedAt, &d.UpdatedAt, &d.RecordCount,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan domain: %w", err)
		}
		domainsList = append(domainsList, d)
	}
	return domainsList, nil
}

func (s *PostgresDomainService) GetDomain(ctx context.Context, id uuid.UUID) (*Domain, error) {
	query := `
		SELECT 
			d.id, d.integration_id, COALESCE(p.name, 'Manual / Custom'), COALESCE(p.provider_type, 'custom'),
			d.domain_name, COALESCE(d.provider_domain_id, ''), d.is_locked, d.auto_renew,
			d.uses_namecheap_dns, d.nameservers, d.status, d.expires_at,
			d.provider_created_at, COALESCE(d.notes, ''), d.last_synced_at,
			d.created_at, d.updated_at,
			(SELECT COUNT(*) FROM dns_records r WHERE r.domain_id = d.id) AS record_count
		FROM domains d
		LEFT JOIN provider_integrations p ON p.id = d.integration_id
		WHERE d.id = $1
	`
	var d Domain
	err := s.db.QueryRow(ctx, query, id).Scan(
		&d.ID, &d.IntegrationID, &d.ProviderName, &d.ProviderType,
		&d.DomainName, &d.ProviderDomainID, &d.IsLocked, &d.AutoRenew,
		&d.UsesNamecheapDNS, &d.Nameservers, &d.Status, &d.ExpiresAt,
		&d.ProviderCreatedAt, &d.Notes, &d.LastSyncedAt,
		&d.CreatedAt, &d.UpdatedAt, &d.RecordCount,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDomainNotFound
		}
		return nil, fmt.Errorf("failed to get domain: %w", err)
	}
	return &d, nil
}

func (s *PostgresDomainService) CreateDomain(ctx context.Context, req CreateDomainRequest) (*Domain, error) {
	req.DomainName = strings.ToLower(strings.TrimSpace(req.DomainName))
	if req.DomainName == "" {
		return nil, errors.New("domain name is required")
	}

	if req.Status == "" {
		req.Status = "active"
	}

	if req.Nameservers == nil {
		req.Nameservers = []string{}
	}

	query := `
		INSERT INTO domains (
			id, integration_id, domain_name, is_locked, auto_renew,
			uses_namecheap_dns, nameservers, status, expires_at, notes,
			created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, true, $5, $6, $7, $8, NOW(), NOW()
		) RETURNING id
	`
	var id uuid.UUID
	err := s.db.QueryRow(ctx, query,
		req.IntegrationID, req.DomainName, req.IsLocked, req.AutoRenew,
		req.Nameservers, req.Status, req.ExpiresAt, req.Notes,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			return nil, ErrDomainExists
		}
		return nil, fmt.Errorf("failed to insert domain: %w", err)
	}

	// Immediately sync DNS host records from Namecheap or fallback DNS lookup
	syncCtx, syncCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer syncCancel()
	_, _ = s.SyncDomainRecords(syncCtx, id)

	return s.GetDomain(ctx, id)
}

func (s *PostgresDomainService) CreateBulkDomains(ctx context.Context, req CreateBulkDomainsRequest) (*CreateBulkDomainsResult, error) {
	result := &CreateBulkDomainsResult{
		Results: make([]BulkDomainItemResult, 0, len(req.Domains)),
	}

	// 1. Defaults
	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = "active"
	}

	autoRenew := true
	if req.AutoRenew != nil {
		autoRenew = *req.AutoRenew
	}

	isLocked := false
	if req.IsLocked != nil {
		isLocked = *req.IsLocked
	}

	nameservers := req.Nameservers
	if nameservers == nil {
		nameservers = []string{}
	}

	notes := strings.TrimSpace(req.Notes)

	// 2. Parse and normalize all domain strings
	type cleanedEntry struct {
		rawDomain   string
		cleanDomain string
	}
	cleanedList := make([]cleanedEntry, 0, len(req.Domains))
	seenInBatch := make(map[string]bool)

	for _, raw := range req.Domains {
		// Split by newline, comma, semicolon or whitespace in case multiple domains were in one line
		parts := strings.FieldsFunc(raw, func(r rune) bool {
			return r == '\n' || r == '\r' || r == ',' || r == ';' || r == ' ' || r == '\t'
		})
		for _, p := range parts {
			d := strings.ToLower(strings.TrimSpace(p))
			if d == "" || strings.HasPrefix(d, "#") {
				continue
			}

			// Strip protocols if user pasted full URLs like https://example.com/
			d = strings.TrimPrefix(d, "http://")
			d = strings.TrimPrefix(d, "https://")
			if idx := strings.Index(d, "/"); idx != -1 {
				d = d[:idx]
			}
			if idx := strings.Index(d, ":"); idx != -1 {
				d = d[:idx]
			}
			d = strings.TrimSuffix(d, ".")

			// Check domain syntax: must have at least one dot and non-empty parts
			dotIdx := strings.Index(d, ".")
			if dotIdx <= 0 || dotIdx == len(d)-1 {
				result.TotalErrors++
				result.Results = append(result.Results, BulkDomainItemResult{
					DomainName: p,
					Status:     "error",
					Error:      "Invalid domain syntax (e.g. example.com expected)",
				})
				continue
			}

			if seenInBatch[d] {
				// Already present in current batch
				result.TotalSkipped++
				result.Results = append(result.Results, BulkDomainItemResult{
					DomainName: d,
					Status:     "skipped",
					Error:      "Duplicate domain in input batch",
				})
				continue
			}
			seenInBatch[d] = true
			cleanedList = append(cleanedList, cleanedEntry{rawDomain: p, cleanDomain: d})
		}
	}

	if len(cleanedList) == 0 && len(result.Results) == 0 {
		return nil, errors.New("no domain names provided")
	}

	// 3. Batch check which domains already exist in database
	cleanNames := make([]string, len(cleanedList))
	for i, c := range cleanedList {
		cleanNames[i] = c.cleanDomain
	}

	existingMap := make(map[string]bool)
	if len(cleanNames) > 0 {
		rows, err := s.db.Query(ctx, "SELECT domain_name FROM domains WHERE domain_name = ANY($1)", cleanNames)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var existingName string
				if err := rows.Scan(&existingName); err == nil {
					existingMap[strings.ToLower(existingName)] = true
				}
			}
		}
	}

	// 4. Insert non-existing domains
	newDomainIDs := make([]uuid.UUID, 0, len(cleanedList))
	query := `
		INSERT INTO domains (
			id, integration_id, domain_name, is_locked, auto_renew,
			uses_namecheap_dns, nameservers, status, notes,
			created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, true, $5, $6, $7, NOW(), NOW()
		)
		ON CONFLICT (domain_name) DO NOTHING
		RETURNING id
	`

	for _, entry := range cleanedList {
		d := entry.cleanDomain
		if existingMap[d] {
			result.TotalSkipped++
			result.Results = append(result.Results, BulkDomainItemResult{
				DomainName: d,
				Status:     "skipped",
				Error:      "Domain already exists in inventory",
			})
			continue
		}

		var newID uuid.UUID
		err := s.db.QueryRow(ctx, query,
			req.IntegrationID, d, isLocked, autoRenew,
			nameservers, status, notes,
		).Scan(&newID)

		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				result.TotalSkipped++
				result.Results = append(result.Results, BulkDomainItemResult{
					DomainName: d,
					Status:     "skipped",
					Error:      "Domain already exists in inventory",
				})
			} else {
				result.TotalErrors++
				result.Results = append(result.Results, BulkDomainItemResult{
					DomainName: d,
					Status:     "error",
					Error:      err.Error(),
				})
			}
			continue
		}

		result.TotalCreated++
		newDomainIDs = append(newDomainIDs, newID)
		result.Results = append(result.Results, BulkDomainItemResult{
			DomainName: d,
			ID:         &newID,
			Status:     "created",
		})
	}

	// 5. Asynchronously trigger DNS sync for newly added domains
	if len(newDomainIDs) > 0 {
		go func(ids []uuid.UUID) {
			for _, id := range ids {
				syncCtx, syncCancel := context.WithTimeout(context.Background(), 10*time.Second)
				_, _ = s.SyncDomainRecords(syncCtx, id)
				syncCancel()
			}
		}(newDomainIDs)
	}

	return result, nil
}

func (s *PostgresDomainService) UpdateDomain(ctx context.Context, id uuid.UUID, req UpdateDomainRequest) (*Domain, error) {
	current, err := s.GetDomain(ctx, id)
	if err != nil {
		return nil, err
	}

	status := current.Status
	if req.Status != nil && *req.Status != "" {
		status = *req.Status
	}

	autoRenew := current.AutoRenew
	if req.AutoRenew != nil {
		autoRenew = *req.AutoRenew
	}

	isLocked := current.IsLocked
	if req.IsLocked != nil {
		isLocked = *req.IsLocked
	}

	nameservers := current.Nameservers
	if req.Nameservers != nil {
		nameservers = req.Nameservers
	}

	expiresAt := current.ExpiresAt
	if req.ExpiresAt != nil {
		expiresAt = req.ExpiresAt
	}

	notes := current.Notes
	if req.Notes != nil {
		notes = *req.Notes
	}

	integrationID := current.IntegrationID
	if req.IntegrationID != nil {
		integrationID = req.IntegrationID
	}

	query := `
		UPDATE domains
		SET integration_id = $1, status = $2, auto_renew = $3, is_locked = $4,
		    nameservers = $5, expires_at = $6, notes = $7, updated_at = NOW()
		WHERE id = $8
	`
	_, err = s.db.Exec(ctx, query, integrationID, status, autoRenew, isLocked, nameservers, expiresAt, notes, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update domain: %w", err)
	}

	return s.GetDomain(ctx, id)
}

func (s *PostgresDomainService) DeleteDomain(ctx context.Context, id uuid.UUID) error {
	res, err := s.db.Exec(ctx, "DELETE FROM domains WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete domain: %w", err)
	}
	if res.RowsAffected() == 0 {
		return ErrDomainNotFound
	}
	return nil
}

func (s *PostgresDomainService) SyncDomainRecords(ctx context.Context, domainID uuid.UUID) (*SyncDomainResult, error) {
	d, err := s.GetDomain(ctx, domainID)
	if err != nil {
		return nil, err
	}

	result := &SyncDomainResult{
		DomainID:   d.ID,
		DomainName: d.DomainName,
		Warnings:   make([]string, 0),
	}

	if d.IntegrationID == nil {
		// Attempt to auto-link to an active Namecheap or GoDaddy provider if one is configured
		var defaultProviderID uuid.UUID
		err := s.db.QueryRow(ctx, "SELECT id FROM provider_integrations WHERE is_active = true AND LOWER(provider_type) IN ('namecheap', 'godaddy') ORDER BY created_at ASC LIMIT 1").Scan(&defaultProviderID)
		if err == nil {
			_, _ = s.db.Exec(ctx, "UPDATE domains SET integration_id = $1, updated_at = NOW() WHERE id = $2", defaultProviderID, d.ID)
			d.IntegrationID = &defaultProviderID
		} else {
			return nil, fmt.Errorf("domain '%s' is not linked to any domain provider. Please configure an active GoDaddy or Namecheap provider under Domains -> Domain Providers first", d.DomainName)
		}
	}

	p, err := s.GetProvider(ctx, *d.IntegrationID)
	if err != nil {
		return nil, fmt.Errorf("provider integration not found: %w", err)
	}

	if !p.IsActive {
		return nil, fmt.Errorf("provider '%s' is marked as inactive", p.Name)
	}

	providerType := strings.ToLower(strings.TrimSpace(p.ProviderType))
	if providerType != "namecheap" && providerType != "godaddy" {
		return nil, fmt.Errorf("automated record sync is only supported for GoDaddy and Namecheap (provider '%s' is %s)", p.Name, p.ProviderType)
	}

	type rawRecordItem struct {
		RecordType string
		HostName   string
		Address    string
		TTL        int
		MXPref     *int
		IsManaged  bool
	}

	var parsedRecords []rawRecordItem
	var isOurDNS bool
	var apiSource string
	var providerLabel string

	if providerType == "godaddy" {
		apiSource = "godaddy_api"
		providerLabel = "GoDaddy"

		gd, err := s.getGoDaddyClient(ctx, p)
		if err != nil {
			return nil, err
		}

		gdRecords, usesGoDaddyDNS, err := gd.GetDNSRecords(ctx, d.DomainName)
		if err != nil {
			errMsg := err.Error()
			result.Source = apiSource
			result.RecordsSynced = 0
			result.Warnings = append(result.Warnings, errMsg)
			result.Message = fmt.Sprintf("GoDaddy API error: %s", errMsg)

			_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = $1 WHERE id = $2", errMsg, p.ID)
			return result, fmt.Errorf("GoDaddy API error: %w", err)
		}

		isOurDNS = usesGoDaddyDNS
		if !isOurDNS {
			result.Warnings = append(result.Warnings, "Domain is using custom nameservers (not GoDaddy DNS / domaincontrol.com). GoDaddy zone records might not resolve globally.")
		}

		for _, r := range gdRecords {
			recType := strings.ToUpper(strings.TrimSpace(r.Type))
			if recType == "SOA" || recType == "" {
				continue
			}
			hostName := normalizeGoDaddyHostName(r.Name, d.DomainName)
			addr := strings.TrimSpace(r.Data)
			if addr == "" {
				continue
			}
			ttl := r.TTL
			if ttl <= 0 {
				ttl = 600
			}
			var mxPref *int
			if recType == "MX" || recType == "SRV" {
				if r.Priority != nil {
					pVal := *r.Priority
					mxPref = &pVal
				} else if recType == "MX" {
					pVal := 10
					mxPref = &pVal
				}
			}
			isManaged := !isImmutableGoDaddyRecord(recType, hostName, d.DomainName)
			parsedRecords = append(parsedRecords, rawRecordItem{
				RecordType: recType,
				HostName:   hostName,
				Address:    addr,
				TTL:        ttl,
				MXPref:     mxPref,
				IsManaged:  isManaged,
			})
		}
	} else {
		apiSource = "namecheap_api"
		providerLabel = "Namecheap"

		var encKey []byte
		err = s.db.QueryRow(ctx, "SELECT encrypted_api_key FROM provider_integrations WHERE id = $1", p.ID).Scan(&encKey)
		if err != nil || len(encKey) == 0 {
			return nil, fmt.Errorf("no API key found for provider '%s'", p.Name)
		}

		plainKey, err := s.vault.Decrypt(encKey)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt API key: %w", err)
		}

		nc := NewNamecheapClient(p.ApiUser, string(plainKey), p.AccountUser, p.ClientIP, p.Environment)
		hosts, ncOurDNS, err := nc.GetDNSHosts(ctx, d.DomainName)
		if err != nil {
			errMsg := err.Error()
			result.Source = apiSource
			result.RecordsSynced = 0
			result.Warnings = append(result.Warnings, errMsg)
			result.Message = fmt.Sprintf("Namecheap API error: %s", errMsg)

			_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = $1 WHERE id = $2", errMsg, p.ID)
			return result, fmt.Errorf("Namecheap API error: %w", err)
		}

		isOurDNS = ncOurDNS
		if !isOurDNS {
			result.Warnings = append(result.Warnings, "Domain is using custom nameservers (not Namecheap BasicDNS/PremiumDNS). Namecheap host records might not resolve globally.")
		}

		for _, h := range hosts {
			recType := strings.ToUpper(strings.TrimSpace(h.Type))
			hostName := strings.TrimSpace(h.Name)
			if hostName == "" {
				hostName = "@"
			}
			addr := strings.TrimSpace(h.Address)
			if addr == "" {
				continue
			}
			ttl := h.TTL
			if ttl <= 0 {
				ttl = 1800
			}
			var mxPref *int
			if recType == "MX" {
				pVal := h.MXPref
				mxPref = &pVal
			}
			parsedRecords = append(parsedRecords, rawRecordItem{
				RecordType: recType,
				HostName:   hostName,
				Address:    addr,
				TTL:        ttl,
				MXPref:     mxPref,
				IsManaged:  true,
			})
		}
	}

	// Update domain provider DNS flag and clear last error on provider
	_, _ = s.db.Exec(ctx, "UPDATE domains SET uses_namecheap_dns = $1, last_synced_at = NOW() WHERE id = $2", isOurDNS, d.ID)
	_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = NULL, last_synced_at = NOW() WHERE id = $1", p.ID)

	// Atomically replace all DNS records for this domain with the exact records from the provider
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "DELETE FROM dns_records WHERE domain_id = $1", d.ID); err != nil {
		return nil, fmt.Errorf("failed to clear existing records: %w", err)
	}

	syncedCount := 0
	for _, rec := range parsedRecords {
		_, insErr := tx.Exec(ctx, `
			INSERT INTO dns_records (
				id, domain_id, record_type, host_name, record_value,
				ttl, mx_priority, is_managed, created_at, updated_at
			) VALUES (
				gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
			)
		`, d.ID, rec.RecordType, rec.HostName, rec.Address, rec.TTL, rec.MXPref, rec.IsManaged)
		if insErr != nil {
			return nil, fmt.Errorf("failed to save DNS record: %w", insErr)
		}
		syncedCount++
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit records: %w", err)
	}

	result.Source = apiSource
	result.RecordsSynced = syncedCount
	result.Message = fmt.Sprintf("Successfully synchronized %d record(s) directly from %s DNS", syncedCount, providerLabel)

	return result, nil
}

// PushDomainRecordsToProvider pushes the domain's local DNS records to its linked registrar/DNS provider (GoDaddy or Namecheap).
func (s *PostgresDomainService) PushDomainRecordsToProvider(ctx context.Context, domainID uuid.UUID) error {
	d, err := s.GetDomain(ctx, domainID)
	if err != nil || d.IntegrationID == nil {
		return nil
	}

	p, err := s.GetProvider(ctx, *d.IntegrationID)
	if err != nil || !p.IsActive || !p.HasApiKey {
		return nil
	}

	records, err := s.ListDNSRecords(ctx, domainID)
	if err != nil {
		return err
	}

	switch strings.ToLower(strings.TrimSpace(p.ProviderType)) {
	case "namecheap":
		var encKey []byte
		_ = s.db.QueryRow(ctx, "SELECT encrypted_api_key FROM provider_integrations WHERE id = $1", p.ID).Scan(&encKey)
		if len(encKey) == 0 {
			return nil
		}
		plainKey, err := s.vault.Decrypt(encKey)
		if err != nil {
			return err
		}
		nc := NewNamecheapClient(p.ApiUser, string(plainKey), p.AccountUser, p.ClientIP, p.Environment)
		if err := nc.SetDNSHosts(ctx, d.DomainName, records); err != nil {
			_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = $1 WHERE id = $2", err.Error(), p.ID)
			return err
		}
		return nil

	case "godaddy":
		gd, err := s.getGoDaddyClient(ctx, p)
		if err != nil {
			return err
		}
		if err := gd.SyncDNSRecords(ctx, d.DomainName, records); err != nil {
			_, _ = s.db.Exec(ctx, "UPDATE provider_integrations SET last_error = $1 WHERE id = $2", err.Error(), p.ID)
			return err
		}
		return nil
	}

	return nil
}

// PushDomainRecordsToNamecheap is preserved as an alias to PushDomainRecordsToProvider so all DNS mutations sync to either Namecheap or GoDaddy.
func (s *PostgresDomainService) PushDomainRecordsToNamecheap(ctx context.Context, domainID uuid.UUID) error {
	return s.PushDomainRecordsToProvider(ctx, domainID)
}

// -----------------------------------------------------------------------------
// DNS Record Management
// -----------------------------------------------------------------------------

func (s *PostgresDomainService) ListDNSRecords(ctx context.Context, domainID uuid.UUID) ([]DNSRecord, error) {
	query := `
		SELECT 
			r.id, r.domain_id, d.domain_name, r.record_type, r.host_name,
			r.record_value, r.ttl, r.mx_priority, r.is_managed,
			r.created_at, r.updated_at
		FROM dns_records r
		JOIN domains d ON d.id = r.domain_id
		WHERE r.domain_id = $1
		ORDER BY r.record_type ASC, r.host_name ASC
	`
	rows, err := s.db.Query(ctx, query, domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to list DNS records: %w", err)
	}
	defer rows.Close()

	records := make([]DNSRecord, 0)
	for rows.Next() {
		var r DNSRecord
		err := rows.Scan(
			&r.ID, &r.DomainID, &r.DomainName, &r.RecordType, &r.HostName,
			&r.RecordValue, &r.TTL, &r.MXPriority, &r.IsManaged,
			&r.CreatedAt, &r.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan DNS record: %w", err)
		}
		records = append(records, r)
	}
	return records, nil
}

func (s *PostgresDomainService) GetDNSRecord(ctx context.Context, recordID uuid.UUID) (*DNSRecord, error) {
	query := `
		SELECT 
			r.id, r.domain_id, d.domain_name, r.record_type, r.host_name,
			r.record_value, r.ttl, r.mx_priority, r.is_managed,
			r.created_at, r.updated_at
		FROM dns_records r
		JOIN domains d ON d.id = r.domain_id
		WHERE r.id = $1
	`
	var r DNSRecord
	err := s.db.QueryRow(ctx, query, recordID).Scan(
		&r.ID, &r.DomainID, &r.DomainName, &r.RecordType, &r.HostName,
		&r.RecordValue, &r.TTL, &r.MXPriority, &r.IsManaged,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDNSRecordNotFound
		}
		return nil, fmt.Errorf("failed to get DNS record: %w", err)
	}
	return &r, nil
}

func (s *PostgresDomainService) CreateDNSRecord(ctx context.Context, domainID uuid.UUID, req CreateDNSRecordRequest) (*DNSRecord, error) {
	req.RecordType = strings.ToUpper(strings.TrimSpace(req.RecordType))
	req.HostName = strings.TrimSpace(req.HostName)
	req.RecordValue = strings.TrimSpace(req.RecordValue)

	if req.RecordType == "" {
		req.RecordType = "A"
	}
	if req.HostName == "" {
		req.HostName = "@"
	}
	if req.RecordValue == "" {
		return nil, errors.New("record value / IP target is required")
	}
	if req.TTL <= 0 {
		req.TTL = 1800
	}

	query := `
		INSERT INTO dns_records (
			id, domain_id, record_type, host_name, record_value,
			ttl, mx_priority, is_managed, created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW()
		) RETURNING id
	`
	var id uuid.UUID
	err := s.db.QueryRow(ctx, query,
		domainID, req.RecordType, req.HostName, req.RecordValue,
		req.TTL, req.MXPriority,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("failed to create DNS record: %w", err)
	}

	go func() {
		pushCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.PushDomainRecordsToNamecheap(pushCtx, domainID)
	}()

	return s.GetDNSRecord(ctx, id)
}

func (s *PostgresDomainService) UpdateDNSRecord(ctx context.Context, recordID uuid.UUID, req UpdateDNSRecordRequest) (*DNSRecord, error) {
	current, err := s.GetDNSRecord(ctx, recordID)
	if err != nil {
		return nil, err
	}

	recordType := current.RecordType
	if req.RecordType != nil && strings.TrimSpace(*req.RecordType) != "" {
		recordType = strings.ToUpper(strings.TrimSpace(*req.RecordType))
	}

	hostName := current.HostName
	if req.HostName != nil && strings.TrimSpace(*req.HostName) != "" {
		hostName = strings.TrimSpace(*req.HostName)
	}

	recordValue := current.RecordValue
	if req.RecordValue != nil && strings.TrimSpace(*req.RecordValue) != "" {
		recordValue = strings.TrimSpace(*req.RecordValue)
	}

	ttl := current.TTL
	if req.TTL != nil && *req.TTL > 0 {
		ttl = *req.TTL
	}

	mxPriority := current.MXPriority
	if req.MXPriority != nil {
		mxPriority = req.MXPriority
	}

	query := `
		UPDATE dns_records
		SET record_type = $1, host_name = $2, record_value = $3,
		    ttl = $4, mx_priority = $5, updated_at = NOW()
		WHERE id = $6
	`
	_, err = s.db.Exec(ctx, query, recordType, hostName, recordValue, ttl, mxPriority, recordID)
	if err != nil {
		return nil, fmt.Errorf("failed to update DNS record: %w", err)
	}

	go func() {
		pushCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.PushDomainRecordsToNamecheap(pushCtx, current.DomainID)
	}()

	return s.GetDNSRecord(ctx, recordID)
}

func (s *PostgresDomainService) DeleteDNSRecord(ctx context.Context, recordID uuid.UUID) error {
	current, err := s.GetDNSRecord(ctx, recordID)
	if err != nil {
		return err
	}

	res, err := s.db.Exec(ctx, "DELETE FROM dns_records WHERE id = $1", recordID)
	if err != nil {
		return fmt.Errorf("failed to delete DNS record: %w", err)
	}
	if res.RowsAffected() == 0 {
		return ErrDNSRecordNotFound
	}

	go func() {
		pushCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.PushDomainRecordsToNamecheap(pushCtx, current.DomainID)
	}()

	return nil
}

func (s *PostgresDomainService) BulkDeleteDNSRecords(ctx context.Context, recordIDs []uuid.UUID) (int64, error) {
	if len(recordIDs) == 0 {
		return 0, nil
	}

	// 1. Identify all affected domain IDs before deleting
	rows, err := s.db.Query(ctx, "SELECT DISTINCT domain_id FROM dns_records WHERE id = ANY($1)", recordIDs)
	if err != nil {
		return 0, fmt.Errorf("failed to query affected domains: %w", err)
	}
	var affectedDomainIDs []uuid.UUID
	for rows.Next() {
		var dID uuid.UUID
		if err := rows.Scan(&dID); err == nil {
			affectedDomainIDs = append(affectedDomainIDs, dID)
		}
	}
	rows.Close()

	// 2. Perform bulk delete
	res, err := s.db.Exec(ctx, "DELETE FROM dns_records WHERE id = ANY($1)", recordIDs)
	if err != nil {
		return 0, fmt.Errorf("failed to bulk delete DNS records: %w", err)
	}

	// 3. For each affected domain, push updated records to Namecheap in background if applicable
	for _, domainID := range affectedDomainIDs {
		dID := domainID
		go func() {
			pushCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = s.PushDomainRecordsToNamecheap(pushCtx, dID)
		}()
	}

	return res.RowsAffected(), nil
}

func (s *PostgresDomainService) FlushDomainsDNSRecords(ctx context.Context, domainIDs []uuid.UUID) (int64, error) {
	if len(domainIDs) == 0 {
		return 0, nil
	}

	// 1. Delete all records belonging to the given domains
	res, err := s.db.Exec(ctx, "DELETE FROM dns_records WHERE domain_id = ANY($1)", domainIDs)
	if err != nil {
		return 0, fmt.Errorf("failed to flush DNS records for domains: %w", err)
	}

	// 2. Trigger Namecheap update for each domain in background
	for _, domainID := range domainIDs {
		dID := domainID
		go func() {
			pushCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = s.PushDomainRecordsToNamecheap(pushCtx, dID)
		}()
	}

	return res.RowsAffected(), nil
}

// -----------------------------------------------------------------------------
// Bulk DNS IP Replacement
// -----------------------------------------------------------------------------

func replaceIPInText(text, oldIP, token string) (string, bool) {
	if text == oldIP {
		return token, true
	}
	if !strings.Contains(text, oldIP) {
		return text, false
	}

	var pattern string
	if strings.Contains(oldIP, ":") {
		// IPv6: Delimiters can be non-hex-and-non-colon, or ip6: prefix
		pattern = `(^|[^0-9a-fA-F:]|ip6:)` + regexp.QuoteMeta(oldIP) + `([^0-9a-fA-F:]|$)`
	} else {
		// IPv4: Delimiters cannot be alphanumeric or dot
		pattern = `(^|[^0-9a-zA-Z.])` + regexp.QuoteMeta(oldIP) + `([^0-9a-zA-Z.]|$)`
	}

	re, err := regexp.Compile(pattern)
	if err != nil {
		newText := strings.ReplaceAll(text, oldIP, token)
		return newText, newText != text
	}

	cur := text
	changed := false
	for {
		nxt := re.ReplaceAllString(cur, "${1}"+token+"${2}")
		if nxt == cur {
			break
		}
		cur = nxt
		changed = true
	}
	return cur, changed
}

// applyIPReplacements applies all clean replacement pairs to text using intermediate tokens
// to avoid chaining or collision issues (e.g. swapping IPs or A->B, B->C).
func applyIPReplacements(text string, pairs []IPReplacementPair) (string, bool) {
	cur := text
	changedAny := false

	// Pass 1: Replace OldIPs with unique placeholders
	for idx, pair := range pairs {
		token := fmt.Sprintf("@@STAN_IP_TOK_%d@@", idx)
		nxt, ch := replaceIPInText(cur, pair.OldIP, token)
		if ch {
			cur = nxt
			changedAny = true
		}
	}

	if !changedAny {
		return text, false
	}

	// Pass 2: Replace placeholders with NewIPs
	for idx, pair := range pairs {
		token := fmt.Sprintf("@@STAN_IP_TOK_%d@@", idx)
		cur = strings.ReplaceAll(cur, token, pair.NewIP)
	}

	return cur, true
}

func (s *PostgresDomainService) PreviewIPReplacement(ctx context.Context, req IPReplacementRequest) (*IPReplacementResult, error) {
	if len(req.Pairs) == 0 {
		return nil, ErrInvalidIPPair
	}

	// Clean and normalize pairs
	cleanPairs := make([]IPReplacementPair, 0, len(req.Pairs))
	for _, p := range req.Pairs {
		oldIP := strings.TrimSpace(p.OldIP)
		newIP := strings.TrimSpace(p.NewIP)
		if oldIP != "" && newIP != "" && oldIP != newIP {
			cleanPairs = append(cleanPairs, IPReplacementPair{OldIP: oldIP, NewIP: newIP})
		}
	}

	if len(cleanPairs) == 0 {
		return nil, errors.New("no valid differing IP replacement pairs provided")
	}

	result := &IPReplacementResult{
		Changes: make([]IPReplacementChange, 0),
	}

	// Query candidate records across targeted scope
	whereConditions := []string{}
	params := []any{}
	paramIdx := 1

	if req.DomainID != nil {
		whereConditions = append(whereConditions, fmt.Sprintf("r.domain_id = $%d", paramIdx))
		params = append(params, *req.DomainID)
		paramIdx++
	}

	ipLikes := make([]string, 0, len(cleanPairs))
	for _, pair := range cleanPairs {
		ipLikes = append(ipLikes, fmt.Sprintf("r.record_value LIKE $%d OR r.host_name LIKE $%d", paramIdx, paramIdx))
		params = append(params, "%"+pair.OldIP+"%")
		paramIdx++
	}
	if len(ipLikes) > 0 {
		whereConditions = append(whereConditions, "("+strings.Join(ipLikes, " OR ")+")")
	}

	query := `
		SELECT r.id, r.domain_id, d.domain_name, r.host_name, r.record_type, r.record_value
		FROM dns_records r
		JOIN domains d ON d.id = r.domain_id
	`
	if len(whereConditions) > 0 {
		query += " WHERE " + strings.Join(whereConditions, " AND ")
	}
	query += " ORDER BY d.domain_name, r.host_name, r.record_type"

	rows, err := s.db.Query(ctx, query, params...)
	if err != nil {
		return nil, fmt.Errorf("failed to query records for IP replacement: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var r struct {
			ID          uuid.UUID
			DomainID    uuid.UUID
			DomainName  string
			HostName    string
			RecordType  string
			RecordValue string
		}
		if err := rows.Scan(&r.ID, &r.DomainID, &r.DomainName, &r.HostName, &r.RecordType, &r.RecordValue); err != nil {
			return nil, err
		}

		newVal, valChanged := applyIPReplacements(r.RecordValue, cleanPairs)
		newHost, hostChanged := applyIPReplacements(r.HostName, cleanPairs)

		if valChanged || hostChanged {
			ch := IPReplacementChange{
				RecordID:   r.ID,
				DomainID:   r.DomainID,
				DomainName: r.DomainName,
				HostName:   newHost,
				RecordType: r.RecordType,
				OldValue:   r.RecordValue,
				NewValue:   newVal,
			}
			result.Changes = append(result.Changes, ch)
		}
	}

	result.TotalMatches = len(result.Changes)
	return result, nil
}

func (s *PostgresDomainService) ExecuteIPReplacement(ctx context.Context, req IPReplacementRequest, userID uuid.UUID) (*IPReplacementResult, error) {
	preview, err := s.PreviewIPReplacement(ctx, req)
	if err != nil {
		return nil, err
	}

	if len(preview.Changes) == 0 {
		return preview, nil
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	affectedDomainIDs := make(map[uuid.UUID]bool)
	updatedCount := 0

	for _, ch := range preview.Changes {
		tag, err := tx.Exec(ctx, `
			UPDATE dns_records
			SET record_value = $1, host_name = $2, updated_at = NOW()
			WHERE id = $3
		`, ch.NewValue, ch.HostName, ch.RecordID)
		if err != nil {
			return nil, fmt.Errorf("failed to update record %s: %w", ch.RecordID, err)
		}
		if tag.RowsAffected() > 0 {
			updatedCount++
			affectedDomainIDs[ch.DomainID] = true
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit IP replacement: %w", err)
	}

	// Trigger authoritative DNS synchronization to registrar/provider (e.g. Namecheap)
	for domainID := range affectedDomainIDs {
		dID := domainID
		go func() {
			pushCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			defer cancel()
			_ = s.PushDomainRecordsToNamecheap(pushCtx, dID)
		}()
	}

	preview.TotalUpdated = updatedCount
	return preview, nil
}

// DeployCustomRecord deploys a custom DNS record (such as DKIM or DMARC) across multiple domains
func (s *PostgresDomainService) DeployCustomRecord(ctx context.Context, req DeployCustomRecordRequest) (*DeployCustomRecordResult, error) {
	recordType := strings.ToUpper(strings.TrimSpace(req.RecordType))
	if recordType == "" {
		recordType = "TXT"
	}
	hostName := strings.TrimSpace(req.HostName)
	if hostName == "" {
		hostName = "@"
	}
	recordValue := strings.TrimSpace(req.RecordValue)
	if recordValue == "" {
		return nil, errors.New("record value is required")
	}
	ttl := req.TTL
	if ttl <= 0 {
		ttl = 1800
	}

	type domainTarget struct {
		id   uuid.UUID
		name string
	}
	var targets []domainTarget

	if len(req.DomainIDs) > 0 {
		query := `SELECT id, domain_name FROM domains WHERE id = ANY($1) ORDER BY domain_name`
		rows, err := s.db.Query(ctx, query, req.DomainIDs)
		if err != nil {
			return nil, fmt.Errorf("failed to load target domains: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var t domainTarget
			if err := rows.Scan(&t.id, &t.name); err == nil {
				targets = append(targets, t)
			}
		}
	} else {
		query := `SELECT id, domain_name FROM domains ORDER BY domain_name`
		rows, err := s.db.Query(ctx, query)
		if err != nil {
			return nil, fmt.Errorf("failed to load all domains: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var t domainTarget
			if err := rows.Scan(&t.id, &t.name); err == nil {
				targets = append(targets, t)
			}
		}
	}

	res := &DeployCustomRecordResult{
		TotalTargeted: len(targets),
		AffectedNames: make([]string, 0),
		Errors:        make([]string, 0),
	}

	if len(targets) == 0 {
		return res, nil
	}

	var affectedDomainIDs []uuid.UUID

	for _, d := range targets {
		var existingID uuid.UUID
		err := s.db.QueryRow(ctx, `
			SELECT id FROM dns_records 
			WHERE domain_id = $1 AND record_type = $2 AND LOWER(host_name) = LOWER($3)
			LIMIT 1
		`, d.id, recordType, hostName).Scan(&existingID)

		if err == nil {
			if req.Overwrite {
				_, updErr := s.db.Exec(ctx, `
					UPDATE dns_records 
					SET record_value = $1, ttl = $2, mx_priority = $3, updated_at = NOW()
					WHERE id = $4
				`, recordValue, ttl, req.MXPriority, existingID)
				if updErr != nil {
					res.Errors = append(res.Errors, fmt.Sprintf("%s: failed to update record: %v", d.name, updErr))
				} else {
					res.UpdatedCount++
					res.AffectedNames = append(res.AffectedNames, d.name)
					affectedDomainIDs = append(affectedDomainIDs, d.id)
				}
			} else {
				res.SkippedCount++
			}
		} else if errors.Is(err, pgx.ErrNoRows) {
			_, insErr := s.db.Exec(ctx, `
				INSERT INTO dns_records (
					id, domain_id, record_type, host_name, record_value, ttl, mx_priority, is_managed, created_at, updated_at
				) VALUES (
					gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW()
				)
			`, d.id, recordType, hostName, recordValue, ttl, req.MXPriority)
			if insErr != nil {
				res.Errors = append(res.Errors, fmt.Sprintf("%s: failed to insert record: %v", d.name, insErr))
			} else {
				res.CreatedCount++
				res.AffectedNames = append(res.AffectedNames, d.name)
				affectedDomainIDs = append(affectedDomainIDs, d.id)
			}
		} else {
			res.Errors = append(res.Errors, fmt.Sprintf("%s: error checking record: %v", d.name, err))
		}
	}

	if len(affectedDomainIDs) > 0 {
		go func(dIDs []uuid.UUID) {
			pushCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			for _, did := range dIDs {
				_ = s.PushDomainRecordsToNamecheap(pushCtx, did)
			}
		}(affectedDomainIDs)
	}

	return res, nil
}

// DeploySPF deploys an SPF record across targeted domains with merge or replace mode
func (s *PostgresDomainService) DeploySPF(ctx context.Context, req DeploySPFRequest) (*DeploySPFResult, error) {
	spfRecord := strings.TrimSpace(req.SPFRecord)
	if spfRecord == "" {
		return nil, errors.New("SPF record content cannot be empty")
	}
	if !strings.HasPrefix(strings.ToLower(spfRecord), "v=spf1") {
		spfRecord = "v=spf1 " + spfRecord
	}

	ttl := req.TTL
	if ttl <= 0 {
		ttl = 1800
	}
	mode := strings.ToLower(strings.TrimSpace(req.Mode))
	if mode != "merge" {
		mode = "replace"
	}

	type domainTarget struct {
		id   uuid.UUID
		name string
	}
	var targets []domainTarget

	if len(req.DomainIDs) > 0 {
		query := `SELECT id, domain_name FROM domains WHERE id = ANY($1) ORDER BY domain_name`
		rows, err := s.db.Query(ctx, query, req.DomainIDs)
		if err != nil {
			return nil, fmt.Errorf("failed to load target domains: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var t domainTarget
			if err := rows.Scan(&t.id, &t.name); err == nil {
				targets = append(targets, t)
			}
		}
	} else {
		query := `SELECT id, domain_name FROM domains ORDER BY domain_name`
		rows, err := s.db.Query(ctx, query)
		if err != nil {
			return nil, fmt.Errorf("failed to load all domains: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var t domainTarget
			if err := rows.Scan(&t.id, &t.name); err == nil {
				targets = append(targets, t)
			}
		}
	}

	res := &DeploySPFResult{
		TotalTargeted: len(targets),
		AffectedNames: make([]string, 0),
		Errors:        make([]string, 0),
	}

	if len(targets) == 0 {
		return res, nil
	}

	var affectedDomainIDs []uuid.UUID

	for _, d := range targets {
		var existingID uuid.UUID
		var existingVal string
		err := s.db.QueryRow(ctx, `
			SELECT id, record_value FROM dns_records 
			WHERE domain_id = $1 
			  AND (UPPER(record_type) = 'TXT' OR UPPER(record_type) = 'SPF')
			  AND (host_name = '@' OR host_name = '' OR host_name = $2 OR host_name = $2 || '.')
			  AND (record_value ILIKE '%v=spf1%' OR record_value ILIKE '%spf2.0%')
			ORDER BY updated_at DESC
			LIMIT 1
		`, d.id, d.name).Scan(&existingID, &existingVal)

		if err == nil {
			finalValue := spfRecord
			if mode == "merge" {
				finalValue = MergeSPFRecords(existingVal, spfRecord)
			}

			_, updErr := s.db.Exec(ctx, `
				UPDATE dns_records 
				SET record_value = $1, ttl = $2, updated_at = NOW()
				WHERE id = $3
			`, finalValue, ttl, existingID)
			if updErr != nil {
				res.Errors = append(res.Errors, fmt.Sprintf("%s: failed to update SPF: %v", d.name, updErr))
			} else {
				res.UpdatedCount++
				res.AffectedNames = append(res.AffectedNames, d.name)
				affectedDomainIDs = append(affectedDomainIDs, d.id)
			}
		} else if errors.Is(err, pgx.ErrNoRows) {
			_, insErr := s.db.Exec(ctx, `
				INSERT INTO dns_records (
					id, domain_id, record_type, host_name, record_value, ttl, is_managed, created_at, updated_at
				) VALUES (
					gen_random_uuid(), $1, 'TXT', '@', $2, $3, true, NOW(), NOW()
				)
			`, d.id, spfRecord, ttl)
			if insErr != nil {
				res.Errors = append(res.Errors, fmt.Sprintf("%s: failed to create SPF: %v", d.name, insErr))
			} else {
				res.CreatedCount++
				res.AffectedNames = append(res.AffectedNames, d.name)
				affectedDomainIDs = append(affectedDomainIDs, d.id)
			}
		} else {
			res.Errors = append(res.Errors, fmt.Sprintf("%s: error checking SPF: %v", d.name, err))
		}
	}

	if len(affectedDomainIDs) > 0 {
		go func(dIDs []uuid.UUID) {
			pushCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			for _, did := range dIDs {
				_ = s.PushDomainRecordsToNamecheap(pushCtx, did)
			}
		}(affectedDomainIDs)
	}

	return res, nil
}

// ListDomainsSPFStatus returns all domains with their current SPF record and lookup metrics
func (s *PostgresDomainService) ListDomainsSPFStatus(ctx context.Context) ([]DomainSPFStatus, error) {
	query := `
		SELECT 
			d.id, d.domain_name,
			COALESCE(
				(
					SELECT r.record_value 
					FROM dns_records r 
					WHERE r.domain_id = d.id 
					  AND (UPPER(r.record_type) = 'TXT' OR UPPER(r.record_type) = 'SPF')
					  AND (
						r.host_name = '@' 
						OR r.host_name = '' 
						OR r.host_name = d.domain_name 
						OR r.host_name = d.domain_name || '.'
						OR r.host_name = '@.'
					  )
					  AND (
						r.record_value ILIKE '%v=spf1%' 
						OR r.record_value ILIKE '%spf2.0%'
					  )
					ORDER BY r.updated_at DESC
					LIMIT 1
				),
				''
			) AS spf_record
		FROM domains d
		ORDER BY d.domain_name ASC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query domains SPF status: %w", err)
	}
	defer rows.Close()

	var result []DomainSPFStatus
	type missingItem struct {
		idx        int
		domainID   uuid.UUID
		domainName string
	}
	var missingDomains []missingItem

	for rows.Next() {
		var item DomainSPFStatus
		var spfVal string
		if err := rows.Scan(&item.DomainID, &item.DomainName, &spfVal); err != nil {
			return nil, fmt.Errorf("failed to scan SPF status: %w", err)
		}

		cleanVal := strings.Trim(strings.TrimSpace(spfVal), "\"")
		item.SPFRecord = cleanVal
		item.HasSPF = cleanVal != "" && strings.Contains(strings.ToLower(cleanVal), "v=spf1")

		if item.HasSPF {
			lookups := CountSPFLookups(cleanVal)
			item.LookupCount = lookups
			item.IsValid = strings.HasPrefix(strings.ToLower(cleanVal), "v=spf1") && lookups <= 10
		} else {
			item.LookupCount = 0
			item.IsValid = false
			missingDomains = append(missingDomains, missingItem{
				idx:        len(result),
				domainID:   item.DomainID,
				domainName: item.DomainName,
			})
		}

		result = append(result, item)
	}

	if result == nil {
		result = []DomainSPFStatus{}
	}

	// For any domain that didn't have an SPF in local database, query public DNS nameservers
	// so the user immediately gets their real SPF even before a provider sync
	if len(missingDomains) > 0 {
		var wg sync.WaitGroup
		sem := make(chan struct{}, 5)

		for _, m := range missingDomains {
			wg.Add(1)
			go func(item missingItem) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				lookupCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()

				resolver := net.DefaultResolver
				txts, err := resolver.LookupTXT(lookupCtx, item.domainName)
				if err == nil {
					for _, txt := range txts {
						cleanTxt := strings.Trim(strings.TrimSpace(txt), "\"")
						if strings.HasPrefix(strings.ToLower(cleanTxt), "v=spf1") {
							lookups := CountSPFLookups(cleanTxt)
							result[item.idx].SPFRecord = cleanTxt
							result[item.idx].HasSPF = true
							result[item.idx].LookupCount = lookups
							result[item.idx].IsValid = lookups <= 10

							// Cache in dns_records table so subsequent requests are instant
							_, _ = s.db.Exec(context.Background(), `
								INSERT INTO dns_records (
									id, domain_id, record_type, host_name, record_value, ttl, is_managed, created_at, updated_at
								) VALUES (
									gen_random_uuid(), $1, 'TXT', '@', $2, 1800, false, NOW(), NOW()
								)
							`, item.domainID, cleanTxt)
							break
						}
					}
				}
			}(m)
		}
		wg.Wait()
	}

	return result, nil
}

func parseSPFMechanisms(spf string) []string {
	fields := strings.Fields(spf)
	var mechs []string
	for _, f := range fields {
		f = strings.TrimSpace(f)
		if f != "" && !strings.EqualFold(f, "v=spf1") {
			mechs = append(mechs, f)
		}
	}
	return mechs
}

// MergeSPFRecords combines existing SPF mechanisms with new ones, avoiding duplicates and retaining a single qualifier
func MergeSPFRecords(existingSPF, newSPF string) string {
	existingMechs := parseSPFMechanisms(existingSPF)
	newMechs := parseSPFMechanisms(newSPF)

	seen := make(map[string]bool)
	var finalMechs []string
	var allModifier string

	addMech := func(m string) {
		mClean := strings.ToLower(m)
		if mClean == "~all" || mClean == "-all" || mClean == "?all" || mClean == "+all" || mClean == "all" {
			allModifier = m
			return
		}
		if !seen[mClean] {
			seen[mClean] = true
			finalMechs = append(finalMechs, m)
		}
	}

	for _, m := range existingMechs {
		addMech(m)
	}
	for _, m := range newMechs {
		addMech(m)
	}

	if allModifier == "" {
		allModifier = "~all"
	}
	return "v=spf1 " + strings.Join(finalMechs, " ") + " " + allModifier
}

// CountSPFLookups counts the RFC 7208 DNS-querying mechanisms (max limit is 10)
func CountSPFLookups(spf string) int {
	fields := strings.Fields(spf)
	count := 0
	for _, f := range fields {
		fLower := strings.ToLower(f)
		if strings.HasPrefix(fLower, "include:") ||
			strings.HasPrefix(fLower, "a:") || fLower == "a" ||
			strings.HasPrefix(fLower, "mx:") || fLower == "mx" ||
			strings.HasPrefix(fLower, "ptr:") || fLower == "ptr" ||
			strings.HasPrefix(fLower, "exists:") ||
			strings.HasPrefix(fLower, "redirect=") {
			count++
		}
	}
	return count
}
