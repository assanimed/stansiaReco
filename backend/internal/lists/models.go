package lists

import (
	"time"

	"github.com/google/uuid"
)

// -----------------------------------------------------------------------------
// Mailbox Providers (Gmail, Yahoo, Outlook, etc.)
// -----------------------------------------------------------------------------

type MailboxProvider struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Code        string    `json:"code"`
	Domains     []string  `json:"domains"`
	IsActive    bool      `json:"is_active"`
	Description string    `json:"description,omitempty"`
	ListCount   int64     `json:"list_count,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateMailboxProviderRequest struct {
	Name        string   `json:"name"`
	Code        string   `json:"code"`
	Domains     []string `json:"domains"`
	Description string   `json:"description,omitempty"`
	IsActive    *bool    `json:"is_active,omitempty"`
}

type UpdateMailboxProviderRequest struct {
	Name        *string   `json:"name,omitempty"`
	Domains     *[]string `json:"domains,omitempty"`
	Description *string   `json:"description,omitempty"`
	IsActive    *bool     `json:"is_active,omitempty"`
}

// -----------------------------------------------------------------------------
// Sending ESPs (Amazon SES, SendGrid, Custom PowerMTA, etc.)
// -----------------------------------------------------------------------------

type SendingESP struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Code      string    `json:"code"`
	APIType   string    `json:"api_type"`
	IsActive  bool      `json:"is_active"`
	Notes     string    `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateSendingESPRequest struct {
	Name     string `json:"name"`
	Code     string `json:"code"`
	APIType  string `json:"api_type"`
	Notes    string `json:"notes,omitempty"`
	IsActive *bool  `json:"is_active,omitempty"`
}

type UpdateSendingESPRequest struct {
	Name     *string `json:"name,omitempty"`
	APIType  *string `json:"api_type,omitempty"`
	Notes    *string `json:"notes,omitempty"`
	IsActive *bool   `json:"is_active,omitempty"`
}

// -----------------------------------------------------------------------------
// Sending IP Pools
// -----------------------------------------------------------------------------

type SendingIPPool struct {
	ID          uuid.UUID             `json:"id"`
	Name        string                `json:"name"`
	Code        string                `json:"code"`
	Description string                `json:"description,omitempty"`
	ServerID    *uuid.UUID            `json:"server_id,omitempty"`
	ServerName  string                `json:"server_name,omitempty"`
	IsActive    bool                  `json:"is_active"`
	MemberCount int                   `json:"member_count"`
	Members     []SendingIPPoolMember `json:"members,omitempty"`
	CreatedAt   time.Time             `json:"created_at"`
	UpdatedAt   time.Time             `json:"updated_at"`
}

type SendingIPPoolMember struct {
	ID         uuid.UUID  `json:"id"`
	PoolID     uuid.UUID  `json:"pool_id"`
	IPAddress  string     `json:"ip_address"`
	ServerIPID *uuid.UUID `json:"server_ip_id,omitempty"`
	VMTAName   string     `json:"vmta_name,omitempty"`
	Weight     int        `json:"weight"`
	IsActive   bool       `json:"is_active"`
	CreatedAt  time.Time  `json:"created_at"`
}

type CreateSendingIPPoolRequest struct {
	Name        string                  `json:"name"`
	Code        string                  `json:"code"`
	Description string                  `json:"description,omitempty"`
	ServerID    *uuid.UUID              `json:"server_id,omitempty"`
	IsActive    *bool                   `json:"is_active,omitempty"`
	Members     []CreateIPMemberRequest `json:"members,omitempty"`
}

type CreateIPMemberRequest struct {
	IPAddress  string     `json:"ip_address"`
	ServerIPID *uuid.UUID `json:"server_ip_id,omitempty"`
	VMTAName   string     `json:"vmta_name,omitempty"`
	Weight     int        `json:"weight"`
}

type UpdateSendingIPPoolRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	ServerID    *uuid.UUID `json:"server_id,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
}

// -----------------------------------------------------------------------------
// Countries & Verticals
// -----------------------------------------------------------------------------

type Country struct {
	ID        uuid.UUID `json:"id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	IsActive  bool      `json:"is_active"`
	ListCount int64     `json:"list_count,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateCountryRequest struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	IsActive *bool  `json:"is_active,omitempty"`
}

type Vertical struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Code        string    `json:"code"`
	Description string    `json:"description,omitempty"`
	IsActive    bool      `json:"is_active"`
	ListCount   int64     `json:"list_count,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateVerticalRequest struct {
	Name        string `json:"name"`
	Code        string `json:"code"`
	Description string `json:"description,omitempty"`
	IsActive    *bool  `json:"is_active,omitempty"`
}

