package execution

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrScriptNotFound    = errors.New("script not found in registry")
	ErrScriptSlugExists  = errors.New("a script with this slug already exists")
	ErrExecutionNotFound = errors.New("execution job not found")
	ErrSessionNotFound   = errors.New("terminal TTY session not found or expired")
	ErrIRedMailNotFound  = errors.New("iRedMail server deployment not found")
)

type IRedMailPipelineStep struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      string     `json:"status"` // "pending", "running", "completed", "failed"
	Logs        string     `json:"logs"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	DurationMs  int64      `json:"duration_ms"`
}

type IRedMailServer struct {
	ID                 uuid.UUID              `json:"id"`
	ServerID           uuid.UUID              `json:"server_id"`
	ServerName         string                 `json:"server_name"`
	ServerIP           string                 `json:"server_ip"`
	DomainID           uuid.UUID              `json:"domain_id"`
	DomainName         string                 `json:"domain_name"`
	ProviderName       string                 `json:"provider_name"`
	Hostname           string                 `json:"hostname"`
	MailDomain         string                 `json:"mail_domain"`
	AdminEmail         string                 `json:"admin_email"`
	AdminPassword      string                 `json:"admin_password,omitempty"`
	OSName             string                 `json:"os_name"`
	OSVersion          string                 `json:"os_version"`
	ContainerName      string                 `json:"container_name"`
	ContainerID        string                 `json:"container_id"`
	DKIMSelector       string                 `json:"dkim_selector"`
	DKIMHost           string                 `json:"dkim_host"`
	DKIMValue          string                 `json:"dkim_value"`
	DKIMRawOutput      string                 `json:"dkim_raw_output"`
	DNSAConfigured     bool                   `json:"dns_a_configured"`
	DNSMXConfigured    bool                   `json:"dns_mx_configured"`
	DNSSPFConfigured   bool                   `json:"dns_spf_configured"`
	DNSDMARCConfigured bool                   `json:"dns_dmarc_configured"`
	DNSDKIMConfigured  bool                   `json:"dns_dkim_configured"`
	Status             string                 `json:"status"` // "pending", "running", "completed", "failed"
	CurrentStep        string                 `json:"current_step"`
	PipelineSteps      []IRedMailPipelineStep `json:"pipeline_steps"`
	ErrorMessage       string                 `json:"error_message,omitempty"`
	WebmailURL         string                 `json:"webmail_url"`
	AdminPanelURL      string                 `json:"admin_panel_url"`
	CreatedBy          *uuid.UUID             `json:"created_by,omitempty"`
	StartedAt          *time.Time             `json:"started_at,omitempty"`
	CompletedAt        *time.Time             `json:"completed_at,omitempty"`
	CreatedAt          time.Time              `json:"created_at"`
	UpdatedAt          time.Time              `json:"updated_at"`
}

type CreateIRedMailServerRequest struct {
	ServerID      uuid.UUID `json:"server_id"`
	DomainID      uuid.UUID `json:"domain_id"`
	Hostname      string    `json:"hostname"`
	AdminPassword string    `json:"admin_password"`
}

type IRedMailOSCheckResult struct {
	ServerID        uuid.UUID `json:"server_id"`
	ServerName      string    `json:"server_name"`
	ServerIP        string    `json:"server_ip"`
	Reachable       bool      `json:"reachable"`
	OSID            string    `json:"os_id"`
	OSVersion       string    `json:"os_version"`
	OSPrettyName    string    `json:"os_pretty_name"`
	Supported       bool      `json:"supported"`
	DockerInstalled bool      `json:"docker_installed"`
	DockerVersion   string    `json:"docker_version"`
	Message         string    `json:"message"`
}

type RegisteredScript struct {
	ID                uuid.UUID `json:"id"`
	Slug              string    `json:"slug"`
	Name              string    `json:"name"`
	Category          string    `json:"category"` // "mta", "network", "system", "security", "general"
	OSTarget          string    `json:"os_target"`
	Description       string    `json:"description"`
	ScriptContent     string    `json:"script_content"`
	AllowedParameters []string  `json:"allowed_parameters"`
	TimeoutSeconds    int       `json:"timeout_seconds"`
	IsDangerous       bool      `json:"is_dangerous"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type CreateScriptRequest struct {
	Slug           string `json:"slug"`
	Name           string `json:"name"`
	Category       string `json:"category"`
	OSTarget       string `json:"os_target"`
	Description    string `json:"description"`
	ScriptContent  string `json:"script_content"`
	TimeoutSeconds int    `json:"timeout_seconds"`
	IsDangerous    bool   `json:"is_dangerous"`
}

