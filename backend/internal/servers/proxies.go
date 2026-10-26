package servers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"text/template"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrProxyNotFound = errors.New("proxy configuration not found for server")
)

type ProxyServer struct {
	ID                uuid.UUID  `json:"id"`
	ServerID          uuid.UUID  `json:"server_id"`
	ServerName        string     `json:"server_name,omitempty"`
	ServerIP          string     `json:"server_ip,omitempty"`
	HTTPProxyEnabled  bool       `json:"http_proxy_enabled"`
	HTTPProxyPort     int        `json:"http_proxy_port"`
	SOCKSProxyEnabled bool       `json:"socks_proxy_enabled"`
	SOCKSProxyPort    int        `json:"socks_proxy_port"`
	AuthUser          string     `json:"auth_user"`
	AuthPassword      string     `json:"auth_password"`
	Status            string     `json:"status"` // "running", "stopped", "failed"
	LastCheckedAt     *time.Time `json:"last_checked_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

type UpdateProxyConfigRequest struct {
	HTTPProxyEnabled  bool   `json:"http_proxy_enabled"`
	HTTPProxyPort     int    `json:"http_proxy_port"`
	SOCKSProxyEnabled bool   `json:"socks_proxy_enabled"`
	SOCKSProxyPort    int    `json:"socks_proxy_port"`
	AuthUser          string `json:"auth_user"`
	AuthPassword      string `json:"auth_password"`
}

type ProxyService interface {
	GetProxy(ctx context.Context, serverID uuid.UUID) (*ProxyServer, error)
	ListProxies(ctx context.Context) ([]ProxyServer, error)
	UpdateProxy(ctx context.Context, serverID uuid.UUID, req UpdateProxyConfigRequest) (*ProxyServer, error)
	GenerateInstallScript(ctx context.Context, serverID uuid.UUID) (string, error)
}

type PostgresProxyService struct {
	db *pgxpool.Pool
}

func NewPostgresProxyService(db *pgxpool.Pool) *PostgresProxyService {
	return &PostgresProxyService{db: db}
}

func (s *PostgresProxyService) GetProxy(ctx context.Context, serverID uuid.UUID) (*ProxyServer, error) {
	query := `
		SELECT 
			p.id, p.server_id, s.name, COALESCE(s.main_ip, s.hostname_or_ip),
			p.http_proxy_enabled, p.http_proxy_port,
			p.socks_proxy_enabled, p.socks_proxy_port,
			p.auth_user, p.auth_password, p.status,
			p.last_checked_at, p.created_at, p.updated_at
		FROM proxy_servers p
		JOIN servers s ON p.server_id = s.id
		WHERE p.server_id = $1
	`
	var px ProxyServer
	err := s.db.QueryRow(ctx, query, serverID).Scan(
		&px.ID, &px.ServerID, &px.ServerName, &px.ServerIP,
		&px.HTTPProxyEnabled, &px.HTTPProxyPort,
		&px.SOCKSProxyEnabled, &px.SOCKSProxyPort,
		&px.AuthUser, &px.AuthPassword, &px.Status,
		&px.LastCheckedAt, &px.CreatedAt, &px.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Auto create default if not exists
			return s.createDefault(ctx, serverID)
		}
		return nil, fmt.Errorf("failed to get proxy config: %w", err)
	}
	return &px, nil
}

func (s *PostgresProxyService) createDefault(ctx context.Context, serverID uuid.UUID) (*ProxyServer, error) {
	id := uuid.New()
	query := `
		INSERT INTO proxy_servers (
			id, server_id, http_proxy_enabled, http_proxy_port,
			socks_proxy_enabled, socks_proxy_port, auth_user, auth_password,
			status, created_at, updated_at
		) VALUES (
			$1, $2, false, 3128, false, 1080, 'proxyuser', 'SecretProxyPass123!', 'stopped', NOW(), NOW()
		)
		ON CONFLICT (server_id) DO NOTHING
	`
	_, err := s.db.Exec(ctx, query, id, serverID)
	if err != nil {
		return nil, fmt.Errorf("failed to insert default proxy: %w", err)
	}
	return s.GetProxy(ctx, serverID)
}

func (s *PostgresProxyService) ListProxies(ctx context.Context) ([]ProxyServer, error) {
	query := `
		SELECT 
			p.id, p.server_id, s.name, COALESCE(s.main_ip, s.hostname_or_ip),
			p.http_proxy_enabled, p.http_proxy_port,
			p.socks_proxy_enabled, p.socks_proxy_port,
			p.auth_user, p.auth_password, p.status,
			p.last_checked_at, p.created_at, p.updated_at
		FROM proxy_servers p
		JOIN servers s ON p.server_id = s.id
		ORDER BY s.name ASC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list proxy configs: %w", err)
	}
	defer rows.Close()

	var list []ProxyServer
	for rows.Next() {
		var px ProxyServer
		err := rows.Scan(
			&px.ID, &px.ServerID, &px.ServerName, &px.ServerIP,
			&px.HTTPProxyEnabled, &px.HTTPProxyPort,
			&px.SOCKSProxyEnabled, &px.SOCKSProxyPort,
			&px.AuthUser, &px.AuthPassword, &px.Status,
			&px.LastCheckedAt, &px.CreatedAt, &px.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan proxy: %w", err)
		}
		list = append(list, px)
	}
	if list == nil {
		list = []ProxyServer{}
	}
	return list, nil
}

