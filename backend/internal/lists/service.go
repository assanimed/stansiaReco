package lists

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound       = errors.New("record not found")
	ErrConflict       = errors.New("record with unique identifier already exists")
	ErrValidationFail = errors.New("validation failed")
)

// Service defines the business operations for Mail List and Contact management.
type Service interface {
	// Mailbox Providers
	ListMailboxProviders(ctx context.Context, onlyActive bool) ([]MailboxProvider, error)
	GetMailboxProvider(ctx context.Context, id uuid.UUID) (*MailboxProvider, error)
	CreateMailboxProvider(ctx context.Context, req CreateMailboxProviderRequest) (*MailboxProvider, error)
	UpdateMailboxProvider(ctx context.Context, id uuid.UUID, req UpdateMailboxProviderRequest) (*MailboxProvider, error)

	// Sending ESPs
	ListSendingESPs(ctx context.Context, onlyActive bool) ([]SendingESP, error)
	GetSendingESP(ctx context.Context, id uuid.UUID) (*SendingESP, error)
	CreateSendingESP(ctx context.Context, req CreateSendingESPRequest) (*SendingESP, error)
	UpdateSendingESP(ctx context.Context, id uuid.UUID, req UpdateSendingESPRequest) (*SendingESP, error)

	// Sending IP Pools
	ListSendingIPPools(ctx context.Context, onlyActive bool) ([]SendingIPPool, error)
	GetSendingIPPool(ctx context.Context, id uuid.UUID) (*SendingIPPool, error)
	CreateSendingIPPool(ctx context.Context, req CreateSendingIPPoolRequest) (*SendingIPPool, error)
	UpdateSendingIPPool(ctx context.Context, id uuid.UUID, req UpdateSendingIPPoolRequest) (*SendingIPPool, error)

	// Countries & Verticals
	ListCountries(ctx context.Context, onlyActive bool) ([]Country, error)
	CreateCountry(ctx context.Context, req CreateCountryRequest) (*Country, error)
	ToggleCountry(ctx context.Context, id uuid.UUID, active bool) error

	ListVerticals(ctx context.Context, onlyActive bool) ([]Vertical, error)
	CreateVertical(ctx context.Context, req CreateVerticalRequest) (*Vertical, error)
	ToggleVertical(ctx context.Context, id uuid.UUID, active bool) error

	// Mail Lists
	ListMailLists(ctx context.Context, filter ListFilter) ([]MailList, int64, error)
	GetMailList(ctx context.Context, id uuid.UUID) (*MailList, error)
	CreateMailList(ctx context.Context, req CreateMailListRequest) (*MailList, error)
	UpdateMailList(ctx context.Context, id uuid.UUID, req UpdateMailListRequest) (*MailList, error)
	SetMailListStatus(ctx context.Context, id uuid.UUID, status string) error
	GetMailListMetrics(ctx context.Context, id uuid.UUID) (*MailListMetrics, error)
	GetGlobalSummary(ctx context.Context) (*GlobalListSummary, error)

	// Contacts
	ListContacts(ctx context.Context, filter ContactFilter) ([]Contact, int64, error)
	GetContact(ctx context.Context, id uuid.UUID) (*Contact, error)
	CreateContact(ctx context.Context, req CreateContactRequest) (*Contact, error)
	UpdateContact(ctx context.Context, id uuid.UUID, req UpdateContactRequest) (*Contact, error)
	DeleteContact(ctx context.Context, id uuid.UUID) error

	// Suppressions
	ListSuppressions(ctx context.Context, filter SuppressionFilter) ([]Suppression, int64, error)
	CreateSuppression(ctx context.Context, req CreateSuppressionRequest) (*Suppression, error)
	BulkCreateSuppressions(ctx context.Context, req BulkSuppressionRequest) (int, error)
	DeleteSuppression(ctx context.Context, id uuid.UUID) error

	// Import Jobs
	ListImportJobs(ctx context.Context, filter ImportJobFilter) ([]ImportJob, int64, error)
	GetImportJob(ctx context.Context, id uuid.UUID) (*ImportJob, error)
	CreateImportJob(ctx context.Context, job *ImportJob) error
	UpdateImportJobStatus(ctx context.Context, jobID uuid.UUID, status string) error
	CancelImportJob(ctx context.Context, id uuid.UUID) error
	GetClaimableImportJob(ctx context.Context) (*ImportJob, error)
	SaveImportJobResults(ctx context.Context, job *ImportJob) error

	// Data Quality & Events
	GetDataQualityReport(ctx context.Context, listID *uuid.UUID) (*DataQualityReport, error)
	ListEvents(ctx context.Context, filter EventFilter) ([]ContactEvent, int64, error)
	RecordEvent(ctx context.Context, event ContactEvent) error

	// Settings
	GetDataSettings(ctx context.Context) (map[string]any, error)
	UpdateDataSettings(ctx context.Context, key string, val any) error
}

// PostgresListService implements the Service interface using PostgreSQL.
type PostgresListService struct {
	db *pgxpool.Pool
}

// NewPostgresListService creates a new PostgresListService instance.
func NewPostgresListService(db *pgxpool.Pool) *PostgresListService {
	return &PostgresListService{db: db}
}

// -----------------------------------------------------------------------------
// Utilities & Validation
// -----------------------------------------------------------------------------

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

func NormalizeEmail(raw string) string {
	raw = strings.TrimSpace(raw)
	return strings.ToLower(raw)
}

func HashEmailMD5(normEmail string) string {
	h := md5.Sum([]byte(normEmail))
	return hex.EncodeToString(h[:])
}

func ValidateEmail(email string) bool {
	if len(email) < 3 || len(email) > 254 {
		return false
	}
	if !emailRegex.MatchString(email) {
		return false
	}
	_, err := mail.ParseAddress(email)
	return err == nil
}

// -----------------------------------------------------------------------------
// Mailbox Providers
// -----------------------------------------------------------------------------

func (s *PostgresListService) ListMailboxProviders(ctx context.Context, onlyActive bool) ([]MailboxProvider, error) {
	query := `
		SELECT 
			p.id, p.name, p.code, p.domains, p.is_active, COALESCE(p.description, ''),
			(SELECT COUNT(*) FROM mail_lists l WHERE l.mailbox_provider_id = p.id) AS list_count,
			p.created_at, p.updated_at
		FROM mailbox_providers p
		WHERE ($1 = false OR p.is_active = true)
		ORDER BY p.name ASC
	`
	rows, err := s.db.Query(ctx, query, onlyActive)
	if err != nil {
		return nil, fmt.Errorf("failed to query mailbox providers: %w", err)
	}
	defer rows.Close()

	var providers []MailboxProvider
	for rows.Next() {
		var p MailboxProvider
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Code, &p.Domains, &p.IsActive, &p.Description,
			&p.ListCount, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan mailbox provider: %w", err)
		}
		providers = append(providers, p)
	}
	return providers, nil
}

func (s *PostgresListService) GetMailboxProvider(ctx context.Context, id uuid.UUID) (*MailboxProvider, error) {
	query := `
		SELECT 
			p.id, p.name, p.code, p.domains, p.is_active, COALESCE(p.description, ''),
			(SELECT COUNT(*) FROM mail_lists l WHERE l.mailbox_provider_id = p.id) AS list_count,
			p.created_at, p.updated_at
		FROM mailbox_providers p
		WHERE p.id = $1
	`
	var p MailboxProvider
	err := s.db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.Name, &p.Code, &p.Domains, &p.IsActive, &p.Description,
		&p.ListCount, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get mailbox provider: %w", err)
	}
	return &p, nil
}

func (s *PostgresListService) CreateMailboxProvider(ctx context.Context, req CreateMailboxProviderRequest) (*MailboxProvider, error) {
	name := strings.TrimSpace(req.Name)
	code := strings.ToLower(strings.TrimSpace(req.Code))
	if name == "" || code == "" {
		return nil, fmt.Errorf("%w: name and code cannot be empty", ErrValidationFail)
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	domains := req.Domains
	if domains == nil {
		domains = []string{}
	}

	query := `
		INSERT INTO mailbox_providers (name, code, domains, is_active, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		RETURNING id, name, code, domains, is_active, COALESCE(description, ''), 0, created_at, updated_at
	`
	var p MailboxProvider
	err := s.db.QueryRow(ctx, query, name, code, domains, isActive, req.Description).Scan(
		&p.ID, &p.Name, &p.Code, &p.Domains, &p.IsActive, &p.Description,
		&p.ListCount, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			return nil, fmt.Errorf("%w: provider with code '%s' already exists", ErrConflict, code)
		}
		return nil, fmt.Errorf("failed to insert mailbox provider: %w", err)
	}
	return &p, nil
}

