package execution

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/ssh"
	"stansiareco/backend/internal/credentials"
	"stansiareco/backend/internal/domains"
)

type ExecutionService interface {
	// Pre-configured Scripts Registry
	ListScripts(ctx context.Context, category string) ([]RegisteredScript, error)
	GetScript(ctx context.Context, id uuid.UUID) (*RegisteredScript, error)
	CreateScript(ctx context.Context, req CreateScriptRequest) (*RegisteredScript, error)
	UpdateScript(ctx context.Context, id uuid.UUID, req UpdateScriptRequest) (*RegisteredScript, error)
	DeleteScript(ctx context.Context, id uuid.UUID) error

	// Remote Commands & Script Execution Jobs
	ListExecutions(ctx context.Context, limit int) ([]ExecutionJob, error)
	GetExecution(ctx context.Context, id uuid.UUID) (*ExecutionJob, error)
	ExecuteCommand(ctx context.Context, req ExecuteCommandRequest, userID uuid.UUID) ([]ExecutionJob, error)
	ExecuteCommandStream(ctx context.Context, req ExecuteCommandRequest, userID uuid.UUID, callback func(StreamLogEvent)) ([]ExecutionJob, error)

	// Live SSH Terminal (TTY)
	CreateTerminalSession(ctx context.Context, req CreateTerminalSessionRequest, userID uuid.UUID) (*TerminalSessionInfo, error)
	ListTerminalSessions() []TerminalSessionInfo
	WriteTerminalInput(sessionID string, input string) error
	ReadTerminalOutput(sessionID string, offset int) (*TerminalOutputChunk, error)
	ResizeTerminal(sessionID string, cols, rows int) error
	CloseTerminalSession(sessionID string) error
	ServeTerminalWebSocket(w http.ResponseWriter, r *http.Request, sessionID string)

	// iRedMail Server Deployments & DNS Automation Pipeline
	ListIRedMailServers(ctx context.Context) ([]IRedMailServer, error)
	GetIRedMailServer(ctx context.Context, id uuid.UUID) (*IRedMailServer, error)
	CheckServerUbuntuOS(ctx context.Context, serverID uuid.UUID) (*IRedMailOSCheckResult, error)
	CreateIRedMailServer(ctx context.Context, req CreateIRedMailServerRequest, userID uuid.UUID) (*IRedMailServer, error)
	RetryIRedMailServer(ctx context.Context, id uuid.UUID) (*IRedMailServer, error)
	SyncIRedMailDNSAndDKIM(ctx context.Context, id uuid.UUID) (*IRedMailServer, error)
	DeleteIRedMailServer(ctx context.Context, id uuid.UUID, removeContainer bool) error
}

type PostgresExecutionService struct {
	db            *pgxpool.Pool
	vault         *credentials.Vault
	domainService domains.DomainService
	termMu        sync.RWMutex
	terminals     map[string]*ActiveTerminalSession
}

func NewPostgresExecutionService(db *pgxpool.Pool, vault *credentials.Vault) *PostgresExecutionService {
	return &PostgresExecutionService{
		db:        db,
		vault:     vault,
		terminals: make(map[string]*ActiveTerminalSession),
	}
}

func (s *PostgresExecutionService) SetDomainService(ds domains.DomainService) {
	s.domainService = ds
}

var nonSlugRegex = regexp.MustCompile(`[^a-z0-9]+`)

