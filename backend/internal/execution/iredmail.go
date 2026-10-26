package execution

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/ssh"
	"stansiareco/backend/internal/domains"
)

func defaultIRedMailPipelineSteps() []IRedMailPipelineStep {
	return []IRedMailPipelineStep{
		{
			ID:          "os_check",
			Title:       "1. Verify Ubuntu 22.04+ OS",
			Description: "Connect via SSH and verify the remote server is running Ubuntu 22.04 LTS or higher.",
			Status:      "pending",
		},
		{
			ID:          "dns_resolve",
			Title:       "2. Enable Internet DNS (/etc/systemd/resolved.conf)",
			Description: "Configure Google & Cloudflare DNS (8.8.8.8, 1.1.1.1) and FallbackDNS (8.8.4.4, 1.0.0.1) in /etc/systemd/resolved.conf.",
			Status:      "pending",
		},
		{
			ID:          "docker_install",
			Title:       "3. Set Up Official Docker Apt Repo & Install Docker CE",
			Description: "Add Docker GPG key (/etc/apt/keyrings/docker.asc), configure /etc/apt/sources.list.d/docker.sources, install docker-ce packages, and verify systemctl status docker.",
			Status:      "pending",
		},
		{
			ID:          "config_setup",
			Title:       "4. Generate /iredmail/iredmail-docker.conf",
			Description: "Create /iredmail directory and populate iredmail-docker.conf with hostname, domain, admin password, and random secret keys.",
			Status:      "pending",
		},
		{
			ID:          "docker_deploy",
			Title:       "5. Launch iRedMail Container (iredmail/mariadb:stable)",
			Description: "Deploy the iRedMail Docker container with persistent volumes and mail ports (25, 80, 443, 110, 143, 465, 587, 993, 995).",
			Status:      "pending",
		},
		{
			ID:          "dns_core",
			Title:       "6. Configure A (mail), MX, SPF & DMARC Records",
			Description: "Provision A record for mail.<domain>, MX record, SPF TXT record, and DMARC _dmarc TXT record on the selected domain.",
			Status:      "pending",
		},
		{
			ID:          "dkim_extract",
			Title:       "7. Extract DKIM Key (docker exec iredmail amavisd-new showkeys)",
			Description: "Run 'docker exec iredmail amavisd-new showkeys' on the remote server and parse the generated 2048-bit DKIM public key.",
			Status:      "pending",
		},
		{
			ID:          "dns_dkim",
			Title:       "8. Publish DKIM DNS Record & Sync Registrar",
			Description: "Save the extracted DKIM TXT record (dkim._domainkey) and push all DNS records to the domain registrar (GoDaddy / Namecheap).",
			Status:      "pending",
		},
	}
}

// IsUbuntu2204OrHigher returns true if the OS ID is "ubuntu" and VERSION_ID is >= 22.04.
func IsUbuntu2204OrHigher(osID, versionID string) bool {
	cleanID := strings.ToLower(strings.Trim(strings.TrimSpace(osID), `"'`))
	if cleanID != "ubuntu" {
		return false
	}

	cleanVer := strings.Trim(strings.TrimSpace(versionID), `"'`)
	if cleanVer == "" {
		return false
	}

	parts := strings.Split(cleanVer, ".")
	major, err := strconv.Atoi(parts[0])
	if err != nil {
		return false
	}

	minor := 0
	if len(parts) > 1 {
		minor, _ = strconv.Atoi(parts[1])
	}

	if major > 22 {
		return true
	}
	if major == 22 && minor >= 4 {
		return true
	}
	return false
}

var (
	dkimSelectorDomainRegex = regexp.MustCompile(`(?i)([a-z0-9_-]+)\._domainkey(?:\.([a-z0-9.-]+))?`)
	quotedTXTChunksRegex    = regexp.MustCompile(`"([^"]*)"`)
)

// ParseAmavisdShowKeys parses the output of `docker exec iredmail amavisd-new showkeys`
// and returns the DKIM selector (e.g. "dkim"), relative DNS host name (e.g. "dkim._domainkey"),
// and concatenated TXT record value (e.g. "v=DKIM1; p=MIIBIjANBgkqh...").
func ParseAmavisdShowKeys(rawOutput, domainName string) (selector string, hostName string, txtValue string, err error) {
	cleaned := strings.TrimSpace(rawOutput)
	if cleaned == "" {
		return "", "", "", errors.New("amavisd-new showkeys returned empty output")
	}

	domainName = strings.ToLower(strings.TrimSpace(domainName))
	selector = "dkim"

	// Find selector._domainkey.<domain> in the output
	matches := dkimSelectorDomainRegex.FindAllStringSubmatchIndex(cleaned, -1)
	selectedBlock := cleaned

	if len(matches) > 0 {
		chosenIdx := 0
		if domainName != "" {
			for i, m := range matches {
				if m[4] != -1 && m[5] != -1 {
					matchedDom := strings.TrimSuffix(strings.ToLower(cleaned[m[4]:m[5]]), ".")
					if matchedDom == domainName {
						chosenIdx = i
						break
					}
				}
			}
		}
		m := matches[chosenIdx]
		if m[2] != -1 && m[3] != -1 {
			sel := strings.TrimSpace(cleaned[m[2]:m[3]])
			if sel != "" {
				selector = sel
			}
		}
		startPos := m[0]
		endPos := len(cleaned)
		if chosenIdx+1 < len(matches) {
			endPos = matches[chosenIdx+1][0]
		}
		selectedBlock = cleaned[startPos:endPos]
	}

	hostName = selector + "._domainkey"

	// Extract all quoted strings inside TXT ( "..." "..." )
	quotedMatches := quotedTXTChunksRegex.FindAllStringSubmatch(selectedBlock, -1)
	if len(quotedMatches) > 0 {
		var sb strings.Builder
		for _, qm := range quotedMatches {
			sb.WriteString(qm[1])
		}
		txtValue = strings.TrimSpace(sb.String())
	} else {
		// Fallback if unquoted v=DKIM1; p=... is present
		idx := strings.Index(strings.ToUpper(selectedBlock), "V=DKIM1")
		if idx != -1 {
			rem := selectedBlock[idx:]
			rem = strings.TrimRight(rem, ")\r\n\t \"")
			txtValue = strings.Join(strings.Fields(rem), " ")
		}
	}

	if txtValue == "" || !strings.Contains(strings.ToUpper(txtValue), "V=DKIM1") || !strings.Contains(txtValue, "p=") {
		return "", "", "", fmt.Errorf("could not find valid v=DKIM1 public key in amavisd output")
	}

	return selector, hostName, txtValue, nil
}

func shellSingleQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func generateStrongPassword() string {
	b := make([]byte, 15)
	_, _ = rand.Read(b)
	s := base64.RawURLEncoding.EncodeToString(b)
	return "iRed" + s + "9!"
}

func (s *PostgresExecutionService) runRemoteSSHCommand(ctx context.Context, serverID uuid.UUID, script string, timeoutSec int) (string, string, int, error) {
	_, sshClient, _, err := s.dialSSHServer(ctx, serverID)
	if err != nil {
		return "", "", 255, err
	}
	defer sshClient.Close()

	session, err := sshClient.NewSession()
	if err != nil {
		return "", "", 255, fmt.Errorf("failed to create SSH session: %w", err)
	}
	defer session.Close()

	var stdoutBuf, stderrBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	session.Stderr = &stderrBuf

	prepared := prepareExecutionScript("script", script)
	session.Stdin = strings.NewReader(prepared)

	if timeoutSec <= 0 {
		timeoutSec = 120
	}

	doneCh := make(chan error, 1)
	go func() {
		doneCh <- session.Run("command -v bash >/dev/null 2>&1 && exec bash -l -s || exec sh -s")
	}()

	select {
	case runErr := <-doneCh:
		exitCode := 0
		if runErr != nil {
			var sshExitErr *ssh.ExitError
			if errors.As(runErr, &sshExitErr) {
				exitCode = sshExitErr.ExitStatus()
			} else {
				exitCode = 1
			}
		}
		return stdoutBuf.String(), stderrBuf.String(), exitCode, runErr
	case <-time.After(time.Duration(timeoutSec) * time.Second):
		return stdoutBuf.String(), stderrBuf.String(), 124, fmt.Errorf("SSH command timed out after %d seconds", timeoutSec)
	case <-ctx.Done():
		return stdoutBuf.String(), stderrBuf.String(), 130, ctx.Err()
	}
}

// CheckServerUbuntuOS connects to the selected MTA server over SSH and checks if it is running Ubuntu 22.04 or higher.
func (s *PostgresExecutionService) CheckServerUbuntuOS(ctx context.Context, serverID uuid.UUID) (*IRedMailOSCheckResult, error) {
	var srvName, srvHost, mainIP string
	err := s.db.QueryRow(ctx, `
		SELECT name, hostname_or_ip, COALESCE(NULLIF(main_ip, ''), hostname_or_ip)
		FROM servers WHERE id = $1
	`, serverID).Scan(&srvName, &srvHost, &mainIP)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("target server not found")
		}
		return nil, fmt.Errorf("failed to load server: %w", err)
	}

	res := &IRedMailOSCheckResult{
		ServerID:   serverID,
		ServerName: srvName,
		ServerIP:   mainIP,
	}

	checkScript := `
if [ -f /etc/os-release ]; then
  . /etc/os-release
  echo "OS_ID=${ID}"
  echo "OS_VERSION_ID=${VERSION_ID}"
  echo "OS_PRETTY_NAME=${PRETTY_NAME}"
else
  echo "OS_ID=unknown"
  echo "OS_VERSION_ID="
  echo "OS_PRETTY_NAME=$(uname -s -r)"
fi
if command -v docker >/dev/null 2>&1; then
  echo "DOCKER_INSTALLED=true"
  echo "DOCKER_VERSION=$(docker --version 2>/dev/null | head -n 1)"
else
  echo "DOCKER_INSTALLED=false"
fi
`
	stdout, stderr, _, sshErr := s.runRemoteSSHCommand(ctx, serverID, checkScript, 25)
	if sshErr != nil && strings.TrimSpace(stdout) == "" {
		res.Reachable = false
		errDetail := strings.TrimSpace(stderr)
		if errDetail == "" {
			errDetail = sshErr.Error()
		}
		res.Message = fmt.Sprintf("Failed to connect to %s (%s) over SSH: %s", srvName, srvHost, errDetail)
		return res, nil
	}

	res.Reachable = true
	for _, line := range strings.Split(stdout, "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "OS_ID="):
			res.OSID = strings.Trim(strings.TrimPrefix(line, "OS_ID="), `"'`)
		case strings.HasPrefix(line, "OS_VERSION_ID="):
			res.OSVersion = strings.Trim(strings.TrimPrefix(line, "OS_VERSION_ID="), `"'`)
		case strings.HasPrefix(line, "OS_PRETTY_NAME="):
			res.OSPrettyName = strings.Trim(strings.TrimPrefix(line, "OS_PRETTY_NAME="), `"'`)
		case strings.HasPrefix(line, "DOCKER_INSTALLED="):
			res.DockerInstalled = strings.EqualFold(strings.TrimPrefix(line, "DOCKER_INSTALLED="), "true")
		case strings.HasPrefix(line, "DOCKER_VERSION="):
			res.DockerVersion = strings.TrimSpace(strings.TrimPrefix(line, "DOCKER_VERSION="))
		}
	}

	if res.OSPrettyName == "" {
		res.OSPrettyName = fmt.Sprintf("%s %s", res.OSID, res.OSVersion)
	}

	res.Supported = IsUbuntu2204OrHigher(res.OSID, res.OSVersion)
	if res.Supported {
		dockerNote := "Docker is already installed."
		if !res.DockerInstalled {
			dockerNote = "Docker will be installed automatically during Step 1."
		} else if res.DockerVersion != "" {
			dockerNote = res.DockerVersion + " is installed."
		}
		res.Message = fmt.Sprintf("Verified %s (Ubuntu %s >= 22.04 requirement met). %s", res.OSPrettyName, res.OSVersion, dockerNote)
	} else {
		res.Message = fmt.Sprintf("Unsupported OS detected: %s. iRedMail deployment requires Ubuntu 22.04 LTS or higher.", res.OSPrettyName)
	}

	return res, nil
}