// -----------------------------------------------------------------------------
// Mail Lists
// -----------------------------------------------------------------------------

type MailList struct {
	ID                  uuid.UUID  `json:"id"`
	Name                string     `json:"name"`
	Code                string     `json:"code"`
	MailboxProviderID   uuid.UUID  `json:"mailbox_provider_id"`
	MailboxProviderName string     `json:"mailbox_provider_name"`
	MailboxProviderCode string     `json:"mailbox_provider_code"`
	CountryID           uuid.UUID  `json:"country_id"`
	CountryCode         string     `json:"country_code"`
	CountryName         string     `json:"country_name"`
	VerticalID          uuid.UUID  `json:"vertical_id"`
	VerticalCode        string     `json:"vertical_code"`
	VerticalName        string     `json:"vertical_name"`
	Description         string     `json:"description,omitempty"`
	Status              string     `json:"status"` // 'active', 'paused', 'archived'
	ContactCount        int64      `json:"contact_count"`
	LastImportedAt      *time.Time `json:"last_imported_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type MailListMetrics struct {
	ListID            uuid.UUID  `json:"list_id"`
	TotalContacts     int64      `json:"total_contacts"`
	EligibleContacts  int64      `json:"eligible_contacts"` // clean and not unsub, optout, blacklist, hardbounce
	UnsubscribedCount int64      `json:"unsubscribed_count"`
	OptoutCount       int64      `json:"optout_count"`
	BlacklistedCount  int64      `json:"blacklisted_count"`
	HardBouncedCount  int64      `json:"hard_bounced_count"`
	OpenersCount      int64      `json:"openers_count"`
	ClickersCount     int64      `json:"clickers_count"`
	FreshCount        int64      `json:"fresh_count"`
	SeedCount         int64      `json:"seed_count"`
	LastImportedAt    *time.Time `json:"last_imported_at,omitempty"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

type GlobalListSummary struct {
	TotalLists        int64 `json:"total_lists"`
	ActiveLists       int64 `json:"active_lists"`
	TotalContacts     int64 `json:"total_contacts"`
	ImportsInProgress int64 `json:"imports_in_progress"`
	FailedImports     int64 `json:"failed_imports"`
}

type CreateMailListRequest struct {
	Name              string    `json:"name"`
	Code              string    `json:"code"`
	MailboxProviderID uuid.UUID `json:"mailbox_provider_id"`
	CountryID         uuid.UUID `json:"country_id"`
	VerticalID        uuid.UUID `json:"vertical_id"`
	Description       string    `json:"description,omitempty"`
}

type UpdateMailListRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	Status      *string `json:"status,omitempty"`
}

type ListFilter struct {
	Search      string
	ProviderID  *uuid.UUID
	CountryID   *uuid.UUID
	VerticalID  *uuid.UUID
	Status      string
	MinContacts *int64
	MaxContacts *int64
	Page        int
	PageSize    int
	SortBy      string
	SortOrder   string
}

// -----------------------------------------------------------------------------
// Contacts
// -----------------------------------------------------------------------------