func normalizeSlug(input string) string {
	s := strings.ToLower(strings.TrimSpace(input))
	s = nonSlugRegex.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

// -----------------------------------------------------------------------------
// Pre-configured Scripts Registry
// -----------------------------------------------------------------------------

func (s *PostgresExecutionService) ListScripts(ctx context.Context, category string) ([]RegisteredScript, error) {
	query := `
		SELECT 
			id, slug, name, COALESCE(category, 'general'), COALESCE(os_target, 'linux'),
			COALESCE(description, ''), script_content, allowed_parameters,
			timeout_seconds, is_dangerous, created_at, updated_at
		FROM script_registry
		WHERE 1=1
	`
	params := make([]any, 0)
	if category != "" && category != "ALL" {
		query += " AND category = $1"
		params = append(params, strings.ToLower(category))
	}
	query += " ORDER BY category ASC, name ASC"

	rows, err := s.db.Query(ctx, query, params...)
	if err != nil {
		return nil, fmt.Errorf("failed to list scripts: %w", err)
	}
	defer rows.Close()

	scripts := make([]RegisteredScript, 0)
	for rows.Next() {
		var sc RegisteredScript
		var paramsJSON []byte
		err := rows.Scan(
			&sc.ID, &sc.Slug, &sc.Name, &sc.Category, &sc.OSTarget,
			&sc.Description, &sc.ScriptContent, &paramsJSON,
			&sc.TimeoutSeconds, &sc.IsDangerous, &sc.CreatedAt, &sc.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan script: %w", err)
		}
		_ = json.Unmarshal(paramsJSON, &sc.AllowedParameters)
		if sc.AllowedParameters == nil {
			sc.AllowedParameters = []string{}
		}
		scripts = append(scripts, sc)
	}
	return scripts, nil
}

func (s *PostgresExecutionService) GetScript(ctx context.Context, id uuid.UUID) (*RegisteredScript, error) {
	query := `
		SELECT 
			id, slug, name, COALESCE(category, 'general'), COALESCE(os_target, 'linux'),
			COALESCE(description, ''), script_content, allowed_parameters,
			timeout_seconds, is_dangerous, created_at, updated_at
		FROM script_registry
		WHERE id = $1
	`
	var sc RegisteredScript
	var paramsJSON []byte
	err := s.db.QueryRow(ctx, query, id).Scan(
		&sc.ID, &sc.Slug, &sc.Name, &sc.Category, &sc.OSTarget,
		&sc.Description, &sc.ScriptContent, &paramsJSON,
		&sc.TimeoutSeconds, &sc.IsDangerous, &sc.CreatedAt, &sc.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrScriptNotFound
		}
		return nil, fmt.Errorf("failed to get script: %w", err)
	}
	_ = json.Unmarshal(paramsJSON, &sc.AllowedParameters)
	if sc.AllowedParameters == nil {
		sc.AllowedParameters = []string{}
	}
	return &sc, nil
}

func (s *PostgresExecutionService) CreateScript(ctx context.Context, req CreateScriptRequest) (*RegisteredScript, error) {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return nil, errors.New("script name is required")
	}
	if strings.TrimSpace(req.ScriptContent) == "" {
		return nil, errors.New("script content cannot be empty")
	}

	slug := normalizeSlug(req.Slug)
	if slug == "" {
		slug = normalizeSlug(req.Name)
	}
	if slug == "" {
		slug = "script-" + uuid.New().String()[:8]
	}

	// Auto-disambiguate slug if already exists in script_registry
	candidateSlug := slug
	counter := 1
	for {
		var exists bool
		err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM script_registry WHERE slug = $1)", candidateSlug).Scan(&exists)
		if err != nil {
			return nil, fmt.Errorf("failed to check script slug existence: %w", err)
		}
		if !exists {
			slug = candidateSlug
			break
		}
		counter++
		candidateSlug = fmt.Sprintf("%s-%d", slug, counter)
	}

	if req.Category == "" {
		req.Category = "general"
	}
	if req.OSTarget == "" {
		req.OSTarget = "linux"
	}
	if req.TimeoutSeconds <= 0 {
		req.TimeoutSeconds = 60
	}

	query := `
		INSERT INTO script_registry (
			id, slug, name, category, os_target, description,
			script_content, allowed_parameters, timeout_seconds,
			is_dangerous, created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, $5, $6, '[]'::jsonb, $7, $8, NOW(), NOW()
		) RETURNING id
	`
	var id uuid.UUID
	err := s.db.QueryRow(ctx, query,
		slug, req.Name, strings.ToLower(req.Category), strings.ToLower(req.OSTarget),
		req.Description, req.ScriptContent, req.TimeoutSeconds, req.IsDangerous,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			// Race condition fallback: append short random hash
			slug = fmt.Sprintf("%s-%s", slug, uuid.New().String()[:6])
			err = s.db.QueryRow(ctx, query,
				slug, req.Name, strings.ToLower(req.Category), strings.ToLower(req.OSTarget),
				req.Description, req.ScriptContent, req.TimeoutSeconds, req.IsDangerous,
			).Scan(&id)
		}
		if err != nil {
			return nil, fmt.Errorf("failed to create script: %w", err)
		}
	}

	return s.GetScript(ctx, id)
}

