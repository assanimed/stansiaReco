package servers

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"text/template"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ServerActionDefinition struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Command     string `json:"command"`
	IsDangerous bool   `json:"is_dangerous"`
}

type MTAInstallOptions struct {
	Software        string `json:"software"` // "postfix", "powermta"
	Hostname        string `json:"hostname"`
	Domain          string `json:"domain"`
	EnableTLS       bool   `json:"enable_tls"`
	SetupOpenDKIM   bool   `json:"setup_opendkim"`
	DisableIPv6     bool   `json:"disable_ipv6"`
}

type ActionService interface {
	GetStandardActions() []ServerActionDefinition
	GenerateMTAInstallScript(ctx context.Context, serverID uuid.UUID, opts MTAInstallOptions) (string, error)
}

type PostgresActionService struct {
	db *pgxpool.Pool
}

func NewPostgresActionService(db *pgxpool.Pool) *PostgresActionService {
	return &PostgresActionService{db: db}
}

func (s *PostgresActionService) GetStandardActions() []ServerActionDefinition {
	return []ServerActionDefinition{
		{
			ID:          "check_mta_status",
			Name:        "Check MTA Service Status",
			Description: "Verify if Postfix or PowerMTA daemon is active and running",
			Command:     "systemctl status postfix 2>/dev/null || systemctl status pmta 2>/dev/null || echo 'MTA daemon not found'",
			IsDangerous: false,
		},
		{
			ID:          "check_mail_queue",
			Name:        "Check Mail Queue Summary",
			Description: "Inspect pending, active, and deferred message queues",
			Command:     "mailq 2>/dev/null || postqueue -p 2>/dev/null || pmta show queue 2>/dev/null || echo 'No queue utility available'",
			IsDangerous: false,
		},
		{
			ID:          "flush_mail_queue",
			Name:        "Flush Deferred Mail Queue",
			Description: "Attempt immediate delivery of all deferred messages in queue",
			Command:     "postfix flush 2>/dev/null || postqueue -f 2>/dev/null || echo 'Postfix not present'",
			IsDangerous: false,
		},
		{
			ID:          "clear_deferred_queue",
			Name:        "Purge Deferred Queue",
			Description: "Delete un-deliverable or bouncing messages from deferred queue",
			Command:     "postsuper -d ALL deferred 2>/dev/null || echo 'postsuper not available'",
			IsDangerous: true,
		},
		{
			ID:          "restart_mta",
			Name:        "Restart MTA Daemon",
			Description: "Gracefully restart Postfix / PowerMTA mail transfer agent",
			Command:     "systemctl restart postfix 2>/dev/null || systemctl restart pmta 2>/dev/null",
			IsDangerous: false,
		},
		{
			ID:          "test_port_25_outbound",
			Name:        "Test Outbound Port 25",
			Description: "Test outbound connectivity to public mail servers on TCP port 25",
			Command:     `timeout 4 bash -c 'cat < /dev/null > /dev/tcp/smtp.gmail.com/25' 2>/dev/null && echo "PORT 25 OPEN: Connection succeeded" || echo "PORT 25 BLOCKED: Could not connect to outbound port 25"`,
			IsDangerous: false,
		},
		{
			ID:          "check_system_resources",
			Name:        "Check Resources & Load",
			Description: "Inspect CPU load, RAM usage, and disk space for mail spools",
			Command:     "uptime; free -m; df -h / /var/spool",
			IsDangerous: false,
		},
		{
			ID:          "view_mail_log_tail",
			Name:        "Tail Recent Mail Logs",
			Description: "View last 50 lines of mail delivery and bounce logs",
			Command:     "tail -n 50 /var/log/mail.log 2>/dev/null || tail -n 50 /var/log/maillog 2>/dev/null || journalctl -u postfix -n 50 --no-pager",
			IsDangerous: false,
		},
	}
}

