package campaigns

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type CampaignStatus string

const (
	StatusDraft      CampaignStatus = "draft"
	StatusScheduled  CampaignStatus = "scheduled"
	StatusQueued     CampaignStatus = "queued"
	StatusProcessing CampaignStatus = "processing"
	StatusPaused     CampaignStatus = "paused"
	StatusCompleted  CampaignStatus = "completed"
	StatusFailed     CampaignStatus = "failed"
	StatusCancelled  CampaignStatus = "cancelled"
)

type RoutingType string

const (
	RoutingFileSpool  RoutingType = "file_spool"
	RoutingIPPool     RoutingType = "ip_pool"
	RoutingSendingESP RoutingType = "sending_esp"
	RoutingCustomVMTA RoutingType = "custom_vmta"
)

// AudienceFilter allows precision targeting within the chosen Mail List
type AudienceFilter struct {
	OnlyClean     bool     `json:"only_clean"`
	OnlyOpeners   bool     `json:"only_openers"`
	OnlyClickers  bool     `json:"only_clickers"`
	OnlySeeds     bool     `json:"only_seeds"`
	ExcludeUnsubs bool     `json:"exclude_unsubs"`
	CountryCodes  []string `json:"country_codes,omitempty"`
	Verticals     []string `json:"verticals,omitempty"`
}

// Campaign represents an email campaign configuration and delivery status
type Campaign struct {
	ID                     uuid.UUID       `json:"id"`
	Name                   string          `json:"name"`
	Subject                string          `json:"subject"`
	FromName               string          `json:"from_name"`
	FromEmail              string          `json:"from_email"`
	ReplyTo                string          `json:"reply_to,omitempty"`
	MailListID             uuid.UUID       `json:"mail_list_id"`
	MailListName           string          `json:"mail_list_name,omitempty"`
	MailListCode           string          `json:"mail_list_code,omitempty"`
	AudienceFilter         AudienceFilter  `json:"audience_filter"`
	RoutingType            RoutingType     `json:"routing_type"`
	SendingIPPoolID        *uuid.UUID      `json:"sending_ip_pool_id,omitempty"`
	SendingIPPoolName      string          `json:"sending_ip_pool_name,omitempty"`
	SendingESPID           *uuid.UUID      `json:"sending_esp_id,omitempty"`
	SendingESPName         string          `json:"sending_esp_name,omitempty"`
	CustomVMTA             string          `json:"custom_vmta,omitempty"`
	HTMLContent            string          `json:"html_content"`
	PlainContent           string          `json:"plain_content"`
	CustomHeaders          map[string]string `json:"custom_headers,omitempty"`
	TrackOpens             bool            `json:"track_opens"`
	TrackClicks            bool            `json:"track_clicks"`
	ListUnsubscribeHeader  bool            `json:"list_unsubscribe_header"`
	ScheduledAt            *time.Time      `json:"scheduled_at,omitempty"`
	HourlyLimit            int             `json:"hourly_limit"`
	BatchSize              int             `json:"batch_size"`
	Status                 CampaignStatus  `json:"status"`
	TotalRecipients        int             `json:"total_recipients"`
	ProcessedCount         int             `json:"processed_count"`
	SentCount              int             `json:"sent_count"`
	SuppressedCount        int             `json:"suppressed_count"`
	FailedCount            int             `json:"failed_count"`
	SpoolPath              string          `json:"spool_path,omitempty"`
	ErrorMessage           string          `json:"error_message,omitempty"`
	StartedAt              *time.Time      `json:"started_at,omitempty"`
	CompletedAt            *time.Time      `json:"completed_at,omitempty"`
	CreatedBy              *uuid.UUID      `json:"created_by,omitempty"`
	CreatedByName          string          `json:"created_by_name,omitempty"`
	CreatedAt              time.Time       `json:"created_at"`
	UpdatedAt              time.Time       `json:"updated_at"`
}

// CampaignSummaryKPIs holds aggregate statistics for the dashboard cards
type CampaignSummaryKPIs struct {
	TotalCampaigns    int64   `json:"total_campaigns"`
	ActiveSending     int64   `json:"active_sending"`
	TotalSpooled      int64   `json:"total_spooled"`
	CompletedCount    int64   `json:"completed_count"`
	AverageHourlyRate float64 `json:"average_hourly_rate"`
}

// CreateCampaignRequest defines payloads for creating campaigns
type CreateCampaignRequest struct {
	Name                  string            `json:"name"`
	Subject               string            `json:"subject"`
	FromName              string            `json:"from_name"`
	FromEmail             string            `json:"from_email"`
	ReplyTo               string            `json:"reply_to"`
	MailListID            uuid.UUID         `json:"mail_list_id"`
	AudienceFilter        AudienceFilter    `json:"audience_filter"`
	RoutingType           RoutingType       `json:"routing_type"`
	SendingIPPoolID       *uuid.UUID        `json:"sending_ip_pool_id"`
	SendingESPID          *uuid.UUID        `json:"sending_esp_id"`
	CustomVMTA            string            `json:"custom_vmta"`
	HTMLContent           string            `json:"html_content"`
	PlainContent          string            `json:"plain_content"`
	CustomHeaders         map[string]string `json:"custom_headers"`
	TrackOpens            bool              `json:"track_opens"`
	TrackClicks           bool              `json:"track_clicks"`
	ListUnsubscribeHeader bool              `json:"list_unsubscribe_header"`
	ScheduledAt           *time.Time        `json:"scheduled_at"`
	HourlyLimit           int               `json:"hourly_limit"`
	BatchSize             int               `json:"batch_size"`
}