func (s *PostgresExecutionService) UpdateScript(ctx context.Context, id uuid.UUID, req UpdateScriptRequest) (*RegisteredScript, error) {
	current, err := s.GetScript(ctx, id)
	if err != nil {
		return nil, err
	}

	name := current.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}

	category := current.Category
	if req.Category != nil && strings.TrimSpace(*req.Category) != "" {
		category = strings.ToLower(strings.TrimSpace(*req.Category))
	}

	osTarget := current.OSTarget
	if req.OSTarget != nil && strings.TrimSpace(*req.OSTarget) != "" {
		osTarget = strings.ToLower(strings.TrimSpace(*req.OSTarget))
	}

	description := current.Description
	if req.Description != nil {
		description = *req.Description
	}

	scriptContent := current.ScriptContent
	if req.ScriptContent != nil && strings.TrimSpace(*req.ScriptContent) != "" {
		scriptContent = *req.ScriptContent
	}

	timeout := current.TimeoutSeconds
	if req.TimeoutSeconds != nil && *req.TimeoutSeconds > 0 {
		timeout = *req.TimeoutSeconds
	}

	isDangerous := current.IsDangerous
	if req.IsDangerous != nil {
		isDangerous = *req.IsDangerous
	}

	query := `
		UPDATE script_registry
		SET name = $1, category = $2, os_target = $3, description = $4,
		    script_content = $5, timeout_seconds = $6, is_dangerous = $7,
		    updated_at = NOW()
		WHERE id = $8
	`
	_, err = s.db.Exec(ctx, query, name, category, osTarget, description, scriptContent, timeout, isDangerous, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update script: %w", err)
	}

	return s.GetScript(ctx, id)
}

func (s *PostgresExecutionService) DeleteScript(ctx context.Context, id uuid.UUID) error {
	res, err := s.db.Exec(ctx, "DELETE FROM script_registry WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete script: %w", err)
	}
	if res.RowsAffected() == 0 {
		return ErrScriptNotFound
	}
	return nil
}

// -----------------------------------------------------------------------------
// Remote Commands & Script Execution Jobs
// -----------------------------------------------------------------------------