const postfixInstallScript = `#!/usr/bin/env bash
# ==============================================================================
# StansiaReco Automated Postfix Installation & Hardening Script
# Target Server: {{ .ServerName }} ({{ .ServerIP }})
# Mail Hostname: {{ .Hostname }}
# Domain: {{ .Domain }}
# ==============================================================================
set -euo pipefail

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; exit 1; }

if [ "$EUID" -ne 0 ]; then
    error "Please execute this script as root"
fi

log "1. Updating repositories and installing Postfix..."
if command -v apt-get &>/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    debconf-set-selections <<< "postfix postfix/mailname string {{ .Hostname }}"
    debconf-set-selections <<< "postfix postfix/main_mailer_type string 'Internet Site'"
    apt-get update -qq
    apt-get install -y postfix mailutils libsasl2-modules bsd-mailx {{ if .SetupOpenDKIM }}opendkim opendkim-tools{{ end }}
elif command -v dnf &>/dev/null; then
    dnf install -y postfix mailx cyrus-sasl cyrus-sasl-plain {{ if .SetupOpenDKIM }}opendkim{{ end }}
else
    yum install -y postfix mailx cyrus-sasl cyrus-sasl-plain
fi

log "2. Configuring Postfix main.cf..."
postconf -e "myhostname = {{ .Hostname }}"
postconf -e "mydomain = {{ .Domain }}"
postconf -e "myorigin = \$mydomain"
postconf -e "inet_interfaces = all"
{{ if .DisableIPv6 }}
postconf -e "inet_protocols = ipv4"
{{ else }}
postconf -e "inet_protocols = all"
{{ end }}
postconf -e "mydestination = \$myhostname, localhost.\$mydomain, localhost"
postconf -e "mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128"
postconf -e "smtpd_banner = \$myhostname ESMTP"
postconf -e "biff = no"
postconf -e "append_dot_mydomain = no"
postconf -e "recipient_delimiter = +"

# Outbound delivery tuning
postconf -e "smtp_helo_name = {{ .Hostname }}"
postconf -e "smtp_tls_security_level = may"
postconf -e "smtp_tls_loglevel = 1"
postconf -e "default_destination_concurrency_limit = 10"
postconf -e "smtp_destination_rate_delay = 0s"

log "3. Initializing sender-dependent transport maps..."
touch /etc/postfix/sender_dependent_transport_maps
postconf -e "sender_dependent_default_transport_maps = hash:/etc/postfix/sender_dependent_transport_maps"
postmap /etc/postfix/sender_dependent_transport_maps

log "4. Enabling and starting Postfix service..."
systemctl enable postfix
systemctl restart postfix

log "5. Verifying MTA listener status..."
if ss -tulpn | grep -q ':25 '; then
    log "✅ Postfix is active and listening on port 25!"
else
    log "⚠️ Warning: Postfix started, but port 25 listener was not immediately detected."
fi

log "🎉 Postfix installation and baseline configuration complete!"
`

type installTemplateData struct {
	ServerName    string
	ServerIP      string
	Hostname      string
	Domain        string
	EnableTLS     bool
	SetupOpenDKIM bool
	DisableIPv6   bool
}

func (s *PostgresActionService) GenerateMTAInstallScript(ctx context.Context, serverID uuid.UUID, opts MTAInstallOptions) (string, error) {
	var srv MTAServer
	err := s.db.QueryRow(ctx, "SELECT id, name, hostname_or_ip, COALESCE(main_ip, hostname_or_ip) FROM servers WHERE id = $1", serverID).
		Scan(&srv.ID, &srv.Name, &srv.HostnameOrIP, &srv.MainIP)
	if err != nil {
		return "", fmt.Errorf("failed to load server: %w", err)
	}

	hostname := strings.TrimSpace(opts.Hostname)
	if hostname == "" {
		hostname = srv.Name
	}
	domain := strings.TrimSpace(opts.Domain)
	if domain == "" {
		parts := strings.Split(hostname, ".")
		if len(parts) >= 2 {
			domain = strings.Join(parts[len(parts)-2:], ".")
		} else {
			domain = hostname
		}
	}

	data := installTemplateData{
		ServerName:    srv.Name,
		ServerIP:      srv.MainIP,
		Hostname:      hostname,
		Domain:        domain,
		EnableTLS:     opts.EnableTLS,
		SetupOpenDKIM: opts.SetupOpenDKIM,
		DisableIPv6:   opts.DisableIPv6,
	}

	tmpl, err := template.New("install").Parse(postfixInstallScript)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}

	// Update server record marking mta_installed = true
	_, _ = s.db.Exec(ctx, "UPDATE servers SET mta_installed = true, mta_software = $1, updated_at = NOW() WHERE id = $2", opts.Software, serverID)

	return buf.String(), nil
}