// UpdateCampaignRequest defines payloads for updating existing draft campaigns
type UpdateCampaignRequest struct {
	Name                  string            `json:"name"`
	Subject               string            `json:"subject"`
	FromName              string            `json:"from_name"`
	FromEmail             string            `json:"from_email"`
	ReplyTo               string            `json:"reply_to"`
	MailListID            uuid.UUID         `json:"mail_list_id"`
	AudienceFilter        AudienceFilter    `json:"audience_filter"`
	RoutingType           RoutingType       `json:"routing_type"`
	SendingIPPoolID       *uuid.UUID        `json:"sending_ip_pool_id"`
	SendingESPID          *uuid.UUID        `json:"sending_esp_id"`
	CustomVMTA            string            `json:"custom_vmta"`
	HTMLContent           string            `json:"html_content"`
	PlainContent          string            `json:"plain_content"`
	CustomHeaders         map[string]string `json:"custom_headers"`
	TrackOpens            bool              `json:"track_opens"`
	TrackClicks           bool              `json:"track_clicks"`
	ListUnsubscribeHeader bool              `json:"list_unsubscribe_header"`
	ScheduledAt           *time.Time        `json:"scheduled_at"`
	HourlyLimit           int               `json:"hourly_limit"`
	BatchSize             int               `json:"batch_size"`
}

// CampaignFilter provides search and pagination criteria
type CampaignFilter struct {
	Search     string
	Status     string
	MailListID *uuid.UUID
	Page       int
	PageSize   int
}

// CampaignLog records an individual contact spool/dispatch action
type CampaignLog struct {
	ID         uuid.UUID `json:"id"`
	CampaignID uuid.UUID `json:"campaign_id"`
	ContactID  *uuid.UUID `json:"contact_id,omitempty"`
	Email      string    `json:"email"`
	Status     string    `json:"status"` // 'spooled', 'suppressed', 'failed'
	MessageID  string    `json:"message_id,omitempty"`
	FilePath   string    `json:"file_path,omitempty"`
	Details    string    `json:"details,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// PreviewRequest provides content and test contact data for real-time rendering
type PreviewRequest struct {
	Subject       string            `json:"subject"`
	HTMLContent   string            `json:"html_content"`
	PlainContent  string            `json:"plain_content"`
	CustomHeaders map[string]string `json:"custom_headers"`
	SampleContact ContactData       `json:"sample_contact"`
}

// PreviewResponse contains the rendered subject, HTML, plaintext, and headers
type PreviewResponse struct {
	RenderedSubject string            `json:"rendered_subject"`
	RenderedHTML    string            `json:"rendered_html"`
	RenderedPlain   string            `json:"rendered_plain"`
	RenderedHeaders map[string]string `json:"rendered_headers"`
	RawMIMESample   string            `json:"raw_mime_sample"`
}

// TestSendRequest delivers an immediate test email to a specified recipient
type TestSendRequest struct {
	RecipientEmail string      `json:"recipient_email"`
	SampleContact  ContactData `json:"sample_contact"`
}

// SpoolFileInfo provides metadata for an inspectable .eml file on disk
type SpoolFileInfo struct {
	FileName    string    `json:"file_name"`
	FilePath    string    `json:"file_path"`
	SizeBytes   int64     `json:"size_bytes"`
	Recipient   string    `json:"recipient"`
	GeneratedAt time.Time `json:"generated_at"`
}

// ContactData models the contact attributes available as merge tags
type ContactData struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	EmailMD5    string    `json:"email_md5"`
	FirstName   string    `json:"first_name"`
	LastName    string    `json:"last_name"`
	City        string    `json:"city"`
	Region      string    `json:"region"`
	Country     string    `json:"country"`
	CountryCode string    `json:"country_code"`
	CustomTags  map[string]string `json:"custom_tags,omitempty"`
}

// AudienceEstimate provides real-time counts when configuring audience filters
type AudienceEstimate struct {
	TotalInList     int64 `json:"total_in_list"`
	MatchingFilter  int64 `json:"matching_filter"`
	SuppressedCount int64 `json:"suppressed_count"`
	EligibleToSend  int64 `json:"eligible_to_send"`
}

// MarshalAudienceFilter helper
func MarshalAudienceFilter(filter AudienceFilter) ([]byte, error) {
	return json.Marshal(filter)
}

// UnmarshalAudienceFilter helper
func UnmarshalAudienceFilter(data []byte) (AudienceFilter, error) {
	var f AudienceFilter
	if len(data) == 0 {
		return f, nil
	}
	err := json.Unmarshal(data, &f)
	return f, err
}