func (s *PostgresExecutionService) ListExecutions(ctx context.Context, limit int) ([]ExecutionJob, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	query := `
		SELECT 
			j.id, j.server_id,
			COALESCE(NULLIF(j.server_name, ''), s.name, 'Local Control Plane'),
			COALESCE(NULLIF(j.server_host, ''), s.hostname_or_ip, '127.0.0.1'),
			j.requested_by_user_id, COALESCE(u.email, ''),
			COALESCE(j.execution_type, 'command'),
			COALESCE(j.script_slug, 'adhoc-command'),
			COALESCE(j.script_name, ''),
			COALESCE(j.command_text, ''),
			j.status, j.exit_code,
			COALESCE(j.stdout, ''), COALESCE(j.stderr, ''),
			COALESCE(j.error_message, ''), COALESCE(j.duration_ms, 0),
			j.queued_at, j.started_at, j.completed_at, j.created_at
		FROM execution_jobs j
		LEFT JOIN servers s ON s.id = j.server_id
		LEFT JOIN users u ON u.id = j.requested_by_user_id
		ORDER BY j.created_at DESC
		LIMIT $1
	`
	rows, err := s.db.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to list execution jobs: %w", err)
	}
	defer rows.Close()

	jobs := make([]ExecutionJob, 0)
	for rows.Next() {
		var j ExecutionJob
		err := rows.Scan(
			&j.ID, &j.ServerID, &j.ServerName, &j.ServerHost,
			&j.RequestedByUserID, &j.RequestedByEmail,
			&j.ExecutionType, &j.ScriptSlug, &j.ScriptName, &j.CommandText,
			&j.Status, &j.ExitCode, &j.Stdout, &j.Stderr,
			&j.ErrorMessage, &j.DurationMs,
			&j.QueuedAt, &j.StartedAt, &j.CompletedAt, &j.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan execution job: %w", err)
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

func (s *PostgresExecutionService) GetExecution(ctx context.Context, id uuid.UUID) (*ExecutionJob, error) {
	query := `
		SELECT 
			j.id, j.server_id,
			COALESCE(NULLIF(j.server_name, ''), s.name, 'Local Control Plane'),
			COALESCE(NULLIF(j.server_host, ''), s.hostname_or_ip, '127.0.0.1'),
			j.requested_by_user_id, COALESCE(u.email, ''),
			COALESCE(j.execution_type, 'command'),
			COALESCE(j.script_slug, 'adhoc-command'),
			COALESCE(j.script_name, ''),
			COALESCE(j.command_text, ''),
			j.status, j.exit_code,
			COALESCE(j.stdout, ''), COALESCE(j.stderr, ''),
			COALESCE(j.error_message, ''), COALESCE(j.duration_ms, 0),
			j.queued_at, j.started_at, j.completed_at, j.created_at
		FROM execution_jobs j
		LEFT JOIN servers s ON s.id = j.server_id
		LEFT JOIN users u ON u.id = j.requested_by_user_id
		WHERE j.id = $1
	`
	var j ExecutionJob
	err := s.db.QueryRow(ctx, query, id).Scan(
		&j.ID, &j.ServerID, &j.ServerName, &j.ServerHost,
		&j.RequestedByUserID, &j.RequestedByEmail,
		&j.ExecutionType, &j.ScriptSlug, &j.ScriptName, &j.CommandText,
		&j.Status, &j.ExitCode, &j.Stdout, &j.Stderr,
		&j.ErrorMessage, &j.DurationMs,
		&j.QueuedAt, &j.StartedAt, &j.CompletedAt, &j.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrExecutionNotFound
		}
		return nil, fmt.Errorf("failed to get execution job: %w", err)
	}
	return &j, nil
}

func prepareExecutionScript(execType, commandText string) string {
	script := strings.ReplaceAll(commandText, "\r\n", "\n")
	script = strings.ReplaceAll(script, "\r", "\n")
	script = strings.TrimSpace(script)

	if execType == "script" {
		lines := strings.Split(script, "\n")
		bodyLines := make([]string, 0, len(lines))
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "#!") {
				continue
			}
			bodyLines = append(bodyLines, line)
		}
		cleanBody := strings.Join(bodyLines, "\n")

		var buf strings.Builder
		buf.WriteString("export DEBIAN_FRONTEND=noninteractive\n")
		buf.WriteString("export PYTHONUNBUFFERED=1\n")
		buf.WriteString("export PATH=$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n")
		buf.WriteString(cleanBody)
		buf.WriteString("\n")
		return buf.String()
	}

	return script
}

type streamWriter struct {
	mu         sync.Mutex
	buf        *bytes.Buffer
	jobID      uuid.UUID
	serverID   *uuid.UUID
	serverName string
	serverHost string
	streamName string
	callback   func(StreamLogEvent)
}

func (w *streamWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.buf.Write(p)
	if w.callback != nil && len(p) > 0 {
		w.callback(StreamLogEvent{
			Type:       "log",
			JobID:      &w.jobID,
			ServerID:   w.serverID,
			ServerName: w.serverName,
			ServerHost: w.serverHost,
			Stream:     w.streamName,
			Chunk:      string(p),
		})
	}
	return len(p), nil
}

func (s *PostgresExecutionService) ExecuteCommand(
	ctx context.Context,
	req ExecuteCommandRequest,
	userID uuid.UUID,
) ([]ExecutionJob, error) {
	return s.ExecuteCommandStream(ctx, req, userID, nil)
}