func (s *PostgresListService) UpdateMailboxProvider(ctx context.Context, id uuid.UUID, req UpdateMailboxProviderRequest) (*MailboxProvider, error) {
	existing, err := s.GetMailboxProvider(ctx, id)
	if err != nil {
		return nil, err
	}

	name := existing.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}
	domains := existing.Domains
	if req.Domains != nil {
		domains = *req.Domains
	}
	desc := existing.Description
	if req.Description != nil {
		desc = *req.Description
	}
	isActive := existing.IsActive
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	query := `
		UPDATE mailbox_providers 
		SET name = $1, domains = $2, description = $3, is_active = $4, updated_at = NOW()
		WHERE id = $5
		RETURNING id, name, code, domains, is_active, COALESCE(description, ''),
		          (SELECT COUNT(*) FROM mail_lists l WHERE l.mailbox_provider_id = mailbox_providers.id),
		          created_at, updated_at
	`
	var p MailboxProvider
	err = s.db.QueryRow(ctx, query, name, domains, desc, isActive, id).Scan(
		&p.ID, &p.Name, &p.Code, &p.Domains, &p.IsActive, &p.Description,
		&p.ListCount, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update mailbox provider: %w", err)
	}
	return &p, nil
}

// -----------------------------------------------------------------------------
// Sending ESPs
// -----------------------------------------------------------------------------

