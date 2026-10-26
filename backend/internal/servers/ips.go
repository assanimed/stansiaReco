package servers

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"text/template"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/ssh"

	"stansiareco/backend/internal/credentials"
)

var (
	ErrServerIPNotFound = errors.New("server IP not found")
	ErrDuplicateIP      = errors.New("IP address already registered for this server")
)

type ServerIP struct {
	ID            uuid.UUID `json:"id"`
	ServerID      uuid.UUID `json:"server_id"`
	ServerName    string    `json:"server_name,omitempty"`
	IPAddress     string    `json:"ip_address"`
	SubnetCIDR    int       `json:"subnet_cidr"`
	Gateway       string    `json:"gateway,omitempty"`
	InterfaceName string    `json:"interface_name"`
	IsMain        bool      `json:"is_main"`
	IsConfigured  bool      `json:"is_configured"`
	RDNSHostname  string    `json:"rdns_hostname,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type AddServerIPRequest struct {
	ServerID      uuid.UUID `json:"server_id"`
	IPAddress     string    `json:"ip_address"`
	SubnetCIDR    int       `json:"subnet_cidr"`
	Gateway       string    `json:"gateway,omitempty"`
	InterfaceName string    `json:"interface_name"`
	RDNSHostname  string    `json:"rdns_hostname,omitempty"`
	ApplyToServer bool      `json:"apply_to_server"`
}

type BulkAddIPsRequest struct {
	ServerID      uuid.UUID `json:"server_id"`
	RawLines      string    `json:"raw_lines"` // multiple IPs, one per line (ip,hostname(ptr) or ip)
	RawIPs        string    `json:"raw_ips"`   // alternative field name for raw input
	SubnetCIDR    int       `json:"subnet_cidr"`
	Gateway       string    `json:"gateway,omitempty"`
	InterfaceName string    `json:"interface_name"`
	ApplyToServer bool      `json:"apply_to_server"`
}

type ApplyIPsResult struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Output  string   `json:"output"`
	Count   int      `json:"count"`
	IPs     []string `json:"ips,omitempty"`
	Error   string   `json:"error,omitempty"`
}

type IPService interface {
	ListIPs(ctx context.Context, serverID *uuid.UUID) ([]ServerIP, error)
	GetIP(ctx context.Context, id uuid.UUID) (*ServerIP, error)
	AddIP(ctx context.Context, req AddServerIPRequest) (*ServerIP, error)
	BulkAddIPs(ctx context.Context, req BulkAddIPsRequest) ([]ServerIP, error)
	DeleteIP(ctx context.Context, id uuid.UUID) error
	MarkConfigured(ctx context.Context, id uuid.UUID, configured bool) error
	GenerateNmcliScript(ctx context.Context, serverID uuid.UUID) (string, error)
	ApplyIPsToServer(ctx context.Context, serverID uuid.UUID, ipIDs []uuid.UUID) (*ApplyIPsResult, error)
}

type PostgresIPService struct {
	db    *pgxpool.Pool
	vault *credentials.Vault
}

func NewPostgresIPService(db *pgxpool.Pool, vault *credentials.Vault) *PostgresIPService {
	return &PostgresIPService{db: db, vault: vault}
}

func (s *PostgresIPService) ListIPs(ctx context.Context, serverID *uuid.UUID) ([]ServerIP, error) {
	query := `
		SELECT 
			sip.id, sip.server_id, s.name, sip.ip_address, sip.subnet_cidr,
			COALESCE(sip.gateway, ''), sip.interface_name, sip.is_main,
			sip.is_configured, COALESCE(sip.rdns_hostname, ''),
			sip.created_at, sip.updated_at
		FROM server_ips sip
		JOIN servers s ON sip.server_id = s.id
		WHERE 1=1
	`
	args := []any{}
	if serverID != nil {
		query += " AND sip.server_id = $1"
		args = append(args, *serverID)
	}
	query += " ORDER BY sip.is_main DESC, sip.ip_address ASC"

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query server IPs: %w", err)
	}
	defer rows.Close()

	var list []ServerIP
	for rows.Next() {
		var item ServerIP
		err := rows.Scan(
			&item.ID, &item.ServerID, &item.ServerName, &item.IPAddress, &item.SubnetCIDR,
			&item.Gateway, &item.InterfaceName, &item.IsMain,
			&item.IsConfigured, &item.RDNSHostname,
			&item.CreatedAt, &item.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan server IP: %w", err)
		}
		list = append(list, item)
	}

	if list == nil {
		list = []ServerIP{}
	}
	return list, nil
}

func (s *PostgresIPService) GetIP(ctx context.Context, id uuid.UUID) (*ServerIP, error) {
	query := `
		SELECT 
			sip.id, sip.server_id, s.name, sip.ip_address, sip.subnet_cidr,
			COALESCE(sip.gateway, ''), sip.interface_name, sip.is_main,
			sip.is_configured, COALESCE(sip.rdns_hostname, ''),
			sip.created_at, sip.updated_at
		FROM server_ips sip
		JOIN servers s ON sip.server_id = s.id
		WHERE sip.id = $1
	`
	var item ServerIP
	err := s.db.QueryRow(ctx, query, id).Scan(
		&item.ID, &item.ServerID, &item.ServerName, &item.IPAddress, &item.SubnetCIDR,
		&item.Gateway, &item.InterfaceName, &item.IsMain,
		&item.IsConfigured, &item.RDNSHostname,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrServerIPNotFound
		}
		return nil, fmt.Errorf("failed to get server IP: %w", err)
	}
	return &item, nil
}

func (s *PostgresIPService) AddIP(ctx context.Context, req AddServerIPRequest) (*ServerIP, error) {
	req.IPAddress = strings.TrimSpace(req.IPAddress)
	if req.IPAddress == "" {
		return nil, errors.New("IP address cannot be empty")
	}
	if parsed := net.ParseIP(req.IPAddress); parsed == nil {
		return nil, fmt.Errorf("invalid IP address format: %s", req.IPAddress)
	}
	if req.SubnetCIDR <= 0 || req.SubnetCIDR > 32 {
		req.SubnetCIDR = 32
	}
	req.InterfaceName = strings.TrimSpace(req.InterfaceName)
	if req.InterfaceName == "" {
		req.InterfaceName = "eth0"
	}

	var exists bool
	err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM server_ips WHERE server_id = $1 AND ip_address = $2)", req.ServerID, req.IPAddress).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing IP: %w", err)
	}
	if exists {
		return nil, ErrDuplicateIP
	}

	id := uuid.New()
	query := `
		INSERT INTO server_ips (
			id, server_id, ip_address, subnet_cidr, gateway, interface_name,
			is_main, is_configured, rdns_hostname, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			false, false, $7, NOW(), NOW()
		)
	`
	var gw *string
	if req.Gateway != "" {
		gw = &req.Gateway
	}
	var rdns *string
	if req.RDNSHostname != "" {
		rdns = &req.RDNSHostname
	}

	_, err = s.db.Exec(ctx, query, id, req.ServerID, req.IPAddress, req.SubnetCIDR, gw, req.InterfaceName, rdns)
	if err != nil {
		return nil, fmt.Errorf("failed to insert server IP: %w", err)
	}

	// Also automatically create a VMTA entry for this IP
	vmtaName := fmt.Sprintf("vmta_%s", strings.ReplaceAll(req.IPAddress, ".", "_"))
	_, _ = s.db.Exec(ctx, `
		INSERT INTO vmtas (id, server_id, server_ip_id, vmta_name, ip_address, status, created_at, updated_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active', NOW(), NOW())
		ON CONFLICT (server_id, vmta_name) DO NOTHING
	`, req.ServerID, id, vmtaName, req.IPAddress)

	created, err := s.GetIP(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.ApplyToServer {
		_, _ = s.ApplyIPsToServer(ctx, req.ServerID, []uuid.UUID{id})
		if updated, err := s.GetIP(ctx, id); err == nil {
			created = updated
		}
	}

	return created, nil
}

func (s *PostgresIPService) BulkAddIPs(ctx context.Context, req BulkAddIPsRequest) ([]ServerIP, error) {
	rawInput := req.RawLines
	if strings.TrimSpace(rawInput) == "" {
		rawInput = req.RawIPs
	}

	scanner := bufio.NewScanner(strings.NewReader(rawInput))
	created := []ServerIP{}

	if req.SubnetCIDR <= 0 || req.SubnetCIDR > 32 {
		req.SubnetCIDR = 32
	}
	if req.InterfaceName == "" {
		req.InterfaceName = "eth0"
	}

	for scanner.Scan() {
		raw := strings.TrimSpace(scanner.Text())
		if raw == "" || strings.HasPrefix(raw, "#") {
			continue
		}

		var ipStr string
		var rdns string

		// Format: ip,hostname(ptr) where hostname can be left empty
		if strings.Contains(raw, ",") {
			parts := strings.SplitN(raw, ",", 2)
			ipStr = strings.TrimSpace(parts[0])
			if len(parts) > 1 {
				rdns = strings.TrimSpace(parts[1])
			}
		} else {
			// Space or tab separated fallback: "ip hostname" or just "ip"
			fields := strings.Fields(raw)
			if len(fields) == 0 {
				continue
			}
			ipStr = strings.TrimSpace(fields[0])
			if len(fields) > 1 {
				rdns = strings.TrimSpace(fields[1])
			}
		}

		// Support IP with CIDR notation e.g. 192.168.1.10/24
		cidr := req.SubnetCIDR
		if strings.Contains(ipStr, "/") {
			ipParts := strings.SplitN(ipStr, "/", 2)
			ipStr = strings.TrimSpace(ipParts[0])
			if parsedCIDR, err := strconv.Atoi(strings.TrimSpace(ipParts[1])); err == nil && parsedCIDR > 0 && parsedCIDR <= 32 {
				cidr = parsedCIDR
			}
		}

		if ipStr == "" {
			continue
		}

		// Insert into DB without individual SSH to allow bulk execution at the end
		item, err := s.AddIP(ctx, AddServerIPRequest{
			ServerID:      req.ServerID,
			IPAddress:     ipStr,
			SubnetCIDR:    cidr,
			Gateway:       req.Gateway,
			InterfaceName: req.InterfaceName,
			RDNSHostname:  rdns,
			ApplyToServer: false,
		})
		if err == nil && item != nil {
			created = append(created, *item)
		}
	}

	// If requested, apply all newly added secondary IPs to the server in a single bulk nmcli operation
	if req.ApplyToServer && len(created) > 0 {
		var ids []uuid.UUID
		for _, item := range created {
			ids = append(ids, item.ID)
		}
		_, _ = s.ApplyIPsToServer(ctx, req.ServerID, ids)
		if refreshed, err := s.ListIPs(ctx, &req.ServerID); err == nil {
			var updatedCreated []ServerIP
			for _, r := range refreshed {
				for _, cid := range ids {
					if r.ID == cid {
						updatedCreated = append(updatedCreated, r)
						break
					}
				}
			}
			if len(updatedCreated) > 0 {
				created = updatedCreated
			}
		}
	}

	return created, nil
}

func (s *PostgresIPService) DeleteIP(ctx context.Context, id uuid.UUID) error {
	tag, err := s.db.Exec(ctx, "DELETE FROM server_ips WHERE id = $1 AND is_main = false", id)
	if err != nil {
		return fmt.Errorf("failed to delete server IP: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("cannot delete main IP or IP not found")
	}
	return nil
}

func (s *PostgresIPService) MarkConfigured(ctx context.Context, id uuid.UUID, configured bool) error {
	tag, err := s.db.Exec(ctx, "UPDATE server_ips SET is_configured = $1, updated_at = NOW() WHERE id = $2", configured, id)
	if err != nil {
		return fmt.Errorf("failed to update configured status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrServerIPNotFound
	}
	return nil
}

const nmcliScriptTmpl = `#!/usr/bin/env bash
# ==============================================================================
# StansiaReco NetworkManager (nmcli) Secondary IP Configuration Script
# Target Server: {{ .Server.Name }} ({{ .Server.HostnameOrIP }})
# Generated at: {{ .GeneratedAt }}
# Total Secondary IPs to configure: {{ len .IPs }}
# ==============================================================================
set -euo pipefail

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; exit 1; }

# 1. Verify root privileges
if [ "$EUID" -ne 0 ]; then
    error "Please run this script as root (e.g. sudo bash script.sh)"
fi

# 2. Check nmcli availability
if ! command -v nmcli &>/dev/null; then
    log "nmcli not found. Installing NetworkManager..."
    if command -v apt-get &>/dev/null; then
        apt-get update -y && apt-get install -y network-manager
        systemctl enable --now NetworkManager
    elif command -v dnf &>/dev/null; then
        dnf install -y NetworkManager
        systemctl enable --now NetworkManager
    elif command -v yum &>/dev/null; then
        yum install -y NetworkManager
        systemctl enable --now NetworkManager
    else
        error "Neither apt-get nor dnf/yum found. Please install NetworkManager manually."
    fi
fi

# 3. Detect primary connection profile
CONN_NAME=$(nmcli -t -f NAME,DEVICE connection show --active | grep -m1 ':{{ .DefaultInterface }}' | cut -d: -f1 || true)
if [ -z "$CONN_NAME" ]; then
    CONN_NAME=$(nmcli -t -f NAME connection show --active | head -n1 || true)
fi

if [ -z "$CONN_NAME" ]; then
    error "Could not detect active NetworkManager connection. Available connections: $(nmcli connection show)"
fi

log "Active NetworkManager connection profile: $CONN_NAME"

# 4. Add Secondary IP Addresses
{{ range .IPs }}
log "Adding IP {{ .IPAddress }}/{{ .SubnetCIDR }} to connection $CONN_NAME..."
nmcli connection modify "$CONN_NAME" +ipv4.addresses "{{ .IPAddress }}/{{ .SubnetCIDR }}"
{{ end }}

# 5. Apply changes and reactivate connection profile
log "Reactivating connection $CONN_NAME to apply routing and IP aliases..."
nmcli connection up "$CONN_NAME"

# 6. Verify configured IPs
log "Current IP addresses on network interfaces:"
ip -4 addr show

log "✅ All additional IPs successfully configured with NetworkManager nmcli!"
`

type nmcliTemplateData struct {
	Server           MTAServer
	DefaultInterface string
	GeneratedAt      string
	IPs              []ServerIP
}

func (s *PostgresIPService) GenerateNmcliScript(ctx context.Context, serverID uuid.UUID) (string, error) {
	// Load server info
	var srv MTAServer
	err := s.db.QueryRow(ctx, "SELECT id, name, hostname_or_ip FROM servers WHERE id = $1", serverID).Scan(&srv.ID, &srv.Name, &srv.HostnameOrIP)
	if err != nil {
		return "", fmt.Errorf("failed to load server: %w", err)
	}

	// Load non-main IPs or all IPs
	ips, err := s.ListIPs(ctx, &serverID)
	if err != nil {
		return "", fmt.Errorf("failed to list IPs: %w", err)
	}

	var secondaryIPs []ServerIP
	defaultIface := "eth0"
	for _, ip := range ips {
		if !ip.IsMain {
			secondaryIPs = append(secondaryIPs, ip)
		}
		if ip.InterfaceName != "" {
			defaultIface = ip.InterfaceName
		}
	}

	if len(secondaryIPs) == 0 {
		return "", errors.New("no secondary IPs found for this server; add secondary IPs first")
	}

	tmpl, err := template.New("nmcli").Parse(nmcliScriptTmpl)
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %w", err)
	}

	data := nmcliTemplateData{
		Server:           srv,
		DefaultInterface: defaultIface,
		GeneratedAt:      time.Now().UTC().Format(time.RFC3339),
		IPs:              secondaryIPs,
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to render nmcli script: %w", err)
	}

	return buf.String(), nil
}

func (s *PostgresIPService) ApplyIPsToServer(ctx context.Context, serverID uuid.UUID, ipIDs []uuid.UUID) (*ApplyIPsResult, error) {
	// 1. Fetch server & credential info
	var srvName, hostnameOrIP string
	var sshPort int
	var credID uuid.UUID
	err := s.db.QueryRow(ctx, `
		SELECT name, hostname_or_ip, ssh_port, credential_id
		FROM servers
		WHERE id = $1
	`, serverID).Scan(&srvName, &hostnameOrIP, &sshPort, &credID)
	if err != nil {
		return nil, fmt.Errorf("failed to find server: %w", err)
	}

	var username string
	var encryptedSecret []byte
	var credType credentials.CredentialType
	err = s.db.QueryRow(ctx, `
		SELECT username, encrypted_secret, cred_type
		FROM credentials
		WHERE id = $1
	`, credID).Scan(&username, &encryptedSecret, &credType)
	if err != nil {
		return nil, fmt.Errorf("failed to find server credentials: %w", err)
	}

	if s.vault == nil {
		return nil, errors.New("vault is not initialized on IP service")
	}

	decrypted, err := s.vault.Decrypt(encryptedSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt credentials: %w", err)
	}

	// 2. Fetch the target secondary IPs for this server
	query := `
		SELECT id, ip_address, subnet_cidr, interface_name
		FROM server_ips
		WHERE server_id = $1 AND is_main = false
	`
	args := []any{serverID}
	if len(ipIDs) > 0 {
		query += " AND id = ANY($2)"
		args = append(args, ipIDs)
	}
	query += " ORDER BY ip_address ASC"

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query server IPs to apply: %w", err)
	}
	defer rows.Close()

	type ipItem struct {
		id    uuid.UUID
		ip    string
		cidr  int
		iface string
	}
	var targetIPs []ipItem
	for rows.Next() {
		var it ipItem
		if err := rows.Scan(&it.id, &it.ip, &it.cidr, &it.iface); err == nil {
			targetIPs = append(targetIPs, it)
		}
	}

	if len(targetIPs) == 0 {
		return &ApplyIPsResult{
			Success: true,
			Message: "No secondary IPs found to configure on this server.",
			Count:   0,
		}, nil
	}

	// Group target IPs by interface
	ifaceMap := make(map[string][]ipItem)
	appliedIDs := make([]uuid.UUID, 0, len(targetIPs))
	allIPStrings := make([]string, 0, len(targetIPs))
	for _, it := range targetIPs {
		iface := it.iface
		if strings.TrimSpace(iface) == "" {
			iface = "eth0"
		}
		ifaceMap[iface] = append(ifaceMap[iface], it)
		appliedIDs = append(appliedIDs, it.id)
		allIPStrings = append(allIPStrings, fmt.Sprintf("%s/%d", it.ip, it.cidr))
	}

	// 3. Build bash script with nmcli commands
	var scriptBuf strings.Builder
	scriptBuf.WriteString("#!/usr/bin/env bash\n")
	scriptBuf.WriteString("set -e\n")
	scriptBuf.WriteString("echo \"==> Configuring secondary IP addresses on $(hostname) for server " + srvName + "...\"\n\n")

	for iface, ips := range ifaceMap {
		ipListJoined := make([]string, 0, len(ips))
		for _, ip := range ips {
			ipListJoined = append(ipListJoined, fmt.Sprintf("%s/%d", ip.ip, ip.cidr))
		}
		joinedStr := strings.Join(ipListJoined, ",")

		scriptBuf.WriteString(fmt.Sprintf("IFACE=\"%s\"\n", iface))
		scriptBuf.WriteString("echo \"==> Processing interface ${IFACE} with " + strconv.Itoa(len(ips)) + " secondary IP(s)...\"\n")
		// Dynamically discover the active connection name for this interface
		scriptBuf.WriteString("CONN_NAME=$(nmcli -g NAME,DEVICE connection show --active 2>/dev/null | grep \":${IFACE}$\" | head -n1 | cut -d: -f1)\n")
		scriptBuf.WriteString("if [ -z \"$CONN_NAME\" ]; then\n")
		scriptBuf.WriteString("    CONN_NAME=$(nmcli -g NAME,DEVICE connection show 2>/dev/null | grep \":${IFACE}$\" | head -n1 | cut -d: -f1)\n")
		scriptBuf.WriteString("fi\n")
		scriptBuf.WriteString("if [ -z \"$CONN_NAME\" ]; then\n")
		scriptBuf.WriteString("    CONN_NAME=\"System ${IFACE}\"\n")
		scriptBuf.WriteString("fi\n")
		scriptBuf.WriteString("echo \"==> Resolved NetworkManager connection: '$CONN_NAME'\"\n\n")

		// Apply via nmcli connection modify +ipv4.addresses
		scriptBuf.WriteString(fmt.Sprintf("echo \"==> Running: sudo nmcli connection modify \\\"$CONN_NAME\\\" +ipv4.addresses \\\"%s\\\"\"\n", joinedStr))
		scriptBuf.WriteString(fmt.Sprintf("sudo nmcli connection modify \"$CONN_NAME\" +ipv4.addresses \"%s\" || {\n", joinedStr))
		scriptBuf.WriteString("    echo \"==> Fallback: adding addresses individually...\"\n")
		for _, ip := range ipListJoined {
			scriptBuf.WriteString(fmt.Sprintf("    sudo nmcli connection modify \"$CONN_NAME\" +ipv4.addresses \"%s\" || true\n", ip))
		}
		scriptBuf.WriteString("}\n\n")

		// Activate connection
		scriptBuf.WriteString("echo \"==> Bringing up connection '$CONN_NAME'...\"\n")
		scriptBuf.WriteString("sudo nmcli connection up \"$CONN_NAME\" || echo \"Notice: nmcli connection up reported warning, continuing...\"\n\n")

		// Ensure immediate kernel binding so `ip a` reflects immediately
		scriptBuf.WriteString("echo \"==> Synchronizing kernel interface bindings...\"\n")
		for _, ip := range ipListJoined {
			scriptBuf.WriteString(fmt.Sprintf("sudo ip addr add \"%s\" dev \"${IFACE}\" 2>/dev/null || true\n", ip))
		}

		// Verification
		scriptBuf.WriteString("echo \"==> Active IPv4 addresses on ${IFACE}:\"\n")
		scriptBuf.WriteString("ip -4 addr show dev \"${IFACE}\"\n")
		scriptBuf.WriteString("echo \"----------------------------------------\"\n\n")
	}

	scriptBuf.WriteString("echo \"==> NetworkManager secondary IP configuration complete!\"\n")
	scriptContent := scriptBuf.String()

	// 4. Dial SSH
	var authMethods []ssh.AuthMethod
	switch credType {
	case credentials.TypePassword:
		authMethods = append(authMethods, ssh.Password(string(decrypted)))
	case credentials.TypePrivateKey:
		signer, err := ssh.ParsePrivateKey(decrypted)
		if err != nil {
			return nil, fmt.Errorf("failed to parse SSH private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	case credentials.TypePrivateKeyWithPass:
		parts := strings.SplitN(string(decrypted), "\x00", 2)
		keyBytes := []byte(parts[0])
		var passBytes []byte
		if len(parts) > 1 {
			passBytes = []byte(parts[1])
		}
		signer, err := ssh.ParsePrivateKeyWithPassphrase(keyBytes, passBytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse encrypted private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	sshConfig := &ssh.ClientConfig{
		User:            username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         12 * time.Second,
	}

	targetAddr := net.JoinHostPort(hostnameOrIP, strconv.Itoa(sshPort))
	sshClient, err := ssh.Dial("tcp", targetAddr, sshConfig)
	if err != nil {
		return &ApplyIPsResult{
			Success: false,
			Error:   fmt.Sprintf("SSH connection to %s (%s:%d) failed: %v", srvName, hostnameOrIP, sshPort, err),
			Message: "Failed to connect to remote server over SSH",
			Count:   0,
		}, nil
	}
	defer sshClient.Close()

	session, err := sshClient.NewSession()
	if err != nil {
		return &ApplyIPsResult{
			Success: false,
			Error:   fmt.Sprintf("failed to open SSH session: %v", err),
			Message: "SSH session creation failed",
			Count:   0,
		}, nil
	}
	defer session.Close()

	session.Stdin = strings.NewReader(scriptContent)
	outBytes, runErr := session.CombinedOutput("command -v bash >/dev/null 2>&1 && exec bash -l -s || exec sh -s")
	outputStr := string(outBytes)

	if runErr != nil {
		return &ApplyIPsResult{
			Success: false,
			Error:   fmt.Sprintf("nmcli execution failed: %v", runErr),
			Message: "Script execution returned non-zero code on server",
			Output:  outputStr,
			Count:   len(appliedIDs),
			IPs:     allIPStrings,
		}, nil
	}

	// 5. Update database: mark all applied IPs as configured!
	_, err = s.db.Exec(ctx, `
		UPDATE server_ips
		SET is_configured = true, updated_at = NOW()
		WHERE id = ANY($1)
	`, appliedIDs)
	if err != nil {
		fmt.Printf("warning: failed to update is_configured: %v\n", err)
	}

	return &ApplyIPsResult{
		Success: true,
		Message: fmt.Sprintf("Successfully applied %d secondary IP(s) to %s via NetworkManager.", len(appliedIDs), srvName),
		Output:  outputStr,
		Count:   len(appliedIDs),
		IPs:     allIPStrings,
	}, nil
}