type UpdateScriptRequest struct {
	Name           *string `json:"name,omitempty"`
	Category       *string `json:"category,omitempty"`
	OSTarget       *string `json:"os_target,omitempty"`
	Description    *string `json:"description,omitempty"`
	ScriptContent  *string `json:"script_content,omitempty"`
	TimeoutSeconds *int    `json:"timeout_seconds,omitempty"`
	IsDangerous    *bool   `json:"is_dangerous,omitempty"`
}

type ExecutionJob struct {
	ID                uuid.UUID  `json:"id"`
	ServerID          *uuid.UUID `json:"server_id,omitempty"`
	ServerName        string     `json:"server_name"`
	ServerHost        string     `json:"server_host"`
	RequestedByUserID uuid.UUID  `json:"requested_by_user_id"`
	RequestedByEmail  string     `json:"requested_by_email,omitempty"`
	ExecutionType     string     `json:"execution_type"` // "command", "script"
	ScriptSlug        string     `json:"script_slug"`
	ScriptName        string     `json:"script_name"`
	CommandText       string     `json:"command_text"`
	Status            string     `json:"status"` // "running", "success", "failed"
	ExitCode          *int       `json:"exit_code,omitempty"`
	Stdout            string     `json:"stdout"`
	Stderr            string     `json:"stderr"`
	ErrorMessage      string     `json:"error_message,omitempty"`
	DurationMs        int64      `json:"duration_ms"`
	QueuedAt          time.Time  `json:"queued_at"`
	StartedAt         *time.Time `json:"started_at,omitempty"`
	CompletedAt       *time.Time `json:"completed_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

type ExecuteCommandRequest struct {
	ServerIDs      []uuid.UUID `json:"server_ids"`
	UseLocalhost   bool        `json:"use_localhost"`
	ExecutionType  string      `json:"execution_type"` // "command" or "script"
	ScriptID       *uuid.UUID  `json:"script_id,omitempty"`
	Command        string      `json:"command"`
	TimeoutSeconds int         `json:"timeout_seconds"`
}

type CreateTerminalSessionRequest struct {
	ServerID *uuid.UUID `json:"server_id,omitempty"`
	IsLocal  bool       `json:"is_local"`
	Cols     int        `json:"cols"`
	Rows     int        `json:"rows"`
}

type TerminalSessionInfo struct {
	SessionID    string     `json:"session_id"`
	ServerID     *uuid.UUID `json:"server_id,omitempty"`
	ServerName   string     `json:"server_name"`
	ServerHost   string     `json:"server_host"`
	Username     string     `json:"username"`
	IsLocal      bool       `json:"is_local"`
	Cols         int        `json:"cols"`
	Rows         int        `json:"rows"`
	Status       string     `json:"status"` // "connected", "closed", "error"
	CreatedAt    time.Time  `json:"created_at"`
	LastActiveAt time.Time  `json:"last_active_at"`
	BytesRead    int64      `json:"bytes_read"`
	BytesWritten int64      `json:"bytes_written"`
}

type TerminalOutputChunk struct {
	SessionID  string `json:"session_id"`
	Data       string `json:"data"`
	NextOffset int    `json:"next_offset"`
	Status     string `json:"status"`
}

type StreamLogEvent struct {
	Type       string         `json:"type"` // "start", "log", "done", "complete", "error"
	JobID      *uuid.UUID     `json:"job_id,omitempty"`
	ServerID   *uuid.UUID     `json:"server_id,omitempty"`
	ServerName string         `json:"server_name,omitempty"`
	ServerHost string         `json:"server_host,omitempty"`
	Stream     string         `json:"stream,omitempty"` // "stdout", "stderr", "system"
	Chunk      string         `json:"chunk,omitempty"`
	ExitCode   *int           `json:"exit_code,omitempty"`
	Status     string         `json:"status,omitempty"` // "running", "success", "failed"
	DurationMs int64          `json:"duration_ms,omitempty"`
	Error      string         `json:"error,omitempty"`
	Jobs       []ExecutionJob `json:"jobs,omitempty"`
}