func (s *PostgresExecutionService) ExecuteCommandStream(
	ctx context.Context,
	req ExecuteCommandRequest,
	userID uuid.UUID,
	callback func(StreamLogEvent),
) ([]ExecutionJob, error) {
	execType := "command"
	scriptSlug := "adhoc-command"
	scriptName := "Ad-Hoc Remote Command"
	commandToRun := strings.TrimSpace(req.Command)
	timeoutSec := req.TimeoutSeconds
	if timeoutSec <= 0 {
		timeoutSec = 120
	} else if timeoutSec > 1800 {
		timeoutSec = 1800
	}

	// If executing a pre-configured script from the registry
	if req.ScriptID != nil {
		sc, err := s.GetScript(ctx, *req.ScriptID)
		if err != nil {
			return nil, err
		}
		execType = "script"
		scriptSlug = sc.Slug
		scriptName = sc.Name
		if commandToRun == "" {
			commandToRun = sc.ScriptContent
		}
		if req.TimeoutSeconds > 0 {
			timeoutSec = req.TimeoutSeconds
		} else if sc.TimeoutSeconds > 0 {
			timeoutSec = sc.TimeoutSeconds
		}
	}

	if commandToRun == "" {
		return nil, errors.New("command or script content is required")
	}

	if !req.UseLocalhost && len(req.ServerIDs) == 0 {
		return nil, errors.New("select at least one target server or Local Control Plane")
	}

	type target struct {
		serverID *uuid.UUID
	}
	targets := make([]target, 0)
	if req.UseLocalhost {
		targets = append(targets, target{serverID: nil})
	}
	for _, srvID := range req.ServerIDs {
		sid := srvID
		targets = append(targets, target{serverID: &sid})
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]ExecutionJob, 0, len(targets))
	var firstErr error

	safeCallback := func(ev StreamLogEvent) {
		mu.Lock()
		defer mu.Unlock()
		if callback != nil {
			callback(ev)
		}
	}

	for _, tgt := range targets {
		t := tgt
		wg.Add(1)
		go func() {
			defer wg.Done()
			job, err := s.runOnTargetWithStream(
				ctx, t.serverID, userID,
				execType, scriptSlug, scriptName, commandToRun, timeoutSec,
				safeCallback,
			)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
			} else if job != nil {
				results = append(results, *job)
			}
		}()
	}

	wg.Wait()

	if len(results) == 0 && firstErr != nil {
		return nil, firstErr
	}

	return results, nil
}