func (s *PostgresExecutionService) ListIRedMailServers(ctx context.Context) ([]IRedMailServer, error) {
	query := `
		SELECT
			i.id, i.server_id, COALESCE(srv.name, 'Deleted Server'),
			COALESCE(NULLIF(srv.main_ip, ''), srv.hostname_or_ip, ''),
			i.domain_id, COALESCE(d.domain_name, i.mail_domain),
			COALESCE(p.name, 'Manual / Custom'),
			i.hostname, i.mail_domain, i.admin_email, i.encrypted_admin_password,
			i.os_name, i.os_version, i.container_name, i.container_id,
			i.dkim_selector, i.dkim_host, i.dkim_value, i.dkim_raw_output,
			i.dns_a_configured, i.dns_mx_configured, i.dns_spf_configured,
			i.dns_dmarc_configured, i.dns_dkim_configured,
			i.status, i.current_step, i.pipeline_steps, i.error_message,
			i.created_by, i.started_at, i.completed_at, i.created_at, i.updated_at
		FROM iredmail_servers i
		LEFT JOIN servers srv ON srv.id = i.server_id
		LEFT JOIN domains d ON d.id = i.domain_id
		LEFT JOIN provider_integrations p ON p.id = d.integration_id
		ORDER BY i.created_at DESC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list iRedMail servers: %w", err)
	}
	defer rows.Close()

	list := make([]IRedMailServer, 0)
	for rows.Next() {
		item, err := s.scanIRedMailRow(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *item)
	}
	return list, nil
}

func (s *PostgresExecutionService) GetIRedMailServer(ctx context.Context, id uuid.UUID) (*IRedMailServer, error) {
	query := `
		SELECT
			i.id, i.server_id, COALESCE(srv.name, 'Deleted Server'),
			COALESCE(NULLIF(srv.main_ip, ''), srv.hostname_or_ip, ''),
			i.domain_id, COALESCE(d.domain_name, i.mail_domain),
			COALESCE(p.name, 'Manual / Custom'),
			i.hostname, i.mail_domain, i.admin_email, i.encrypted_admin_password,
			i.os_name, i.os_version, i.container_name, i.container_id,
			i.dkim_selector, i.dkim_host, i.dkim_value, i.dkim_raw_output,
			i.dns_a_configured, i.dns_mx_configured, i.dns_spf_configured,
			i.dns_dmarc_configured, i.dns_dkim_configured,
			i.status, i.current_step, i.pipeline_steps, i.error_message,
			i.created_by, i.started_at, i.completed_at, i.created_at, i.updated_at
		FROM iredmail_servers i
		LEFT JOIN servers srv ON srv.id = i.server_id
		LEFT JOIN domains d ON d.id = i.domain_id
		LEFT JOIN provider_integrations p ON p.id = d.integration_id
		WHERE i.id = $1
	`
	row := s.db.QueryRow(ctx, query, id)
	item, err := s.scanIRedMailRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrIRedMailNotFound
		}
		return nil, fmt.Errorf("failed to get iRedMail server: %w", err)
	}
	return item, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func (s *PostgresExecutionService) scanIRedMailRow(row rowScanner) (*IRedMailServer, error) {
	var item IRedMailServer
	var encPass []byte
	var stepsJSON []byte

	err := row.Scan(
		&item.ID, &item.ServerID, &item.ServerName, &item.ServerIP,
		&item.DomainID, &item.DomainName, &item.ProviderName,
		&item.Hostname, &item.MailDomain, &item.AdminEmail, &encPass,
		&item.OSName, &item.OSVersion, &item.ContainerName, &item.ContainerID,
		&item.DKIMSelector, &item.DKIMHost, &item.DKIMValue, &item.DKIMRawOutput,
		&item.DNSAConfigured, &item.DNSMXConfigured, &item.DNSSPFConfigured,
		&item.DNSDMARCConfigured, &item.DNSDKIMConfigured,
		&item.Status, &item.CurrentStep, &stepsJSON, &item.ErrorMessage,
		&item.CreatedBy, &item.StartedAt, &item.CompletedAt, &item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if len(encPass) > 0 && s.vault != nil {
		if plain, decErr := s.vault.Decrypt(encPass); decErr == nil {
			item.AdminPassword = string(plain)
		}
	}

	if len(stepsJSON) > 0 {
		_ = json.Unmarshal(stepsJSON, &item.PipelineSteps)
	}
	if len(item.PipelineSteps) == 0 {
		item.PipelineSteps = defaultIRedMailPipelineSteps()
	}

	item.WebmailURL = fmt.Sprintf("https://%s/mail/", item.Hostname)
	item.AdminPanelURL = fmt.Sprintf("https://%s/iredadmin/", item.Hostname)

	return &item, nil
}

// CreateIRedMailServer creates a new iRedMail deployment record and launches the 6-step provisioning pipeline asynchronously.
func (s *PostgresExecutionService) CreateIRedMailServer(
	ctx context.Context,
	req CreateIRedMailServerRequest,
	userID uuid.UUID,
) (*IRedMailServer, error) {
	if req.ServerID == uuid.Nil {
		return nil, errors.New("please select a target MTA server")
	}
	if req.DomainID == uuid.Nil {
		return nil, errors.New("please select a mail domain from your Domains list")
	}

	// Verify server exists
	var srvName, srvIP string
	err := s.db.QueryRow(ctx, `
		SELECT name, COALESCE(NULLIF(main_ip, ''), hostname_or_ip)
		FROM servers WHERE id = $1
	`, req.ServerID).Scan(&srvName, &srvIP)
	if err != nil {
		return nil, errors.New("selected MTA server does not exist")
	}

	// Verify domain exists
	var domainName string
	err = s.db.QueryRow(ctx, `SELECT domain_name FROM domains WHERE id = $1`, req.DomainID).Scan(&domainName)
	if err != nil {
		return nil, errors.New("selected domain does not exist")
	}
	domainName = strings.ToLower(strings.TrimSpace(domainName))

	hostname := strings.ToLower(strings.TrimSpace(req.Hostname))
	if hostname == "" {
		hostname = "mail." + domainName
	} else if !strings.Contains(hostname, ".") {
		hostname = hostname + "." + domainName
	}

	adminPass := strings.TrimSpace(req.AdminPassword)
	if adminPass == "" {
		adminPass = generateStrongPassword()
	}

	var encPass []byte
	if s.vault != nil {
		encPass, err = s.vault.Encrypt([]byte(adminPass))
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt admin password: %w", err)
		}
	}

	adminEmail := "postmaster@" + domainName
	steps := defaultIRedMailPipelineSteps()
	stepsJSON, _ := json.Marshal(steps)
	now := time.Now().UTC()

	var id uuid.UUID
	err = s.db.QueryRow(ctx, `
		INSERT INTO iredmail_servers (
			id, server_id, domain_id, hostname, mail_domain, admin_email,
			encrypted_admin_password, container_name, dkim_selector, dkim_host,
			status, current_step, pipeline_steps, created_by, started_at, created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, $5,
			$6, 'iredmail', 'dkim', 'dkim._domainkey',
			'running', 'os_check', $7, $8, $9, $9, $9
		) RETURNING id
	`, req.ServerID, req.DomainID, hostname, domainName, adminEmail, encPass, stepsJSON, userID, now).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("failed to create iRedMail deployment: %w", err)
	}

	// Launch asynchronous pipeline
	go s.executeIRedMailPipeline(id, adminPass)

	return s.GetIRedMailServer(ctx, id)
}

// RetryIRedMailServer resets and re-runs the deployment pipeline for an existing iRedMail server record.
func (s *PostgresExecutionService) RetryIRedMailServer(ctx context.Context, id uuid.UUID) (*IRedMailServer, error) {
	item, err := s.GetIRedMailServer(ctx, id)
	if err != nil {
		return nil, err
	}
	if item.Status == "running" {
		return item, nil
	}

	adminPass := item.AdminPassword
	if adminPass == "" {
		adminPass = generateStrongPassword()
		if s.vault != nil {
			if enc, encErr := s.vault.Encrypt([]byte(adminPass)); encErr == nil {
				_, _ = s.db.Exec(ctx, "UPDATE iredmail_servers SET encrypted_admin_password = $1 WHERE id = $2", enc, id)
			}
		}
	}

	steps := defaultIRedMailPipelineSteps()
	stepsJSON, _ := json.Marshal(steps)
	now := time.Now().UTC()

	_, err = s.db.Exec(ctx, `
		UPDATE iredmail_servers
		SET status = 'running',
		    current_step = 'os_check',
		    pipeline_steps = $1,
		    error_message = '',
		    started_at = $2,
		    completed_at = NULL,
		    updated_at = $2
		WHERE id = $3
	`, stepsJSON, now, id)
	if err != nil {
		return nil, fmt.Errorf("failed to reset iRedMail pipeline: %w", err)
	}

	go s.executeIRedMailPipeline(id, adminPass)

	return s.GetIRedMailServer(ctx, id)
}

// SyncIRedMailDNSAndDKIM re-extracts the DKIM key from the running iRedMail container and updates/pushes all DNS records.
func (s *PostgresExecutionService) SyncIRedMailDNSAndDKIM(ctx context.Context, id uuid.UUID) (*IRedMailServer, error) {
	item, err := s.GetIRedMailServer(ctx, id)
	if err != nil {
		return nil, err
	}

	// 1. Provision Core DNS (A, MX, SPF, DMARC)
	if _, err := s.provisionIRedMailCoreDNS(ctx, item); err != nil {
		return nil, fmt.Errorf("failed to provision core DNS records: %w", err)
	}

	// 2. Extract DKIM via docker exec iredmail amavisd-new showkeys
	selector, hostName, dkimVal, rawOut, err := s.extractIRedMailDKIMFromServer(ctx, item.ServerID, item.MailDomain, 3)
	if err != nil {
		return nil, err
	}

	// 3. Provision DKIM DNS record & push to registrar
	if _, err := s.provisionIRedMailDKIMDNS(ctx, item.DomainID, hostName, dkimVal); err != nil {
		return nil, fmt.Errorf("failed to save DKIM DNS record: %w", err)
	}

	_, _ = s.db.Exec(ctx, `
		UPDATE iredmail_servers
		SET dkim_selector = $1,
		    dkim_host = $2,
		    dkim_value = $3,
		    dkim_raw_output = $4,
		    dns_a_configured = true,
		    dns_mx_configured = true,
		    dns_spf_configured = true,
		    dns_dmarc_configured = true,
		    dns_dkim_configured = true,
		    updated_at = NOW()
		WHERE id = $5
	`, selector, hostName, dkimVal, rawOut, item.ID)

	return s.GetIRedMailServer(ctx, id)
}

// DeleteIRedMailServer removes the iRedMail deployment record and optionally removes the Docker container on the remote host.
func (s *PostgresExecutionService) DeleteIRedMailServer(ctx context.Context, id uuid.UUID, removeContainer bool) error {
	item, err := s.GetIRedMailServer(ctx, id)
	if err != nil {
		return err
	}

	if removeContainer && item.ServerID != uuid.Nil {
		go func(srvID uuid.UUID) {
			rmCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			_, _, _, _ = s.runRemoteSSHCommand(rmCtx, srvID, "sudo docker rm -f iredmail 2>/dev/null || docker rm -f iredmail 2>/dev/null || true", 15)
		}(item.ServerID)
	}

	res, err := s.db.Exec(ctx, "DELETE FROM iredmail_servers WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete iRedMail server record: %w", err)
	}
	if res.RowsAffected() == 0 {
		return ErrIRedMailNotFound
	}
	return nil
}

// -----------------------------------------------------------------------------
// Background 6-Step Provisioning Pipeline
// -----------------------------------------------------------------------------

func (s *PostgresExecutionService) executeIRedMailPipeline(deploymentID uuid.UUID, adminPassword string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	item, err := s.GetIRedMailServer(ctx, deploymentID)
	if err != nil {
		return
	}

	steps := defaultIRedMailPipelineSteps()

	saveProgress := func(currentStep string, status string, errMsg string) {
		stepsJSON, _ := json.Marshal(steps)
		var completedAt *time.Time
		if status == "completed" || status == "failed" {
			now := time.Now().UTC()
			completedAt = &now
		}
		_, _ = s.db.Exec(context.Background(), `
			UPDATE iredmail_servers
			SET current_step = $1,
			    status = $2,
			    pipeline_steps = $3,
			    error_message = $4,
			    completed_at = COALESCE($5, completed_at),
			    updated_at = NOW()
			WHERE id = $6
		`, currentStep, status, stepsJSON, errMsg, completedAt, deploymentID)
	}

	startStep := func(idx int) time.Time {
		now := time.Now().UTC()
		steps[idx].Status = "running"
		steps[idx].StartedAt = &now
		saveProgress(steps[idx].ID, "running", "")
		return now
	}

	completeStep := func(idx int, start time.Time, logs string) {
		now := time.Now().UTC()
		steps[idx].Status = "completed"
		steps[idx].CompletedAt = &now
		steps[idx].DurationMs = now.Sub(start).Milliseconds()
		steps[idx].Logs = strings.TrimSpace(logs)
		saveProgress(steps[idx].ID, "running", "")
	}

	failStep := func(idx int, start time.Time, logs string, err error) {
		now := time.Now().UTC()
		steps[idx].Status = "failed"
		steps[idx].CompletedAt = &now
		steps[idx].DurationMs = now.Sub(start).Milliseconds()
		errText := err.Error()
		if strings.TrimSpace(logs) != "" {
			steps[idx].Logs = strings.TrimSpace(logs) + "\n\n[ERROR] " + errText
		} else {
			steps[idx].Logs = "[ERROR] " + errText
		}
		saveProgress(steps[idx].ID, "failed", errText)
	}

	// =========================================================================
	// STEP 1 (index 0): Verify Ubuntu 22.04+ OS
	// =========================================================================
	t0 := startStep(0)
	osCheck, err := s.CheckServerUbuntuOS(ctx, item.ServerID)
	if err != nil {
		failStep(0, t0, "", err)
		return
	}
	if !osCheck.Reachable {
		failStep(0, t0, osCheck.Message, errors.New(osCheck.Message))
		return
	}

	_, _ = s.db.Exec(ctx, `
		UPDATE iredmail_servers SET os_name = $1, os_version = $2 WHERE id = $3
	`, osCheck.OSPrettyName, osCheck.OSVersion, deploymentID)

	if !osCheck.Supported {
		failStep(0, t0, osCheck.Message, errors.New(osCheck.Message))
		return
	}

	step0Logs := fmt.Sprintf("[OK] Connected to %s (%s)\n[OK] Detected OS: %s (Ubuntu %s >= 22.04 verified)\n",
		osCheck.ServerName, osCheck.ServerIP, osCheck.OSPrettyName, osCheck.OSVersion)
	completeStep(0, t0, step0Logs)

	// =========================================================================
	// STEP 2 (index 1): Enable Internet DNS (/etc/systemd/resolved.conf)
	// =========================================================================
	t1 := startStep(1)
	dnsResolveScript := `
set -e
sudo tee -a /etc/systemd/resolved.conf <<EOF
[Resolve]
DNS=8.8.8.8 1.1.1.1
FallbackDNS=8.8.4.4 1.0.0.1
EOF

sudo systemctl restart systemd-resolved 2>/dev/null || true
echo "[OK] /etc/systemd/resolved.conf updated with DNS=8.8.8.8 1.1.1.1 and FallbackDNS=8.8.4.4 1.0.0.1"
`
	outResolve, errResolve, _, rErr := s.runRemoteSSHCommand(ctx, item.ServerID, dnsResolveScript, 60)
	logsResolve := strings.TrimSpace(outResolve + "\n" + errResolve)
	if rErr != nil {
		failStep(1, t1, logsResolve, fmt.Errorf("failed to configure /etc/systemd/resolved.conf: %w", rErr))
		return
	}
	completeStep(1, t1, logsResolve)

	// =========================================================================
	// STEP 3 (index 2): Set Up Official Docker Apt Repo & Install Docker CE
	// =========================================================================
	t2 := startStep(2)
	installDockerScript := `
set -e
export DEBIAN_FRONTEND=noninteractive

# Add Docker's official GPG key:
sudo apt update
sudo apt install -y ca-certificates curl openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update

# Install the Docker packages:
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify that Docker is running:
sudo systemctl enable --now docker 2>/dev/null || true
sudo systemctl status docker --no-pager
`
	outDocker, errDocker, _, dErr := s.runRemoteSSHCommand(ctx, item.ServerID, installDockerScript, 600)
	logsDocker := strings.TrimSpace(outDocker + "\n" + errDocker)
	if dErr != nil {
		failStep(2, t2, logsDocker, fmt.Errorf("failed to set up Docker repository and install docker-ce: %w", dErr))
		return
	}
	completeStep(2, t2, logsDocker)

	// =========================================================================
	// STEP 4 (index 3): Create /iredmail & Generate iredmail-docker.conf
	// =========================================================================
	t3 := startStep(3)
	escapedHostname := shellSingleQuote(item.Hostname)
	escapedDomain := shellSingleQuote(item.MailDomain)
	escapedPass := shellSingleQuote(adminPassword)

	configScript := fmt.Sprintf(`
set -e
sudo mkdir -p /iredmail
cd /iredmail
sudo rm -f iredmail-docker.conf
sudo touch iredmail-docker.conf
sudo chmod 600 iredmail-docker.conf

sudo sh -c "echo HOSTNAME=%s >> /iredmail/iredmail-docker.conf"
sudo sh -c "echo FIRST_MAIL_DOMAIN=%s >> /iredmail/iredmail-docker.conf"
sudo sh -c "echo FIRST_MAIL_DOMAIN_ADMIN_PASSWORD=%s >> /iredmail/iredmail-docker.conf"
sudo sh -c "echo MLMMJADMIN_API_TOKEN=\$(openssl rand -base64 32) >> /iredmail/iredmail-docker.conf"
sudo sh -c "echo ROUNDCUBE_DES_KEY=\$(openssl rand -base64 24) >> /iredmail/iredmail-docker.conf"

echo "=== /iredmail/iredmail-docker.conf created ==="
sudo sed 's/FIRST_MAIL_DOMAIN_ADMIN_PASSWORD=.*/FIRST_MAIL_DOMAIN_ADMIN_PASSWORD=********/' /iredmail/iredmail-docker.conf
`, escapedHostname, escapedDomain, escapedPass)

	outConfig, errOutConfig, _, errConfig := s.runRemoteSSHCommand(ctx, item.ServerID, configScript, 60)
	logsConfig := strings.TrimSpace(outConfig + "\n" + errOutConfig)
	if errConfig != nil {
		failStep(3, t3, logsConfig, fmt.Errorf("failed to create /iredmail/iredmail-docker.conf: %w", errConfig))
		return
	}
	completeStep(3, t3, logsConfig)

	// =========================================================================
	// STEP 5 (index 4): Run iRedMail Docker Container (iredmail/mariadb:stable)
	// =========================================================================
	t4 := startStep(4)
	dockerRunScript := fmt.Sprintf(`
set -e
cd /iredmail

# Ensure persistent volume directories exist
sudo mkdir -p \
    /iredmail/data/backup-mysql \
    /iredmail/data/mailboxes \
    /iredmail/data/mlmmj \
    /iredmail/data/mlmmj-archive \
    /iredmail/data/imapsieve_copy \
    /iredmail/data/custom \
    /iredmail/data/ssl \
    /iredmail/data/mysql \
    /iredmail/data/clamav \
    /iredmail/data/sa_rules \
    /iredmail/data/postfix_queue

# Stop conflicting host mail/web daemons if running on ports 25/80/443
sudo systemctl stop postfix exim4 sendmail apache2 nginx 2>/dev/null || true
sudo systemctl disable postfix exim4 sendmail apache2 nginx 2>/dev/null || true

# Remove any existing container named iredmail before starting fresh
sudo docker rm -f iredmail 2>/dev/null || true

sudo docker run -d \
    --rm \
    --name iredmail \
    --env-file iredmail-docker.conf \
    --hostname %s \
    -p 80:80 \
    -p 443:443 \
    -p 110:110 \
    -p 995:995 \
    -p 143:143 \
    -p 993:993 \
    -p 25:25 \
    -p 465:465 \
    -p 587:587 \
    -v /iredmail/data/backup-mysql:/var/vmail/backup/mysql \
    -v /iredmail/data/mailboxes:/var/vmail/vmail1 \
    -v /iredmail/data/mlmmj:/var/vmail/mlmmj \
    -v /iredmail/data/mlmmj-archive:/var/vmail/mlmmj-archive \
    -v /iredmail/data/imapsieve_copy:/var/vmail/imapsieve_copy \
    -v /iredmail/data/custom:/opt/iredmail/custom \
    -v /iredmail/data/ssl:/opt/iredmail/ssl \
    -v /iredmail/data/mysql:/var/lib/mysql \
    -v /iredmail/data/clamav:/var/lib/clamav \
    -v /iredmail/data/sa_rules:/var/lib/spamassassin \
    -v /iredmail/data/postfix_queue:/var/spool/postfix \
    iredmail/mariadb:stable

sleep 2
CID=$(sudo docker ps --filter "name=^/iredmail$" --format "{{.ID}}")
echo "CONTAINER_ID=${CID}"
sudo docker ps --filter "name=^/iredmail$"
`, escapedHostname)

	outRun, errOutRun, _, errRun := s.runRemoteSSHCommand(ctx, item.ServerID, dockerRunScript, 600)
	logsRun := strings.TrimSpace(outRun + "\n" + errOutRun)
	if errRun != nil {
		failStep(4, t4, logsRun, fmt.Errorf("failed to launch iredmail/mariadb:stable container: %w", errRun))
		return
	}

	var containerID string
	for _, line := range strings.Split(outRun, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "CONTAINER_ID=") {
			containerID = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "CONTAINER_ID="))
		}
	}
	_, _ = s.db.Exec(ctx, "UPDATE iredmail_servers SET container_id = $1 WHERE id = $2", containerID, deploymentID)
	_, _ = s.db.Exec(ctx, "UPDATE servers SET mta_installed = true, mta_software = 'iredmail', updated_at = NOW() WHERE id = $1", item.ServerID)
	completeStep(4, t4, logsRun)

	// =========================================================================
	// STEP 6 (index 5): Provision Core DNS Records (A 'mail', MX, SPF, DMARC)
	// =========================================================================
	t5 := startStep(5)
	dnsLogs, errDNS := s.provisionIRedMailCoreDNS(ctx, item)
	if errDNS != nil {
		failStep(5, t5, dnsLogs, errDNS)
		return
	}
	_, _ = s.db.Exec(ctx, `
		UPDATE iredmail_servers
		SET dns_a_configured = true,
		    dns_mx_configured = true,
		    dns_spf_configured = true,
		    dns_dmarc_configured = true
		WHERE id = $1
	`, deploymentID)
	completeStep(5, t5, dnsLogs)

	// =========================================================================
	// STEP 7 (index 6): Extract DKIM Key (`docker exec iredmail amavisd-new showkeys`)
	// =========================================================================
	t6 := startStep(6)
	selector, dkimHost, dkimVal, rawShowKeys, errDKIM := s.extractIRedMailDKIMFromServer(ctx, item.ServerID, item.MailDomain, 12)
	if errDKIM != nil {
		failStep(6, t6, rawShowKeys, errDKIM)
		return
	}
	_, _ = s.db.Exec(ctx, `
		UPDATE iredmail_servers
		SET dkim_selector = $1,
		    dkim_host = $2,
		    dkim_value = $3,
		    dkim_raw_output = $4
		WHERE id = $5
	`, selector, dkimHost, dkimVal, rawShowKeys, deploymentID)

	step7Logs := fmt.Sprintf("$ sudo docker exec iredmail amavisd-new showkeys\n%s\n\n[OK] Parsed Selector: %s\n[OK] DNS Host: %s\n[OK] DKIM TXT Value: %s",
		strings.TrimSpace(rawShowKeys), selector, dkimHost, dkimVal)
	completeStep(6, t6, step7Logs)

	// =========================================================================
	// STEP 8 (index 7): Update DKIM on DNS Records & Sync to Registrar
	// =========================================================================
	t7 := startStep(7)
	dkimDNSLogs, errDKIMDNS := s.provisionIRedMailDKIMDNS(ctx, item.DomainID, dkimHost, dkimVal)
	if errDKIMDNS != nil {
		failStep(7, t7, dkimDNSLogs, errDKIMDNS)
		return
	}

	_, _ = s.db.Exec(ctx, `
		UPDATE iredmail_servers
		SET dns_dkim_configured = true
		WHERE id = $1
	`, deploymentID)

	now := time.Now().UTC()
	steps[7].Status = "completed"
	steps[7].CompletedAt = &now
	steps[7].DurationMs = now.Sub(t7).Milliseconds()
	steps[7].Logs = dkimDNSLogs
	saveProgress("dns_dkim", "completed", "")
}

func (s *PostgresExecutionService) provisionIRedMailCoreDNS(ctx context.Context, item *IRedMailServer) (string, error) {
	var logs strings.Builder

	serverIP := strings.TrimSpace(item.ServerIP)
	if serverIP == "" {
		return "", errors.New("server IP address is empty; cannot create A and SPF records")
	}

	// Determine relative host for hostname (e.g. "mail.example.com" -> "mail")
	mailSub := "mail"
	lowerHost := strings.ToLower(strings.TrimSpace(item.Hostname))
	lowerDom := strings.ToLower(strings.TrimSpace(item.MailDomain))
	if strings.HasSuffix(lowerHost, "."+lowerDom) {
		prefix := strings.TrimSuffix(lowerHost, "."+lowerDom)
		if prefix != "" {
			mailSub = prefix
		}
	}

	// 1. Upsert A record for 'mail' (e.g. mail.example.com -> serverIP)
	if err := s.upsertDomainRecord(ctx, item.DomainID, "A", mailSub, serverIP, 1800, nil); err != nil {
		return logs.String(), fmt.Errorf("failed to configure A record (%s -> %s): %w", mailSub, serverIP, err)
	}
	logs.WriteString(fmt.Sprintf("[OK] A Record configured: %s.%s -> %s (TTL 1800)\n", mailSub, item.MailDomain, serverIP))

	// 2. Upsert MX record (@ -> mail.example.com, priority 10)
	prio10 := 10
	if err := s.upsertDomainRecord(ctx, item.DomainID, "MX", "@", item.Hostname, 1800, &prio10); err != nil {
		return logs.String(), fmt.Errorf("failed to configure MX record (@ -> %s): %w", item.Hostname, err)
	}
	logs.WriteString(fmt.Sprintf("[OK] MX Record configured: @ -> %s (Priority 10, TTL 1800)\n", item.Hostname))

	// 3. Upsert / Merge SPF record (@ -> v=spf1 a mx ip4:<serverIP> ~all)
	spfValue := fmt.Sprintf("v=spf1 a mx ip4:%s ~all", serverIP)
	if s.domainService != nil {
		_, spfErr := s.domainService.DeploySPF(ctx, domains.DeploySPFRequest{
			DomainIDs: []uuid.UUID{item.DomainID},
			SPFRecord: spfValue,
			Mode:      "merge",
			TTL:       1800,
		})
		if spfErr != nil {
			return logs.String(), fmt.Errorf("failed to deploy SPF record: %w", spfErr)
		}
	} else {
		if err := s.upsertDomainRecord(ctx, item.DomainID, "TXT", "@", spfValue, 1800, nil); err != nil {
			return logs.String(), fmt.Errorf("failed to configure SPF record: %w", err)
		}
	}
	logs.WriteString(fmt.Sprintf("[OK] SPF TXT Record configured on @: %s\n", spfValue))

	// 4. Upsert DMARC record (_dmarc -> v=DMARC1; p=quarantine; rua=mailto:postmaster@<domain>; adkim=r; aspf=r)
	dmarcValue := fmt.Sprintf("v=DMARC1; p=quarantine; rua=mailto:postmaster@%s; adkim=r; aspf=r", item.MailDomain)
	if err := s.upsertDomainRecord(ctx, item.DomainID, "TXT", "_dmarc", dmarcValue, 1800, nil); err != nil {
		return logs.String(), fmt.Errorf("failed to configure DMARC record: %w", err)
	}
	logs.WriteString(fmt.Sprintf("[OK] DMARC TXT Record configured on _dmarc: %s\n", dmarcValue))

	return logs.String(), nil
}

func (s *PostgresExecutionService) extractIRedMailDKIMFromServer(
	ctx context.Context,
	serverID uuid.UUID,
	mailDomain string,
	maxAttempts int,
) (selector string, hostName string, dkimValue string, rawOutput string, err error) {
	if maxAttempts <= 0 {
		maxAttempts = 1
	}

	cmd := `sudo docker exec iredmail amavisd-new showkeys 2>&1 || sudo docker exec iredmail amavisd showkeys 2>&1`

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		stdout, stderr, _, _ := s.runRemoteSSHCommand(ctx, serverID, cmd, 30)
		combined := strings.TrimSpace(stdout + "\n" + stderr)
		rawOutput = combined

		sel, host, val, parseErr := ParseAmavisdShowKeys(combined, mailDomain)
		if parseErr == nil {
			return sel, host, val, combined, nil
		}

		if attempt < maxAttempts {
			select {
			case <-time.After(5 * time.Second):
			case <-ctx.Done():
				return "", "", "", rawOutput, ctx.Err()
			}
		} else {
			err = fmt.Errorf("failed to extract DKIM key via 'docker exec iredmail amavisd-new showkeys' after %d attempt(s): %v", maxAttempts, parseErr)
		}
	}

	return "", "", "", rawOutput, err
}

func (s *PostgresExecutionService) provisionIRedMailDKIMDNS(
	ctx context.Context,
	domainID uuid.UUID,
	dkimHost string,
	dkimValue string,
) (string, error) {
	var logs strings.Builder

	if err := s.upsertDomainRecord(ctx, domainID, "TXT", dkimHost, dkimValue, 1800, nil); err != nil {
		return "", fmt.Errorf("failed to save DKIM TXT record (%s): %w", dkimHost, err)
	}
	logs.WriteString(fmt.Sprintf("[OK] DKIM TXT Record saved to database: %s -> %s\n", dkimHost, dkimValue))

	if s.domainService != nil {
		if pushErr := s.domainService.PushDomainRecordsToProvider(ctx, domainID); pushErr != nil {
			logs.WriteString(fmt.Sprintf("[WARN] Registrar API sync returned warning: %v\n", pushErr))
		} else {
			logs.WriteString("[OK] Pushed all domain DNS records (A, MX, SPF, DMARC, DKIM) to registrar API (GoDaddy / Namecheap).\n")
		}
	}

	return logs.String(), nil
}

func (s *PostgresExecutionService) upsertDomainRecord(
	ctx context.Context,
	domainID uuid.UUID,
	recordType string,
	hostName string,
	recordValue string,
	ttl int,
	mxPriority *int,
) error {
	recordType = strings.ToUpper(strings.TrimSpace(recordType))
	hostName = strings.TrimSpace(hostName)
	recordValue = strings.TrimSpace(recordValue)
	if ttl <= 0 {
		ttl = 1800
	}

	var existingID uuid.UUID
	err := s.db.QueryRow(ctx, `
		SELECT id FROM dns_records
		WHERE domain_id = $1 AND UPPER(record_type) = $2 AND LOWER(host_name) = LOWER($3)
		LIMIT 1
	`, domainID, recordType, hostName).Scan(&existingID)

	if err == nil {
		_, updErr := s.db.Exec(ctx, `
			UPDATE dns_records
			SET record_value = $1, ttl = $2, mx_priority = $3, is_managed = true, updated_at = NOW()
			WHERE id = $4
		`, recordValue, ttl, mxPriority, existingID)
		return updErr
	}

	if errors.Is(err, pgx.ErrNoRows) {
		_, insErr := s.db.Exec(ctx, `
			INSERT INTO dns_records (
				id, domain_id, record_type, host_name, record_value,
				ttl, mx_priority, is_managed, created_at, updated_at
			) VALUES (
				gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW()
			)
		`, domainID, recordType, hostName, recordValue, ttl, mxPriority)
		return insErr
	}

	return err
}