type Contact struct {
	ID             uuid.UUID  `json:"id"`
	ListID         uuid.UUID  `json:"list_id"`
	Email          string     `json:"email"`
	EmailMD5       string     `json:"email_md5"`
	FirstName      string     `json:"first_name,omitempty"`
	LastName       string     `json:"last_name,omitempty"`
	Verticals      []string   `json:"verticals"`
	IsSeed         bool       `json:"is_seed"`
	IsFresh        bool       `json:"is_fresh"`
	IsClean        bool       `json:"is_clean"`
	IsOpener       bool       `json:"is_opener"`
	IsClicker      bool       `json:"is_clicker"`
	IsLeader       bool       `json:"is_leader"`
	IsUnsub        bool       `json:"is_unsub"`
	IsOptout       bool       `json:"is_optout"`
	IsBlacklisted  bool       `json:"is_blacklisted"`
	IsHardBounced  bool       `json:"is_hard_bounced"`
	LastActionTime *time.Time `json:"last_action_time,omitempty"`
	LastActionType string     `json:"last_action_type,omitempty"`
	Agent          string     `json:"agent,omitempty"`
	IP             string     `json:"ip,omitempty"`
	CountryCode    string     `json:"country_code,omitempty"`
	Country        string     `json:"country,omitempty"`
	Region         string     `json:"region,omitempty"`
	City           string     `json:"city,omitempty"`
	Language       string     `json:"language,omitempty"`
	DeviceType     string     `json:"device_type,omitempty"`
	DeviceName     string     `json:"device_name,omitempty"`
	OS             string     `json:"os,omitempty"`
	BrowserName    string     `json:"browser_name,omitempty"`
	BrowserVersion string     `json:"browser_version,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type ContactFilter struct {
	ListID        *uuid.UUID
	Search        string
	IsClean       *bool
	IsOpener      *bool
	IsClicker     *bool
	IsUnsub       *bool
	IsOptout      *bool
	IsBlacklisted *bool
	IsHardBounced *bool
	CountryCode   string
	Page          int
	PageSize      int
}

type CreateContactRequest struct {
	ListID         uuid.UUID `json:"list_id"`
	Email          string    `json:"email"`
	FirstName      string    `json:"first_name,omitempty"`
	LastName       string    `json:"last_name,omitempty"`
	Verticals      []string  `json:"verticals,omitempty"`
	IsSeed         bool      `json:"is_seed"`
	IsFresh        bool      `json:"is_fresh"`
	IsClean        bool      `json:"is_clean"`
	IsOpener       bool      `json:"is_opener"`
	IsClicker      bool      `json:"is_clicker"`
	IP             string    `json:"ip,omitempty"`
	CountryCode    string    `json:"country_code,omitempty"`
	Country        string    `json:"country,omitempty"`
	Region         string    `json:"region,omitempty"`
	City           string    `json:"city,omitempty"`
	Language       string    `json:"language,omitempty"`
	DeviceType     string    `json:"device_type,omitempty"`
	DeviceName     string    `json:"device_name,omitempty"`
	OS             string    `json:"os,omitempty"`
	BrowserName    string    `json:"browser_name,omitempty"`
	BrowserVersion string    `json:"browser_version,omitempty"`
}

type UpdateContactRequest struct {
	FirstName      *string   `json:"first_name,omitempty"`
	LastName       *string   `json:"last_name,omitempty"`
	Verticals      *[]string `json:"verticals,omitempty"`
	IsSeed         *bool     `json:"is_seed,omitempty"`
	IsFresh        *bool     `json:"is_fresh,omitempty"`
	IsClean        *bool     `json:"is_clean,omitempty"`
	IsOpener       *bool     `json:"is_opener,omitempty"`
	IsClicker      *bool     `json:"is_clicker,omitempty"`
	IsUnsub        *bool     `json:"is_unsub,omitempty"`
	IsOptout       *bool     `json:"is_optout,omitempty"`
	IsBlacklisted  *bool     `json:"is_blacklisted,omitempty"`
	IsHardBounced  *bool     `json:"is_hard_bounced,omitempty"`
	CountryCode    *string   `json:"country_code,omitempty"`
	Country        *string   `json:"country,omitempty"`
	City           *string   `json:"city,omitempty"`
}

// -----------------------------------------------------------------------------
// Suppressions
// -----------------------------------------------------------------------------

type Suppression struct {
	ID        uuid.UUID  `json:"id"`
	Email     string     `json:"email"`
	EmailMD5  string     `json:"email_md5"`
	Reason    string     `json:"reason"` // 'unsubscribed', 'optout', 'blacklisted', 'hard_bounce', 'manual'
	Source    string     `json:"source"`
	Details   string     `json:"details,omitempty"`
	ListID    *uuid.UUID `json:"list_id,omitempty"`
	ListName  string     `json:"list_name,omitempty"`
	CreatedBy *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type SuppressionFilter struct {
	Search   string
	Reason   string
	ListID   *uuid.UUID
	Page     int
	PageSize int
}

type CreateSuppressionRequest struct {
	Email   string     `json:"email"`
	Reason  string     `json:"reason"`
	Source  string     `json:"source"`
	Details string     `json:"details,omitempty"`
	ListID  *uuid.UUID `json:"list_id,omitempty"`
}

type BulkSuppressionRequest struct {
	Emails  []string   `json:"emails"`
	Reason  string     `json:"reason"`
	Source  string     `json:"source"`
	ListID  *uuid.UUID `json:"list_id,omitempty"`
}

// -----------------------------------------------------------------------------
// Import Jobs
// -----------------------------------------------------------------------------

type ImportJob struct {
	ID                uuid.UUID      `json:"id"`
	ListID            uuid.UUID      `json:"list_id"`
	ListName          string         `json:"list_name"`
	CreatedBy         uuid.UUID      `json:"created_by"`
	CreatedByName     string         `json:"created_by_name,omitempty"`
	Filename          string         `json:"filename"`
	FilePath          string         `json:"file_path"`
	FileSizeBytes     int64          `json:"file_size_bytes"`
	Status            string         `json:"status"` // 'pending', 'validating', 'queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled'
	ColumnMapping     map[string]int `json:"column_mapping"`
	DuplicateStrategy string         `json:"duplicate_strategy"` // 'skip', 'update', 'replace'
	TotalRows         int            `json:"total_rows"`
	ProcessedRows     int            `json:"processed_rows"`
	AcceptedRows      int            `json:"accepted_rows"`
	InsertedRows      int            `json:"inserted_rows"`
	UpdatedRows       int            `json:"updated_rows"`
	DuplicateRows     int            `json:"duplicate_rows"`
	InvalidRows       int            `json:"invalid_rows"`
	SuppressedRows    int            `json:"suppressed_rows"`
	ErrorCount        int            `json:"error_count"`
	ErrorReport       []ImportError  `json:"error_report,omitempty"`
	StartedAt         *time.Time     `json:"started_at,omitempty"`
	CompletedAt       *time.Time     `json:"completed_at,omitempty"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
}