func (s *PostgresExecutionService) runOnTargetWithStream(
	ctx context.Context,
	serverID *uuid.UUID,
	userID uuid.UUID,
	execType, scriptSlug, scriptName, commandText string,
	timeoutSec int,
	callback func(StreamLogEvent),
) (*ExecutionJob, error) {
	start := time.Now().UTC()
	var srvName, srvHost string
	var stdoutBuf, stderrBuf bytes.Buffer
	exitCode := 0
	status := "success"
	var errMsg string

	jobID := uuid.New()

	if serverID == nil {
		srvName = "Local Control Plane"
		srvHost = "127.0.0.1"
	} else {
		_ = s.db.QueryRow(ctx, `SELECT name, hostname_or_ip FROM servers WHERE id = $1`, *serverID).Scan(&srvName, &srvHost)
		if srvName == "" {
			srvName = "Remote Server"
			srvHost = "unknown"
		}
	}

	if callback != nil {
		callback(StreamLogEvent{
			Type:       "start",
			JobID:      &jobID,
			ServerID:   serverID,
			ServerName: srvName,
			ServerHost: srvHost,
			Status:     "running",
		})
	}

	stdoutWriter := &streamWriter{
		buf:        &stdoutBuf,
		jobID:      jobID,
		serverID:   serverID,
		serverName: srvName,
		serverHost: srvHost,
		streamName: "stdout",
		callback:   callback,
	}

	stderrWriter := &streamWriter{
		buf:        &stderrBuf,
		jobID:      jobID,
		serverID:   serverID,
		serverName: srvName,
		serverHost: srvHost,
		streamName: "stderr",
		callback:   callback,
	}

	preparedScript := prepareExecutionScript(execType, commandText)

	if serverID == nil {
		// Execute on local control plane shell
		execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second)
		defer cancel()

		cmd := exec.CommandContext(execCtx, "bash", "-l")
		cmd.Stdin = strings.NewReader(preparedScript)
		cmd.Stdout = stdoutWriter
		cmd.Stderr = stderrWriter

		if err := cmd.Run(); err != nil {
			status = "failed"
			errMsg = err.Error()
			var exitErr *exec.ExitError
			if errors.As(err, &exitErr) {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = 1
			}
		}
	} else {
		// Execute on remote server over SSH
		srv, sshClient, _, err := s.dialSSHServer(ctx, *serverID)
		if err != nil {
			status = "failed"
			exitCode = 255
			errMsg = err.Error()
			stderrWriter.Write([]byte(fmt.Sprintf("SSH connection to %s (%s) failed: %s\n", srvName, srvHost, err.Error())))
		} else {
			defer sshClient.Close()
			srvName = srv.Name
			srvHost = srv.HostnameOrIP
			stdoutWriter.serverName = srvName
			stdoutWriter.serverHost = srvHost
			stderrWriter.serverName = srvName
			stderrWriter.serverHost = srvHost

			session, err := sshClient.NewSession()
			if err != nil {
				status = "failed"
				exitCode = 255
				errMsg = fmt.Sprintf("failed to open SSH session: %v", err)
				stderrWriter.Write([]byte(errMsg + "\n"))
			} else {
				defer session.Close()
				session.Stdout = stdoutWriter
				session.Stderr = stderrWriter
				session.Stdin = strings.NewReader(preparedScript)

				doneCh := make(chan error, 1)
				go func() {
					// Use login bash if available, falling back to sh
					doneCh <- session.Run("command -v bash >/dev/null 2>&1 && exec bash -l -s || exec sh -s")
				}()

				select {
				case runErr := <-doneCh:
					if runErr != nil {
						status = "failed"
						errMsg = runErr.Error()
						var sshExitErr *ssh.ExitError
						if errors.As(runErr, &sshExitErr) {
							exitCode = sshExitErr.ExitStatus()
						} else {
							exitCode = 1
						}
					}
				case <-time.After(time.Duration(timeoutSec) * time.Second):
					status = "failed"
					exitCode = 124
					errMsg = fmt.Sprintf("execution timed out after %d seconds", timeoutSec)
					stderrWriter.Write([]byte("\n" + errMsg + "\n"))
				case <-ctx.Done():
					status = "failed"
					exitCode = 130
					errMsg = "execution cancelled by client"
					stderrWriter.Write([]byte("\n" + errMsg + "\n"))
				}
			}
		}
	}

	completed := time.Now().UTC()
	durationMs := completed.Sub(start).Milliseconds()

	insertQuery := `
		INSERT INTO execution_jobs (
			id, server_id, server_name, server_host, requested_by_user_id,
			execution_type, script_slug, script_name, command_text,
			status, exit_code, stdout, stderr, error_message,
			duration_ms, queued_at, started_at, completed_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9,
			$10, $11, $12, $13, $14,
			$15, $16, $16, $17, $16, $17
		)
	`
	_, err := s.db.Exec(context.Background(), insertQuery,
		jobID, serverID, srvName, srvHost, userID,
		execType, scriptSlug, scriptName, commandText,
		status, exitCode, stdoutBuf.String(), stderrBuf.String(), errMsg,
		durationMs, start, completed,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to persist execution job: %w", err)
	}

	if callback != nil {
		callback(StreamLogEvent{
			Type:       "done",
			JobID:      &jobID,
			ServerID:   serverID,
			ServerName: srvName,
			ServerHost: srvHost,
			ExitCode:   &exitCode,
			Status:     status,
			DurationMs: durationMs,
			Error:      errMsg,
		})
	}

	return s.GetExecution(context.Background(), jobID)
}