func (s *PostgresProxyService) UpdateProxy(ctx context.Context, serverID uuid.UUID, req UpdateProxyConfigRequest) (*ProxyServer, error) {
	if req.HTTPProxyPort <= 0 {
		req.HTTPProxyPort = 3128
	}
	if req.SOCKSProxyPort <= 0 {
		req.SOCKSProxyPort = 1080
	}
	req.AuthUser = strings.TrimSpace(req.AuthUser)
	if req.AuthUser == "" {
		req.AuthUser = "proxyuser"
	}
	if req.AuthPassword == "" {
		req.AuthPassword = "SecretProxyPass123!"
	}

	query := `
		INSERT INTO proxy_servers (
			id, server_id, http_proxy_enabled, http_proxy_port,
			socks_proxy_enabled, socks_proxy_port, auth_user, auth_password,
			status, updated_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'configured', NOW()
		)
		ON CONFLICT (server_id)
		DO UPDATE SET
			http_proxy_enabled = EXCLUDED.http_proxy_enabled,
			http_proxy_port = EXCLUDED.http_proxy_port,
			socks_proxy_enabled = EXCLUDED.socks_proxy_enabled,
			socks_proxy_port = EXCLUDED.socks_proxy_port,
			auth_user = EXCLUDED.auth_user,
			auth_password = EXCLUDED.auth_password,
			status = 'configured',
			updated_at = NOW()
	`
	_, err := s.db.Exec(ctx, query,
		serverID, req.HTTPProxyEnabled, req.HTTPProxyPort,
		req.SOCKSProxyEnabled, req.SOCKSProxyPort,
		req.AuthUser, req.AuthPassword,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update proxy config: %w", err)
	}

	return s.GetProxy(ctx, serverID)
}