type ImportError struct {
	RowIndex int    `json:"row_index"`
	Email    string `json:"email,omitempty"`
	Reason   string `json:"reason"`
}

type ImportJobFilter struct {
	ListID   *uuid.UUID
	Status   string
	Page     int
	PageSize int
}

type CSVPreviewResponse struct {
	Filename       string           `json:"filename"`
	TotalRowsEst   int              `json:"total_rows_est"`
	Headers        []string         `json:"headers"`
	SampleRows     [][]string       `json:"sample_rows"`
	SuggestedMaps  map[string]int   `json:"suggested_maps"`
	AvailableSlots []ContactFieldDef `json:"available_slots"`
}

type ContactFieldDef struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
}

// -----------------------------------------------------------------------------
// Contact Events (Activity & Engagement)
// -----------------------------------------------------------------------------

type ContactEvent struct {
	ID        uuid.UUID      `json:"id"`
	ContactID *uuid.UUID     `json:"contact_id,omitempty"`
	ListID    uuid.UUID      `json:"list_id"`
	ListName  string         `json:"list_name,omitempty"`
	EventType string         `json:"event_type"` // 'import', 'open', 'click', 'bounce', 'unsubscribe', 'optout', 'suppressed'
	Email     string         `json:"email"`
	IPAddress string         `json:"ip_address,omitempty"`
	UserAgent string         `json:"user_agent,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
}

type EventFilter struct {
	ListID    *uuid.UUID
	EventType string
	Email     string
	Page      int
	PageSize  int
}

// -----------------------------------------------------------------------------
// Data Quality Metrics
// -----------------------------------------------------------------------------

type DataQualityReport struct {
	TotalChecked        int64            `json:"total_checked"`
	CleanCount          int64            `json:"clean_count"`
	InvalidCount        int64            `json:"invalid_count"`
	DuplicateEmailCount int64            `json:"duplicate_email_count"`
	HardBouncedCount    int64            `json:"hard_bounced_count"`
	SuppressedCount     int64            `json:"suppressed_count"`
	UnsubscribedCount   int64            `json:"unsubscribed_count"`
	OptoutCount         int64            `json:"optout_count"`
	BlacklistedCount    int64            `json:"blacklisted_count"`
	ProviderBreakdown   []ProviderStat   `json:"provider_breakdown"`
	RecentErrors        []ImportError    `json:"recent_errors"`
}

type ProviderStat struct {
	ProviderName string `json:"provider_name"`
	ContactCount int64  `json:"contact_count"`
	CleanCount   int64  `json:"clean_count"`
	UnsubCount   int64  `json:"unsub_count"`
	BounceCount  int64  `json:"bounce_count"`
}