func (s *PostgresListService) ListSendingESPs(ctx context.Context, onlyActive bool) ([]SendingESP, error) {
	query := `
		SELECT id, name, code, api_type, is_active, COALESCE(notes, ''), created_at, updated_at
		FROM sending_esps
		WHERE ($1 = false OR is_active = true)
		ORDER BY name ASC
	`
	rows, err := s.db.Query(ctx, query, onlyActive)
	if err != nil {
		return nil, fmt.Errorf("failed to list sending ESPs: %w", err)
	}
	defer rows.Close()

	var esps []SendingESP
	for rows.Next() {
		var e SendingESP
		if err := rows.Scan(&e.ID, &e.Name, &e.Code, &e.APIType, &e.IsActive, &e.Notes, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		esps = append(esps, e)
	}
	return esps, nil
}

func (s *PostgresListService) GetSendingESP(ctx context.Context, id uuid.UUID) (*SendingESP, error) {
	query := `
		SELECT id, name, code, api_type, is_active, COALESCE(notes, ''), created_at, updated_at
		FROM sending_esps
		WHERE id = $1
	`
	var e SendingESP
	err := s.db.QueryRow(ctx, query, id).Scan(&e.ID, &e.Name, &e.Code, &e.APIType, &e.IsActive, &e.Notes, &e.CreatedAt, &e.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *PostgresListService) CreateSendingESP(ctx context.Context, req CreateSendingESPRequest) (*SendingESP, error) {
	name := strings.TrimSpace(req.Name)
	code := strings.ToLower(strings.TrimSpace(req.Code))
	apiType := strings.ToLower(strings.TrimSpace(req.APIType))
	if name == "" || code == "" {
		return nil, fmt.Errorf("%w: name and code cannot be empty", ErrValidationFail)
	}
	if apiType == "" {
		apiType = "smtp"
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	query := `
		INSERT INTO sending_esps (name, code, api_type, is_active, notes, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		RETURNING id, name, code, api_type, is_active, COALESCE(notes, ''), created_at, updated_at
	`
	var e SendingESP
	err := s.db.QueryRow(ctx, query, name, code, apiType, isActive, req.Notes).Scan(
		&e.ID, &e.Name, &e.Code, &e.APIType, &e.IsActive, &e.Notes, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("%w: sending ESP with code or name already exists", ErrConflict)
		}
		return nil, err
	}
	return &e, nil
}

func (s *PostgresListService) UpdateSendingESP(ctx context.Context, id uuid.UUID, req UpdateSendingESPRequest) (*SendingESP, error) {
	existing, err := s.GetSendingESP(ctx, id)
	if err != nil {
		return nil, err
	}

	name := existing.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}
	apiType := existing.APIType
	if req.APIType != nil && strings.TrimSpace(*req.APIType) != "" {
		apiType = strings.TrimSpace(*req.APIType)
	}
	notes := existing.Notes
	if req.Notes != nil {
		notes = *req.Notes
	}
	isActive := existing.IsActive
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	query := `
		UPDATE sending_esps
		SET name = $1, api_type = $2, notes = $3, is_active = $4, updated_at = NOW()
		WHERE id = $5
		RETURNING id, name, code, api_type, is_active, COALESCE(notes, ''), created_at, updated_at
	`
	var e SendingESP
	err = s.db.QueryRow(ctx, query, name, apiType, notes, isActive, id).Scan(
		&e.ID, &e.Name, &e.Code, &e.APIType, &e.IsActive, &e.Notes, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// -----------------------------------------------------------------------------
// Sending IP Pools
// -----------------------------------------------------------------------------

func (s *PostgresListService) ListSendingIPPools(ctx context.Context, onlyActive bool) ([]SendingIPPool, error) {
	query := `
		SELECT 
			p.id, p.name, p.code, COALESCE(p.description, ''), p.server_id,
			COALESCE(s.name, ''), p.is_active,
			(SELECT COUNT(*) FROM sending_ip_pool_members m WHERE m.pool_id = p.id) AS member_count,
			p.created_at, p.updated_at
		FROM sending_ip_pools p
		LEFT JOIN servers s ON s.id = p.server_id
		WHERE ($1 = false OR p.is_active = true)
		ORDER BY p.name ASC
	`
	rows, err := s.db.Query(ctx, query, onlyActive)
	if err != nil {
		return nil, fmt.Errorf("failed to list sending IP pools: %w", err)
	}
	defer rows.Close()

	var pools []SendingIPPool
	for rows.Next() {
		var p SendingIPPool
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Code, &p.Description, &p.ServerID,
			&p.ServerName, &p.IsActive, &p.MemberCount, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		pools = append(pools, p)
	}
	return pools, nil
}

func (s *PostgresListService) GetSendingIPPool(ctx context.Context, id uuid.UUID) (*SendingIPPool, error) {
	query := `
		SELECT 
			p.id, p.name, p.code, COALESCE(p.description, ''), p.server_id,
			COALESCE(s.name, ''), p.is_active,
			(SELECT COUNT(*) FROM sending_ip_pool_members m WHERE m.pool_id = p.id) AS member_count,
			p.created_at, p.updated_at
		FROM sending_ip_pools p
		LEFT JOIN servers s ON s.id = p.server_id
		WHERE p.id = $1
	`
	var p SendingIPPool
	err := s.db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.Name, &p.Code, &p.Description, &p.ServerID,
		&p.ServerName, &p.IsActive, &p.MemberCount, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	// Fetch members
	memQuery := `
		SELECT id, pool_id, ip_address, server_ip_id, COALESCE(vmta_name, ''), weight, is_active, created_at
		FROM sending_ip_pool_members
		WHERE pool_id = $1
		ORDER BY ip_address ASC
	`
	mRows, err := s.db.Query(ctx, memQuery, id)
	if err == nil {
		defer mRows.Close()
		for mRows.Next() {
			var m SendingIPPoolMember
			if err := mRows.Scan(&m.ID, &m.PoolID, &m.IPAddress, &m.ServerIPID, &m.VMTAName, &m.Weight, &m.IsActive, &m.CreatedAt); err == nil {
				p.Members = append(p.Members, m)
			}
		}
	}

	return &p, nil
}

func (s *PostgresListService) CreateSendingIPPool(ctx context.Context, req CreateSendingIPPoolRequest) (*SendingIPPool, error) {
	name := strings.TrimSpace(req.Name)
	code := strings.ToLower(strings.TrimSpace(req.Code))
	if name == "" || code == "" {
		return nil, fmt.Errorf("%w: name and code cannot be empty", ErrValidationFail)
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var p SendingIPPool
	err = tx.QueryRow(ctx, `
		INSERT INTO sending_ip_pools (name, code, description, server_id, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		RETURNING id, name, code, COALESCE(description, ''), server_id, '', is_active, 0, created_at, updated_at
	`, name, code, req.Description, req.ServerID, isActive).Scan(
		&p.ID, &p.Name, &p.Code, &p.Description, &p.ServerID, &p.ServerName, &p.IsActive, &p.MemberCount, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("%w: pool with code or name already exists", ErrConflict)
		}
		return nil, err
	}

	// Insert members if provided
	for _, m := range req.Members {
		ip := strings.TrimSpace(m.IPAddress)
		if ip == "" {
			continue
		}
		weight := m.Weight
		if weight <= 0 {
			weight = 100
		}
		_, insErr := tx.Exec(ctx, `
			INSERT INTO sending_ip_pool_members (pool_id, ip_address, server_ip_id, vmta_name, weight, is_active, created_at)
			VALUES ($1, $2, $3, $4, $5, true, NOW())
			ON CONFLICT (pool_id, ip_address) DO NOTHING
		`, p.ID, ip, m.ServerIPID, m.VMTAName, weight)
		if insErr != nil {
			return nil, fmt.Errorf("failed to add pool member %s: %w", ip, insErr)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetSendingIPPool(ctx, p.ID)
}

func (s *PostgresListService) UpdateSendingIPPool(ctx context.Context, id uuid.UUID, req UpdateSendingIPPoolRequest) (*SendingIPPool, error) {
	existing, err := s.GetSendingIPPool(ctx, id)
	if err != nil {
		return nil, err
	}

	name := existing.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}
	desc := existing.Description
	if req.Description != nil {
		desc = *req.Description
	}
	serverID := existing.ServerID
	if req.ServerID != nil {
		serverID = req.ServerID
	}
	isActive := existing.IsActive
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	_, err = s.db.Exec(ctx, `
		UPDATE sending_ip_pools
		SET name = $1, description = $2, server_id = $3, is_active = $4, updated_at = NOW()
		WHERE id = $5
	`, name, desc, serverID, isActive, id)
	if err != nil {
		return nil, err
	}
	return s.GetSendingIPPool(ctx, id)
}

// -----------------------------------------------------------------------------
// Countries & Verticals
// -----------------------------------------------------------------------------

func (s *PostgresListService) ListCountries(ctx context.Context, onlyActive bool) ([]Country, error) {
	query := `
		SELECT 
			c.id, c.code, c.name, c.is_active,
			(SELECT COUNT(*) FROM mail_lists l WHERE l.country_id = c.id) AS list_count,
			c.created_at, c.updated_at
		FROM countries c
		WHERE ($1 = false OR c.is_active = true)
		ORDER BY c.name ASC
	`
	rows, err := s.db.Query(ctx, query, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var countries []Country
	for rows.Next() {
		var c Country
		if err := rows.Scan(&c.ID, &c.Code, &c.Name, &c.IsActive, &c.ListCount, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		countries = append(countries, c)
	}
	return countries, nil
}

func (s *PostgresListService) CreateCountry(ctx context.Context, req CreateCountryRequest) (*Country, error) {
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	name := strings.TrimSpace(req.Name)
	if len(code) != 2 || name == "" {
		return nil, fmt.Errorf("%w: country code must be 2 uppercase characters", ErrValidationFail)
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	query := `
		INSERT INTO countries (code, name, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING id, code, name, is_active, 0, created_at, updated_at
	`
	var c Country
	err := s.db.QueryRow(ctx, query, code, name, isActive).Scan(
		&c.ID, &c.Code, &c.Name, &c.IsActive, &c.ListCount, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("%w: country with code '%s' already exists", ErrConflict, code)
		}
		return nil, err
	}
	return &c, nil
}

func (s *PostgresListService) ToggleCountry(ctx context.Context, id uuid.UUID, active bool) error {
	_, err := s.db.Exec(ctx, "UPDATE countries SET is_active = $1, updated_at = NOW() WHERE id = $2", active, id)
	return err
}

func (s *PostgresListService) ListVerticals(ctx context.Context, onlyActive bool) ([]Vertical, error) {
	query := `
		SELECT 
			v.id, v.name, v.code, COALESCE(v.description, ''), v.is_active,
			(SELECT COUNT(*) FROM mail_lists l WHERE l.vertical_id = v.id) AS list_count,
			v.created_at, v.updated_at
		FROM verticals v
		WHERE ($1 = false OR v.is_active = true)
		ORDER BY v.name ASC
	`
	rows, err := s.db.Query(ctx, query, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var verticals []Vertical
	for rows.Next() {
		var v Vertical
		if err := rows.Scan(&v.ID, &v.Name, &v.Code, &v.Description, &v.IsActive, &v.ListCount, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		verticals = append(verticals, v)
	}
	return verticals, nil
}

func (s *PostgresListService) CreateVertical(ctx context.Context, req CreateVerticalRequest) (*Vertical, error) {
	name := strings.TrimSpace(req.Name)
	code := strings.ToLower(strings.TrimSpace(req.Code))
	if name == "" || code == "" {
		return nil, fmt.Errorf("%w: name and code cannot be empty", ErrValidationFail)
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	query := `
		INSERT INTO verticals (name, code, description, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		RETURNING id, name, code, COALESCE(description, ''), is_active, 0, created_at, updated_at
	`
	var v Vertical
	err := s.db.QueryRow(ctx, query, name, code, req.Description, isActive).Scan(
		&v.ID, &v.Name, &v.Code, &v.Description, &v.IsActive, &v.ListCount, &v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("%w: vertical with code '%s' already exists", ErrConflict, code)
		}
		return nil, err
	}
	return &v, nil
}

func (s *PostgresListService) ToggleVertical(ctx context.Context, id uuid.UUID, active bool) error {
	_, err := s.db.Exec(ctx, "UPDATE verticals SET is_active = $1, updated_at = NOW() WHERE id = $2", active, id)
	return err
}

// -----------------------------------------------------------------------------
// Mail Lists
// -----------------------------------------------------------------------------

func (s *PostgresListService) ListMailLists(ctx context.Context, filter ListFilter) ([]MailList, int64, error) {
	baseWhere := "WHERE 1=1"
	args := []any{}
	argIdx := 1

	if filter.Search != "" {
		baseWhere += fmt.Sprintf(" AND (l.name ILIKE $%d OR l.code ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+strings.TrimSpace(filter.Search)+"%")
		argIdx++
	}
	if filter.ProviderID != nil {
		baseWhere += fmt.Sprintf(" AND l.mailbox_provider_id = $%d", argIdx)
		args = append(args, *filter.ProviderID)
		argIdx++
	}
	if filter.CountryID != nil {
		baseWhere += fmt.Sprintf(" AND l.country_id = $%d", argIdx)
		args = append(args, *filter.CountryID)
		argIdx++
	}
	if filter.VerticalID != nil {
		baseWhere += fmt.Sprintf(" AND l.vertical_id = $%d", argIdx)
		args = append(args, *filter.VerticalID)
		argIdx++
	}
	if filter.Status != "" && filter.Status != "all" {
		baseWhere += fmt.Sprintf(" AND l.status = $%d", argIdx)
		args = append(args, filter.Status)
		argIdx++
	}
	if filter.MinContacts != nil {
		baseWhere += fmt.Sprintf(" AND l.contact_count >= $%d", argIdx)
		args = append(args, *filter.MinContacts)
		argIdx++
	}
	if filter.MaxContacts != nil {
		baseWhere += fmt.Sprintf(" AND l.contact_count <= $%d", argIdx)
		args = append(args, *filter.MaxContacts)
		argIdx++
	}

	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM mail_lists l
		%s
	`, baseWhere)
	var total int64
	if err := s.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count mail lists: %w", err)
	}

	// Pagination & Sorting
	limit := filter.PageSize
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	offset := (filter.Page - 1) * limit
	if offset < 0 {
		offset = 0
	}

	orderBy := "l.created_at DESC"
	switch filter.SortBy {
	case "name":
		orderBy = "l.name " + strings.ToUpper(filter.SortOrder)
	case "contact_count":
		orderBy = "l.contact_count " + strings.ToUpper(filter.SortOrder)
	case "last_imported_at":
		orderBy = "l.last_imported_at " + strings.ToUpper(filter.SortOrder)
	case "status":
		orderBy = "l.status " + strings.ToUpper(filter.SortOrder)
	}

	query := fmt.Sprintf(`
		SELECT 
			l.id, l.name, l.code,
			l.mailbox_provider_id, p.name, p.code,
			l.country_id, c.code, c.name,
			l.vertical_id, v.code, v.name,
			COALESCE(l.description, ''), l.status, l.contact_count,
			l.last_imported_at, l.created_at, l.updated_at
		FROM mail_lists l
		JOIN mailbox_providers p ON p.id = l.mailbox_provider_id
		JOIN countries c ON c.id = l.country_id
		JOIN verticals v ON v.id = l.vertical_id
		%s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, baseWhere, orderBy, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query mail lists: %w", err)
	}
	defer rows.Close()

	var lists []MailList
	for rows.Next() {
		var l MailList
		if err := rows.Scan(
			&l.ID, &l.Name, &l.Code,
			&l.MailboxProviderID, &l.MailboxProviderName, &l.MailboxProviderCode,
			&l.CountryID, &l.CountryCode, &l.CountryName,
			&l.VerticalID, &l.VerticalCode, &l.VerticalName,
			&l.Description, &l.Status, &l.ContactCount,
			&l.LastImportedAt, &l.CreatedAt, &l.UpdatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan mail list: %w", err)
		}
		lists = append(lists, l)
	}
	return lists, total, nil
}

func (s *PostgresListService) GetMailList(ctx context.Context, id uuid.UUID) (*MailList, error) {
	query := `
		SELECT 
			l.id, l.name, l.code,
			l.mailbox_provider_id, p.name, p.code,
			l.country_id, c.code, c.name,
			l.vertical_id, v.code, v.name,
			COALESCE(l.description, ''), l.status, l.contact_count,
			l.last_imported_at, l.created_at, l.updated_at
		FROM mail_lists l
		JOIN mailbox_providers p ON p.id = l.mailbox_provider_id
		JOIN countries c ON c.id = l.country_id
		JOIN verticals v ON v.id = l.vertical_id
		WHERE l.id = $1
	`
	var l MailList
	err := s.db.QueryRow(ctx, query, id).Scan(
		&l.ID, &l.Name, &l.Code,
		&l.MailboxProviderID, &l.MailboxProviderName, &l.MailboxProviderCode,
		&l.CountryID, &l.CountryCode, &l.CountryName,
		&l.VerticalID, &l.VerticalCode, &l.VerticalName,
		&l.Description, &l.Status, &l.ContactCount,
		&l.LastImportedAt, &l.CreatedAt, &l.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get mail list: %w", err)
	}
	return &l, nil
}

func (s *PostgresListService) CreateMailList(ctx context.Context, req CreateMailListRequest) (*MailList, error) {
	name := strings.TrimSpace(req.Name)
	code := strings.ToLower(strings.TrimSpace(req.Code))
	if name == "" || code == "" {
		return nil, fmt.Errorf("%w: list name and code cannot be empty", ErrValidationFail)
	}
	if req.MailboxProviderID == uuid.Nil || req.CountryID == uuid.Nil || req.VerticalID == uuid.Nil {
		return nil, fmt.Errorf("%w: mailbox provider, country, and vertical must be selected", ErrValidationFail)
	}

	query := `
		INSERT INTO mail_lists (name, code, mailbox_provider_id, country_id, vertical_id, description, status, contact_count, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'active', 0, NOW(), NOW())
		RETURNING id
	`
	var newID uuid.UUID
	err := s.db.QueryRow(ctx, query, name, code, req.MailboxProviderID, req.CountryID, req.VerticalID, req.Description).Scan(&newID)
	if err != nil {
		if strings.Contains(err.Error(), "mail_lists_code_key") || strings.Contains(err.Error(), "uq_mail_lists") {
			return nil, fmt.Errorf("%w: a list with this code or provider/country/vertical/name already exists", ErrConflict)
		}
		return nil, fmt.Errorf("failed to insert mail list: %w", err)
	}
	return s.GetMailList(ctx, newID)
}

func (s *PostgresListService) UpdateMailList(ctx context.Context, id uuid.UUID, req UpdateMailListRequest) (*MailList, error) {
	existing, err := s.GetMailList(ctx, id)
	if err != nil {
		return nil, err
	}

	name := existing.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}
	desc := existing.Description
	if req.Description != nil {
		desc = *req.Description
	}
	status := existing.Status
	if req.Status != nil && (*req.Status == "active" || *req.Status == "paused" || *req.Status == "archived") {
		status = *req.Status
	}

	query := `
		UPDATE mail_lists
		SET name = $1, description = $2, status = $3, updated_at = NOW()
		WHERE id = $4
	`
	_, err = s.db.Exec(ctx, query, name, desc, status, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update mail list: %w", err)
	}
	return s.GetMailList(ctx, id)
}

func (s *PostgresListService) SetMailListStatus(ctx context.Context, id uuid.UUID, status string) error {
	if status != "active" && status != "paused" && status != "archived" {
		return fmt.Errorf("%w: invalid list status '%s'", ErrValidationFail, status)
	}
	_, err := s.db.Exec(ctx, "UPDATE mail_lists SET status = $1, updated_at = NOW() WHERE id = $2", status, id)
	return err
}

func (s *PostgresListService) GetMailListMetrics(ctx context.Context, id uuid.UUID) (*MailListMetrics, error) {
	m := &MailListMetrics{ListID: id}

	// Fetch timestamps and count from list metadata
	err := s.db.QueryRow(ctx, "SELECT contact_count, last_imported_at, updated_at FROM mail_lists WHERE id = $1", id).Scan(
		&m.TotalContacts, &m.LastImportedAt, &m.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	// Single high-efficiency aggregate query over contacts table
	aggQuery := `
		SELECT 
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE is_clean = true AND is_unsub = false AND is_optout = false AND is_blacklisted = false AND is_hard_bounced = false) AS eligible,
			COUNT(*) FILTER (WHERE is_unsub = true) AS unsub,
			COUNT(*) FILTER (WHERE is_optout = true) AS optout,
			COUNT(*) FILTER (WHERE is_blacklisted = true) AS blacklisted,
			COUNT(*) FILTER (WHERE is_hard_bounced = true) AS hard_bounced,
			COUNT(*) FILTER (WHERE is_opener = true) AS openers,
			COUNT(*) FILTER (WHERE is_clicker = true) AS clickers,
			COUNT(*) FILTER (WHERE is_fresh = true) AS fresh,
			COUNT(*) FILTER (WHERE is_seed = true) AS seed
		FROM contacts
		WHERE list_id = $1
	`
	err = s.db.QueryRow(ctx, aggQuery, id).Scan(
		&m.TotalContacts,
		&m.EligibleContacts,
		&m.UnsubscribedCount,
		&m.OptoutCount,
		&m.BlacklistedCount,
		&m.HardBouncedCount,
		&m.OpenersCount,
		&m.ClickersCount,
		&m.FreshCount,
		&m.SeedCount,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to aggregate list metrics: %w", err)
	}

	return m, nil
}

func (s *PostgresListService) GetGlobalSummary(ctx context.Context) (*GlobalListSummary, error) {
	var summary GlobalListSummary

	// Aggregate mail_lists stats
	err := s.db.QueryRow(ctx, `
		SELECT 
			COUNT(*),
			COUNT(*) FILTER (WHERE status = 'active'),
			COALESCE(SUM(contact_count), 0)
		FROM mail_lists
	`).Scan(&summary.TotalLists, &summary.ActiveLists, &summary.TotalContacts)
	if err != nil {
		return nil, err
	}

	// Aggregate import_jobs stats
	err = s.db.QueryRow(ctx, `
		SELECT 
			COUNT(*) FILTER (WHERE status IN ('processing', 'queued', 'validating')),
			COUNT(*) FILTER (WHERE status = 'failed')
		FROM import_jobs
	`).Scan(&summary.ImportsInProgress, &summary.FailedImports)
	if err != nil {
		return nil, err
	}

	return &summary, nil
}

// -----------------------------------------------------------------------------
// Contacts
// -----------------------------------------------------------------------------

func (s *PostgresListService) ListContacts(ctx context.Context, filter ContactFilter) ([]Contact, int64, error) {
	baseWhere := "WHERE 1=1"
	args := []any{}
	argIdx := 1

	if filter.ListID != nil {
		baseWhere += fmt.Sprintf(" AND c.list_id = $%d", argIdx)
		args = append(args, *filter.ListID)
		argIdx++
	}
	if filter.Search != "" {
		baseWhere += fmt.Sprintf(" AND (c.email ILIKE $%d OR c.first_name ILIKE $%d OR c.last_name ILIKE $%d)", argIdx, argIdx, argIdx)
		args = append(args, "%"+strings.TrimSpace(filter.Search)+"%")
		argIdx++
	}
	if filter.IsClean != nil {
		baseWhere += fmt.Sprintf(" AND c.is_clean = $%d", argIdx)
		args = append(args, *filter.IsClean)
		argIdx++
	}
	if filter.IsOpener != nil {
		baseWhere += fmt.Sprintf(" AND c.is_opener = $%d", argIdx)
		args = append(args, *filter.IsOpener)
		argIdx++
	}
	if filter.IsClicker != nil {
		baseWhere += fmt.Sprintf(" AND c.is_clicker = $%d", argIdx)
		args = append(args, *filter.IsClicker)
		argIdx++
	}
	if filter.IsUnsub != nil {
		baseWhere += fmt.Sprintf(" AND c.is_unsub = $%d", argIdx)
		args = append(args, *filter.IsUnsub)
		argIdx++
	}
	if filter.IsOptout != nil {
		baseWhere += fmt.Sprintf(" AND c.is_optout = $%d", argIdx)
		args = append(args, *filter.IsOptout)
		argIdx++
	}
	if filter.IsBlacklisted != nil {
		baseWhere += fmt.Sprintf(" AND c.is_blacklisted = $%d", argIdx)
		args = append(args, *filter.IsBlacklisted)
		argIdx++
	}
	if filter.IsHardBounced != nil {
		baseWhere += fmt.Sprintf(" AND c.is_hard_bounced = $%d", argIdx)
		args = append(args, *filter.IsHardBounced)
		argIdx++
	}
	if filter.CountryCode != "" {
		baseWhere += fmt.Sprintf(" AND c.country_code = $%d", argIdx)
		args = append(args, strings.ToUpper(filter.CountryCode))
		argIdx++
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM contacts c %s", baseWhere)
	var total int64
	if err := s.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := filter.PageSize
	if limit <= 0 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}
	offset := (filter.Page - 1) * limit
	if offset < 0 {
		offset = 0
	}

	query := fmt.Sprintf(`
		SELECT 
			c.id, c.list_id, c.email, c.email_md5,
			COALESCE(c.first_name, ''), COALESCE(c.last_name, ''), c.verticals,
			c.is_seed, c.is_fresh, c.is_clean, c.is_opener, c.is_clicker, c.is_leader,
			c.is_unsub, c.is_optout, c.is_blacklisted, c.is_hard_bounced,
			c.last_action_time, COALESCE(c.last_action_type, ''),
			COALESCE(c.agent, ''), COALESCE(host(c.ip), ''), COALESCE(c.country_code, ''),
			COALESCE(c.country, ''), COALESCE(c.region, ''), COALESCE(c.city, ''),
			COALESCE(c.language, ''), COALESCE(c.device_type, ''), COALESCE(c.device_name, ''),
			COALESCE(c.os, ''), COALESCE(c.browser_name, ''), COALESCE(c.browser_version, ''),
			c.created_at, c.updated_at
		FROM contacts c
		%s
		ORDER BY c.created_at DESC
		LIMIT $%d OFFSET $%d
	`, baseWhere, argIdx, argIdx+1)

	args = append(args, limit, offset)
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var contacts []Contact
	for rows.Next() {
		var c Contact
		if err := rows.Scan(
			&c.ID, &c.ListID, &c.Email, &c.EmailMD5,
			&c.FirstName, &c.LastName, &c.Verticals,
			&c.IsSeed, &c.IsFresh, &c.IsClean, &c.IsOpener, &c.IsClicker, &c.IsLeader,
			&c.IsUnsub, &c.IsOptout, &c.IsBlacklisted, &c.IsHardBounced,
			&c.LastActionTime, &c.LastActionType,
			&c.Agent, &c.IP, &c.CountryCode,
			&c.Country, &c.Region, &c.City,
			&c.Language, &c.DeviceType, &c.DeviceName,
			&c.OS, &c.BrowserName, &c.BrowserVersion,
			&c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		contacts = append(contacts, c)
	}
	return contacts, total, nil
}

func (s *PostgresListService) GetContact(ctx context.Context, id uuid.UUID) (*Contact, error) {
	query := `
		SELECT 
			c.id, c.list_id, c.email, c.email_md5,
			COALESCE(c.first_name, ''), COALESCE(c.last_name, ''), c.verticals,
			c.is_seed, c.is_fresh, c.is_clean, c.is_opener, c.is_clicker, c.is_leader,
			c.is_unsub, c.is_optout, c.is_blacklisted, c.is_hard_bounced,
			c.last_action_time, COALESCE(c.last_action_type, ''),
			COALESCE(c.agent, ''), COALESCE(host(c.ip), ''), COALESCE(c.country_code, ''),
			COALESCE(c.country, ''), COALESCE(c.region, ''), COALESCE(c.city, ''),
			COALESCE(c.language, ''), COALESCE(c.device_type, ''), COALESCE(c.device_name, ''),
			COALESCE(c.os, ''), COALESCE(c.browser_name, ''), COALESCE(c.browser_version, ''),
			c.created_at, c.updated_at
		FROM contacts c
		WHERE c.id = $1
	`
	var c Contact
	err := s.db.QueryRow(ctx, query, id).Scan(
		&c.ID, &c.ListID, &c.Email, &c.EmailMD5,
		&c.FirstName, &c.LastName, &c.Verticals,
		&c.IsSeed, &c.IsFresh, &c.IsClean, &c.IsOpener, &c.IsClicker, &c.IsLeader,
		&c.IsUnsub, &c.IsOptout, &c.IsBlacklisted, &c.IsHardBounced,
		&c.LastActionTime, &c.LastActionType,
		&c.Agent, &c.IP, &c.CountryCode,
		&c.Country, &c.Region, &c.City,
		&c.Language, &c.DeviceType, &c.DeviceName,
		&c.OS, &c.BrowserName, &c.BrowserVersion,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *PostgresListService) CreateContact(ctx context.Context, req CreateContactRequest) (*Contact, error) {
	normEmail := NormalizeEmail(req.Email)
	if !ValidateEmail(normEmail) {
		return nil, fmt.Errorf("%w: invalid email address", ErrValidationFail)
	}
	emailMD5 := HashEmailMD5(normEmail)

	localPart := ExtractLocalPart(normEmail)
	firstName := strings.TrimSpace(req.FirstName)
	if firstName == "" {
		firstName = localPart
	}
	lastName := strings.TrimSpace(req.LastName)
	if lastName == "" {
		lastName = localPart
	}

	nullIfEmpty := func(val string) *string {
		trimmed := strings.TrimSpace(val)
		if trimmed == "" {
			return nil
		}
		return &trimmed
	}

	var ipAddr *string
	if req.IP != "" {
		parsedIP := net.ParseIP(strings.TrimSpace(req.IP))
		if parsedIP != nil {
			str := parsedIP.String()
			ipAddr = &str
		}
	}

	query := `
		INSERT INTO contacts (
			list_id, email, email_md5, first_name, last_name, verticals,
			is_seed, is_fresh, is_clean, is_opener, is_clicker,
			ip, country_code, country, region, city, language,
			device_type, device_name, os, browser_name, browser_version,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10, $11,
			$12, $13, $14, $15, $16, $17,
			$18, $19, $20, $21, $22,
			NOW(), NOW()
		)
		RETURNING id
	`
	var newID uuid.UUID
	err := s.db.QueryRow(ctx, query,
		req.ListID, normEmail, emailMD5, firstName, lastName, req.Verticals,
		req.IsSeed, req.IsFresh, req.IsClean, req.IsOpener, req.IsClicker,
		ipAddr, nullIfEmpty(req.CountryCode), nullIfEmpty(req.Country), nullIfEmpty(req.Region), nullIfEmpty(req.City), nullIfEmpty(req.Language),
		nullIfEmpty(req.DeviceType), nullIfEmpty(req.DeviceName), nullIfEmpty(req.OS), nullIfEmpty(req.BrowserName), nullIfEmpty(req.BrowserVersion),
	).Scan(&newID)

	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("%w: contact with email '%s' already exists in this list", ErrConflict, normEmail)
		}
		return nil, err
	}

	// Update list count
	_, _ = s.db.Exec(ctx, "UPDATE mail_lists SET contact_count = (SELECT COUNT(*) FROM contacts WHERE list_id = $1), updated_at = NOW() WHERE id = $1", req.ListID)

	return s.GetContact(ctx, newID)
}

func (s *PostgresListService) UpdateContact(ctx context.Context, id uuid.UUID, req UpdateContactRequest) (*Contact, error) {
	c, err := s.GetContact(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.FirstName != nil {
		c.FirstName = *req.FirstName
	}
	if req.LastName != nil {
		c.LastName = *req.LastName
	}
	if req.Verticals != nil {
		c.Verticals = *req.Verticals
	}
	if req.IsSeed != nil {
		c.IsSeed = *req.IsSeed
	}
	if req.IsFresh != nil {
		c.IsFresh = *req.IsFresh
	}
	if req.IsClean != nil {
		c.IsClean = *req.IsClean
	}
	if req.IsOpener != nil {
		c.IsOpener = *req.IsOpener
	}
	if req.IsClicker != nil {
		c.IsClicker = *req.IsClicker
	}
	if req.IsUnsub != nil {
		c.IsUnsub = *req.IsUnsub
	}
	if req.IsOptout != nil {
		c.IsOptout = *req.IsOptout
	}
	if req.IsBlacklisted != nil {
		c.IsBlacklisted = *req.IsBlacklisted
	}
	if req.IsHardBounced != nil {
		c.IsHardBounced = *req.IsHardBounced
	}
	if req.CountryCode != nil {
		c.CountryCode = *req.CountryCode
	}
	if req.Country != nil {
		c.Country = *req.Country
	}
	if req.City != nil {
		c.City = *req.City
	}

	query := `
		UPDATE contacts
		SET first_name = $1, last_name = $2, verticals = $3,
		    is_seed = $4, is_fresh = $5, is_clean = $6, is_opener = $7, is_clicker = $8,
		    is_unsub = $9, is_optout = $10, is_blacklisted = $11, is_hard_bounced = $12,
		    country_code = $13, country = $14, city = $15, updated_at = NOW()
		WHERE id = $16
	`
	_, err = s.db.Exec(ctx, query,
		c.FirstName, c.LastName, c.Verticals,
		c.IsSeed, c.IsFresh, c.IsClean, c.IsOpener, c.IsClicker,
		c.IsUnsub, c.IsOptout, c.IsBlacklisted, c.IsHardBounced,
		c.CountryCode, c.Country, c.City, id,
	)
	if err != nil {
		return nil, err
	}
	return s.GetContact(ctx, id)
}

func (s *PostgresListService) DeleteContact(ctx context.Context, id uuid.UUID) error {
	var listID uuid.UUID
	err := s.db.QueryRow(ctx, "DELETE FROM contacts WHERE id = $1 RETURNING list_id", id).Scan(&listID)
	if err != nil {
		return err
	}
	_, _ = s.db.Exec(ctx, "UPDATE mail_lists SET contact_count = (SELECT COUNT(*) FROM contacts WHERE list_id = $1), updated_at = NOW() WHERE id = $1", listID)
	return nil
}

// -----------------------------------------------------------------------------
// Suppressions
// -----------------------------------------------------------------------------

func (s *PostgresListService) ListSuppressions(ctx context.Context, filter SuppressionFilter) ([]Suppression, int64, error) {
	baseWhere := "WHERE 1=1"
	args := []any{}
	argIdx := 1

	if filter.Search != "" {
		baseWhere += fmt.Sprintf(" AND (s.email ILIKE $%d OR s.details ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+strings.TrimSpace(filter.Search)+"%")
		argIdx++
	}
	if filter.Reason != "" && filter.Reason != "all" {
		baseWhere += fmt.Sprintf(" AND s.reason = $%d", argIdx)
		args = append(args, filter.Reason)
		argIdx++
	}
	if filter.ListID != nil {
		baseWhere += fmt.Sprintf(" AND s.list_id = $%d", argIdx)
		args = append(args, *filter.ListID)
		argIdx++
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM suppressions s %s", baseWhere)
	var total int64
	if err := s.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := filter.PageSize
	if limit <= 0 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}
	offset := (filter.Page - 1) * limit
	if offset < 0 {
		offset = 0
	}

	query := fmt.Sprintf(`
		SELECT 
			s.id, s.email, s.email_md5, s.reason, s.source, COALESCE(s.details, ''),
			s.list_id, COALESCE(l.name, 'Global (All Lists)'), s.created_by, s.created_at
		FROM suppressions s
		LEFT JOIN mail_lists l ON l.id = s.list_id
		%s
		ORDER BY s.created_at DESC
		LIMIT $%d OFFSET $%d
	`, baseWhere, argIdx, argIdx+1)

	args = append(args, limit, offset)
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var list []Suppression
	for rows.Next() {
		var sup Suppression
		if err := rows.Scan(
			&sup.ID, &sup.Email, &sup.EmailMD5, &sup.Reason, &sup.Source, &sup.Details,
			&sup.ListID, &sup.ListName, &sup.CreatedBy, &sup.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		list = append(list, sup)
	}
	return list, total, nil
}

func (s *PostgresListService) CreateSuppression(ctx context.Context, req CreateSuppressionRequest) (*Suppression, error) {
	norm := NormalizeEmail(req.Email)
	if !ValidateEmail(norm) {
		return nil, fmt.Errorf("%w: invalid email address", ErrValidationFail)
	}
	md5Str := HashEmailMD5(norm)
	reason := req.Reason
	if reason == "" {
		reason = "manual"
	}
	source := req.Source
	if source == "" {
		source = "manual"
	}

	query := `
		INSERT INTO suppressions (email, email_md5, reason, source, details, list_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (email, list_id)
		DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, source = EXCLUDED.source
		RETURNING id, email, email_md5, reason, source, COALESCE(details, ''), list_id, '', created_by, created_at
	`
	var sup Suppression
	err := s.db.QueryRow(ctx, query, norm, md5Str, reason, source, req.Details, req.ListID).Scan(
		&sup.ID, &sup.Email, &sup.EmailMD5, &sup.Reason, &sup.Source, &sup.Details,
		&sup.ListID, &sup.ListName, &sup.CreatedBy, &sup.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Also reflect suppression onto existing contacts if present
	if req.ListID != nil {
		_, _ = s.db.Exec(ctx, `
			UPDATE contacts 
			SET is_unsub = (CASE WHEN $2 = 'unsubscribed' THEN true ELSE is_unsub END),
			    is_optout = (CASE WHEN $2 = 'optout' THEN true ELSE is_optout END),
			    is_blacklisted = (CASE WHEN $2 = 'blacklisted' THEN true ELSE is_blacklisted END),
			    is_hard_bounced = (CASE WHEN $2 = 'hard_bounce' THEN true ELSE is_hard_bounced END),
			    is_clean = false,
			    updated_at = NOW()
			WHERE list_id = $1 AND email = $3
		`, *req.ListID, reason, norm)
	} else {
		// Global suppression reflects onto all contacts matching email
		_, _ = s.db.Exec(ctx, `
			UPDATE contacts 
			SET is_unsub = (CASE WHEN $1 = 'unsubscribed' THEN true ELSE is_unsub END),
			    is_optout = (CASE WHEN $1 = 'optout' THEN true ELSE is_optout END),
			    is_blacklisted = (CASE WHEN $1 = 'blacklisted' THEN true ELSE is_blacklisted END),
			    is_hard_bounced = (CASE WHEN $1 = 'hard_bounce' THEN true ELSE is_hard_bounced END),
			    is_clean = false,
			    updated_at = NOW()
			WHERE email = $2
		`, reason, norm)
	}

	return &sup, nil
}

func (s *PostgresListService) BulkCreateSuppressions(ctx context.Context, req BulkSuppressionRequest) (int, error) {
	reason := req.Reason
	if reason == "" {
		reason = "manual"
	}
	source := req.Source
	if source == "" {
		source = "manual"
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	inserted := 0
	for _, raw := range req.Emails {
		norm := NormalizeEmail(raw)
		if !ValidateEmail(norm) {
			continue
		}
		md5Str := HashEmailMD5(norm)

		_, err := tx.Exec(ctx, `
			INSERT INTO suppressions (email, email_md5, reason, source, list_id, created_at)
			VALUES ($1, $2, $3, $4, $5, NOW())
			ON CONFLICT (email, list_id)
			DO NOTHING
		`, norm, md5Str, reason, source, req.ListID)
		if err == nil {
			inserted++
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return inserted, nil
}

func (s *PostgresListService) DeleteSuppression(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.Exec(ctx, "DELETE FROM suppressions WHERE id = $1", id)
	return err
}

// -----------------------------------------------------------------------------
// Import Jobs
// -----------------------------------------------------------------------------

func (s *PostgresListService) ListImportJobs(ctx context.Context, filter ImportJobFilter) ([]ImportJob, int64, error) {
	baseWhere := "WHERE 1=1"
	args := []any{}
	argIdx := 1

	if filter.ListID != nil {
		baseWhere += fmt.Sprintf(" AND j.list_id = $%d", argIdx)
		args = append(args, *filter.ListID)
		argIdx++
	}
	if filter.Status != "" && filter.Status != "all" {
		baseWhere += fmt.Sprintf(" AND j.status = $%d", argIdx)
		args = append(args, filter.Status)
		argIdx++
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM import_jobs j %s", baseWhere)
	var total int64
	if err := s.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := filter.PageSize
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	offset := (filter.Page - 1) * limit
	if offset < 0 {
		offset = 0
	}

	query := fmt.Sprintf(`
		SELECT 
			j.id, j.list_id, l.name, j.created_by, COALESCE(u.full_name, 'System'),
			j.filename, j.file_path, j.file_size_bytes, j.status,
			j.column_mapping, j.duplicate_strategy,
			j.total_rows, j.processed_rows, j.accepted_rows, j.inserted_rows,
			j.updated_rows, j.duplicate_rows, j.invalid_rows, j.suppressed_rows,
			j.error_count, j.error_report,
			j.started_at, j.completed_at, j.created_at, j.updated_at
		FROM import_jobs j
		JOIN mail_lists l ON l.id = j.list_id
		LEFT JOIN users u ON u.id = j.created_by
		%s
		ORDER BY j.created_at DESC
		LIMIT $%d OFFSET $%d
	`, baseWhere, argIdx, argIdx+1)

	args = append(args, limit, offset)
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var jobs []ImportJob
	for rows.Next() {
		var j ImportJob
		var colMapBytes []byte
		var errReportBytes []byte
		if err := rows.Scan(
			&j.ID, &j.ListID, &j.ListName, &j.CreatedBy, &j.CreatedByName,
			&j.Filename, &j.FilePath, &j.FileSizeBytes, &j.Status,
			&colMapBytes, &j.DuplicateStrategy,
			&j.TotalRows, &j.ProcessedRows, &j.AcceptedRows, &j.InsertedRows,
			&j.UpdatedRows, &j.DuplicateRows, &j.InvalidRows, &j.SuppressedRows,
			&j.ErrorCount, &errReportBytes,
			&j.StartedAt, &j.CompletedAt, &j.CreatedAt, &j.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		if len(colMapBytes) > 0 {
			_ = json.Unmarshal(colMapBytes, &j.ColumnMapping)
		}
		if len(errReportBytes) > 0 {
			_ = json.Unmarshal(errReportBytes, &j.ErrorReport)
		}
		jobs = append(jobs, j)
	}
	return jobs, total, nil
}

func (s *PostgresListService) GetImportJob(ctx context.Context, id uuid.UUID) (*ImportJob, error) {
	query := `
		SELECT 
			j.id, j.list_id, l.name, j.created_by, COALESCE(u.full_name, 'System'),
			j.filename, j.file_path, j.file_size_bytes, j.status,
			j.column_mapping, j.duplicate_strategy,
			j.total_rows, j.processed_rows, j.accepted_rows, j.inserted_rows,
			j.updated_rows, j.duplicate_rows, j.invalid_rows, j.suppressed_rows,
			j.error_count, j.error_report,
			j.started_at, j.completed_at, j.created_at, j.updated_at
		FROM import_jobs j
		JOIN mail_lists l ON l.id = j.list_id
		LEFT JOIN users u ON u.id = j.created_by
		WHERE j.id = $1
	`
	var j ImportJob
	var colMapBytes []byte
	var errReportBytes []byte
	err := s.db.QueryRow(ctx, query, id).Scan(
		&j.ID, &j.ListID, &j.ListName, &j.CreatedBy, &j.CreatedByName,
		&j.Filename, &j.FilePath, &j.FileSizeBytes, &j.Status,
		&colMapBytes, &j.DuplicateStrategy,
		&j.TotalRows, &j.ProcessedRows, &j.AcceptedRows, &j.InsertedRows,
		&j.UpdatedRows, &j.DuplicateRows, &j.InvalidRows, &j.SuppressedRows,
		&j.ErrorCount, &errReportBytes,
		&j.StartedAt, &j.CompletedAt, &j.CreatedAt, &j.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if len(colMapBytes) > 0 {
		_ = json.Unmarshal(colMapBytes, &j.ColumnMapping)
	}
	if len(errReportBytes) > 0 {
		_ = json.Unmarshal(errReportBytes, &j.ErrorReport)
	}
	return &j, nil
}

func (s *PostgresListService) CreateImportJob(ctx context.Context, job *ImportJob) error {
	colMapBytes, _ := json.Marshal(job.ColumnMapping)
	errReportBytes, _ := json.Marshal(job.ErrorReport)

	query := `
		INSERT INTO import_jobs (
			id, list_id, created_by, filename, file_path, file_size_bytes,
			status, column_mapping, duplicate_strategy, total_rows,
			processed_rows, accepted_rows, inserted_rows, updated_rows,
			duplicate_rows, invalid_rows, suppressed_rows, error_count,
			error_report, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10,
			$11, $12, $13, $14,
			$15, $16, $17, $18,
			$19, NOW(), NOW()
		)
	`
	if job.ID == uuid.Nil {
		job.ID = uuid.New()
	}
	if job.DuplicateStrategy == "" {
		job.DuplicateStrategy = "skip"
	}
	if job.Status == "" {
		job.Status = "pending"
	}

	_, err := s.db.Exec(ctx, query,
		job.ID, job.ListID, job.CreatedBy, job.Filename, job.FilePath, job.FileSizeBytes,
		job.Status, colMapBytes, job.DuplicateStrategy, job.TotalRows,
		job.ProcessedRows, job.AcceptedRows, job.InsertedRows, job.UpdatedRows,
		job.DuplicateRows, job.InvalidRows, job.SuppressedRows, job.ErrorCount,
		errReportBytes,
	)
	return err
}

func (s *PostgresListService) UpdateImportJobStatus(ctx context.Context, jobID uuid.UUID, status string) error {
	_, err := s.db.Exec(ctx, "UPDATE import_jobs SET status = $1, updated_at = NOW() WHERE id = $2", status, jobID)
	return err
}

func (s *PostgresListService) CancelImportJob(ctx context.Context, id uuid.UUID) error {
	res, err := s.db.Exec(ctx, `
		UPDATE import_jobs 
		SET status = 'cancelled', updated_at = NOW() 
		WHERE id = $1 AND status IN ('pending', 'validating', 'queued', 'processing')
	`, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("job is already completed or cannot be cancelled")
	}
	return nil
}

func (s *PostgresListService) GetClaimableImportJob(ctx context.Context) (*ImportJob, error) {
	// Atomic lease using FOR UPDATE SKIP LOCKED
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var jobID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id 
		FROM import_jobs 
		WHERE status IN ('pending', 'queued')
		ORDER BY created_at ASC
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`).Scan(&jobID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // No jobs waiting
	}
	if err != nil {
		return nil, err
	}

	now := time.Now()
	_, err = tx.Exec(ctx, `
		UPDATE import_jobs 
		SET status = 'processing', started_at = $1, updated_at = $1 
		WHERE id = $2
	`, now, jobID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.GetImportJob(ctx, jobID)
}

func (s *PostgresListService) SaveImportJobResults(ctx context.Context, job *ImportJob) error {
	errReportBytes, _ := json.Marshal(job.ErrorReport)
	now := time.Now()

	_, err := s.db.Exec(ctx, `
		UPDATE import_jobs
		SET status = $1, processed_rows = $2, accepted_rows = $3,
		    inserted_rows = $4, updated_rows = $5, duplicate_rows = $6,
		    invalid_rows = $7, suppressed_rows = $8, error_count = $9,
		    error_report = $10, completed_at = $11, updated_at = $11
		WHERE id = $12
	`,
		job.Status, job.ProcessedRows, job.AcceptedRows,
		job.InsertedRows, job.UpdatedRows, job.DuplicateRows,
		job.InvalidRows, job.SuppressedRows, job.ErrorCount,
		errReportBytes, now, job.ID,
	)
	if err != nil {
		return err
	}

	// Update list counter and last import timestamp
	_, _ = s.db.Exec(ctx, `
		UPDATE mail_lists 
		SET contact_count = (SELECT COUNT(*) FROM contacts WHERE list_id = $1),
		    last_imported_at = $2,
		    updated_at = $2
		WHERE id = $1
	`, job.ListID, now)

	return nil
}

// -----------------------------------------------------------------------------
// Data Quality Report & Contact Events
// -----------------------------------------------------------------------------

func (s *PostgresListService) GetDataQualityReport(ctx context.Context, listID *uuid.UUID) (*DataQualityReport, error) {
	report := &DataQualityReport{
		ProviderBreakdown: []ProviderStat{},
		RecentErrors:      []ImportError{},
	}

	whereClause := ""
	args := []any{}
	if listID != nil {
		whereClause = "WHERE list_id = $1"
		args = append(args, *listID)
	}

	query := fmt.Sprintf(`
		SELECT 
			COUNT(*) AS total_checked,
			COUNT(*) FILTER (WHERE is_clean = true) AS clean,
			COUNT(*) FILTER (WHERE is_clean = false) AS invalid,
			COUNT(*) FILTER (WHERE is_hard_bounced = true) AS hard_bounce,
			COUNT(*) FILTER (WHERE is_unsub = true) AS unsub,
			COUNT(*) FILTER (WHERE is_optout = true) AS optout,
			COUNT(*) FILTER (WHERE is_blacklisted = true) AS blacklist
		FROM contacts
		%s
	`, whereClause)

	err := s.db.QueryRow(ctx, query, args...).Scan(
		&report.TotalChecked,
		&report.CleanCount,
		&report.InvalidCount,
		&report.HardBouncedCount,
		&report.UnsubscribedCount,
		&report.OptoutCount,
		&report.BlacklistedCount,
	)
	if err != nil {
		return nil, err
	}

	// Suppression count
	supQuery := "SELECT COUNT(*) FROM suppressions"
	if listID != nil {
		supQuery += " WHERE list_id = $1 OR list_id IS NULL"
		_ = s.db.QueryRow(ctx, supQuery, *listID).Scan(&report.SuppressedCount)
	} else {
		_ = s.db.QueryRow(ctx, supQuery).Scan(&report.SuppressedCount)
	}

	// Duplicate count (identical email across lists)
	dupQuery := `
		SELECT COUNT(*) FROM (
			SELECT email FROM contacts GROUP BY email HAVING COUNT(*) > 1
		) dups
	`
	_ = s.db.QueryRow(ctx, dupQuery).Scan(&report.DuplicateEmailCount)

	// Provider breakdown
	provQuery := `
		SELECT 
			p.name,
			COUNT(c.id) AS cnt,
			COUNT(c.id) FILTER (WHERE c.is_clean = true) AS clean_cnt,
			COUNT(c.id) FILTER (WHERE c.is_unsub = true) AS unsub_cnt,
			COUNT(c.id) FILTER (WHERE c.is_hard_bounced = true) AS bounce_cnt
		FROM mailbox_providers p
		JOIN mail_lists l ON l.mailbox_provider_id = p.id
		LEFT JOIN contacts c ON c.list_id = l.id
		GROUP BY p.name
		ORDER BY cnt DESC
		LIMIT 10
	`
	pRows, err := s.db.Query(ctx, provQuery)
	if err == nil {
		defer pRows.Close()
		for pRows.Next() {
			var ps ProviderStat
			if err := pRows.Scan(&ps.ProviderName, &ps.ContactCount, &ps.CleanCount, &ps.UnsubCount, &ps.BounceCount); err == nil {
				report.ProviderBreakdown = append(report.ProviderBreakdown, ps)
			}
		}
	}

	return report, nil
}

func (s *PostgresListService) ListEvents(ctx context.Context, filter EventFilter) ([]ContactEvent, int64, error) {
	baseWhere := "WHERE 1=1"
	args := []any{}
	argIdx := 1

	if filter.ListID != nil {
		baseWhere += fmt.Sprintf(" AND e.list_id = $%d", argIdx)
		args = append(args, *filter.ListID)
		argIdx++
	}
	if filter.EventType != "" && filter.EventType != "all" {
		baseWhere += fmt.Sprintf(" AND e.event_type = $%d", argIdx)
		args = append(args, filter.EventType)
		argIdx++
	}
	if filter.Email != "" {
		baseWhere += fmt.Sprintf(" AND e.email ILIKE $%d", argIdx)
		args = append(args, "%"+strings.TrimSpace(filter.Email)+"%")
		argIdx++
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM contact_events e %s", baseWhere)
	var total int64
	if err := s.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := filter.PageSize
	if limit <= 0 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}
	offset := (filter.Page - 1) * limit
	if offset < 0 {
		offset = 0
	}

	query := fmt.Sprintf(`
		SELECT 
			e.id, e.contact_id, e.list_id, l.name,
			e.event_type, e.email, COALESCE(e.ip_address, ''), COALESCE(e.user_agent, ''),
			e.metadata, e.created_at
		FROM contact_events e
		JOIN mail_lists l ON l.id = e.list_id
		%s
		ORDER BY e.created_at DESC
		LIMIT $%d OFFSET $%d
	`, baseWhere, argIdx, argIdx+1)

	args = append(args, limit, offset)
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []ContactEvent
	for rows.Next() {
		var ev ContactEvent
		var metaBytes []byte
		if err := rows.Scan(
			&ev.ID, &ev.ContactID, &ev.ListID, &ev.ListName,
			&ev.EventType, &ev.Email, &ev.IPAddress, &ev.UserAgent,
			&metaBytes, &ev.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		if len(metaBytes) > 0 {
			_ = json.Unmarshal(metaBytes, &ev.Metadata)
		}
		events = append(events, ev)
	}
	return events, total, nil
}

func (s *PostgresListService) RecordEvent(ctx context.Context, event ContactEvent) error {
	metaBytes, _ := json.Marshal(event.Metadata)
	query := `
		INSERT INTO contact_events (contact_id, list_id, event_type, email, ip_address, user_agent, metadata, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
	`
	_, err := s.db.Exec(ctx, query, event.ContactID, event.ListID, event.EventType, event.Email, event.IPAddress, event.UserAgent, metaBytes)
	return err
}

// -----------------------------------------------------------------------------
// Data Settings
// -----------------------------------------------------------------------------

func (s *PostgresListService) GetDataSettings(ctx context.Context) (map[string]any, error) {
	rows, err := s.db.Query(ctx, "SELECT setting_key, setting_value FROM data_settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]any)
	for rows.Next() {
		var key string
		var valBytes []byte
		if err := rows.Scan(&key, &valBytes); err == nil {
			var val any
			_ = json.Unmarshal(valBytes, &val)
			result[key] = val
		}
	}
	return result, nil
}

func (s *PostgresListService) UpdateDataSettings(ctx context.Context, key string, val any) error {
	valBytes, err := json.Marshal(val)
	if err != nil {
		return err
	}
	query := `
		INSERT INTO data_settings (setting_key, setting_value, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
	`
	_, err = s.db.Exec(ctx, query, key, valBytes)
	return err
}