const proxyScriptTemplate = `#!/usr/bin/env bash
# ==============================================================================
# StansiaReco Automated Proxy Deployment Script
# HTTP Proxy: Squid (Port: {{ .HTTPPort }}) | SOCKS5 Proxy: Dante (Port: {{ .SOCKSPort }})
# Target Server: {{ .ServerName }} ({{ .ServerIP }})
# ==============================================================================
set -euo pipefail

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; exit 1; }

if [ "$EUID" -ne 0 ]; then
    error "Please execute as root or with sudo"
fi

DEFAULT_IFACE=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++)if($i=="dev"){print $(i+1);break}}' || echo "eth0")
log "Detected primary outbound interface: $DEFAULT_IFACE"

# 1. Package Installation
log "Installing dependencies (Squid, Dante server, Apache tools)..."
if command -v apt-get &>/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y squid dante-server apache2-utils
elif command -v dnf &>/dev/null; then
    dnf install -y epel-release || true
    dnf install -y squid dante-server httpd-tools
elif command -v yum &>/dev/null; then
    yum install -y epel-release || true
    yum install -y squid dante-server httpd-tools
else
    error "Unsupported Linux distribution"
fi

# ==============================================================================
# 2. Configure Squid (HTTP Proxy)
# ==============================================================================
{{ if .HTTPEnabled }}
log "Configuring Squid HTTP Proxy on port {{ .HTTPPort }}..."
mkdir -p /etc/squid
htpasswd -b -c /etc/squid/passwords "{{ .AuthUser }}" "{{ .AuthPassword }}"
chmod 640 /etc/squid/passwords
chown root:proxy /etc/squid/passwords 2>/dev/null || chown root:squid /etc/squid/passwords 2>/dev/null || true

# Locate basic_ncsa_auth binary
AUTH_HELPER=""
for p in /usr/lib/squid/basic_ncsa_auth /usr/lib64/squid/basic_ncsa_auth /usr/lib/squid3/basic_ncsa_auth; do
    if [ -f "$p" ]; then AUTH_HELPER="$p"; break; fi
done
if [ -z "$AUTH_HELPER" ]; then
    AUTH_HELPER="/usr/lib/squid/basic_ncsa_auth"
fi

cat << 'EOF_SQUID' > /etc/squid/squid.conf
# StansiaReco Squid Configuration
auth_param basic program __AUTH_HELPER__ /etc/squid/passwords
auth_param basic realm StansiaReco Authenticated HTTP Proxy
auth_param basic credentialsttl 2 hours
auth_param basic casesensitive on

acl authenticated proxy_auth REQUIRED
acl SSL_ports port 443 8443
acl Safe_ports port 80 21 443 70 210 1025-65535

http_access deny !Safe_ports
http_access allow authenticated
http_access deny all

http_port {{ .HTTPPort }}
coredump_dir /var/spool/squid
via off
forwarded_for delete
request_header_access From deny all
request_header_access Server deny all
request_header_access User-Agent allow all
EOF_SQUID

sed -i "s|__AUTH_HELPER__|$AUTH_HELPER|g" /etc/squid/squid.conf

systemctl restart squid
systemctl enable squid
log "✅ Squid HTTP Proxy started on port {{ .HTTPPort }}"
{{ else }}
log "Squid HTTP Proxy is disabled. Stopping service..."
systemctl stop squid 2>/dev/null || true
systemctl disable squid 2>/dev/null || true
{{ end }}

# ==============================================================================
# 3. Configure Dante (SOCKS5 Proxy)
# ==============================================================================
{{ if .SOCKSEnabled }}
log "Configuring Dante SOCKS5 Proxy on port {{ .SOCKSPort }}..."

# Create system user for Dante authentication if missing
if ! id "{{ .AuthUser }}" &>/dev/null; then
    useradd -M -s /usr/sbin/nologin "{{ .AuthUser }}" 2>/dev/null || useradd -M -s /bin/false "{{ .AuthUser }}"
fi
echo "{{ .AuthUser }}:{{ .AuthPassword }}" | chpasswd

cat << 'EOF_DANTE' > /etc/danted.conf
# StansiaReco Dante SOCKS5 Proxy Configuration
logoutput: /var/log/danted.log
internal: 0.0.0.0 port = {{ .SOCKSPort }}
external: __IFACE__

socksmethod: username
clientmethod: none

user.privileged: root
user.unprivileged: nobody

client pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    log: error
}

socks pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    command: bind connect udpassociate
    log: error
    socksmethod: username
}
EOF_DANTE

sed -i "s|__IFACE__|$DEFAULT_IFACE|g" /etc/danted.conf

systemctl restart danted
systemctl enable danted
log "✅ Dante SOCKS5 Proxy started on port {{ .SOCKSPort }}"
{{ else }}
log "Dante SOCKS5 Proxy is disabled. Stopping service..."
systemctl stop danted 2>/dev/null || true
systemctl disable danted 2>/dev/null || true
{{ end }}

log "🎉 Proxy setup finished successfully!"
`

type proxyTemplateData struct {
	ServerName   string
	ServerIP     string
	HTTPEnabled  bool
	HTTPPort     int
	SOCKSEnabled bool
	SOCKSPort    int
	AuthUser     string
	AuthPassword string
}

func (s *PostgresProxyService) GenerateInstallScript(ctx context.Context, serverID uuid.UUID) (string, error) {
	px, err := s.GetProxy(ctx, serverID)
	if err != nil {
		return "", err
	}

	tmpl, err := template.New("proxy").Parse(proxyScriptTemplate)
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %w", err)
	}

	data := proxyTemplateData{
		ServerName:   px.ServerName,
		ServerIP:     px.ServerIP,
		HTTPEnabled:  px.HTTPProxyEnabled,
		HTTPPort:     px.HTTPProxyPort,
		SOCKSEnabled: px.SOCKSProxyEnabled,
		SOCKSPort:    px.SOCKSProxyPort,
		AuthUser:     px.AuthUser,
		AuthPassword: px.AuthPassword,
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to render proxy script: %w", err)
	}

	return buf.String(), nil
}
