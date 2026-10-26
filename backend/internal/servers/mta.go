package servers

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/ssh"
	"stansiareco/backend/internal/credentials"
)

var (
	ErrServerNotFound = errors.New("server not found")
	ErrInvalidInput   = errors.New("invalid input data")
)

type MTAServer struct {
	ID                  uuid.UUID  `json:"id"`
	Name                string     `json:"name"`
	HostnameOrIP        string     `json:"hostname_or_ip"`
	SSHPort             int        `json:"ssh_port"`
	OSInfo              string     `json:"os_info,omitempty"`
	Environment         string     `json:"environment"`
	Tags                []string   `json:"tags"`
	Description         string     `json:"description,omitempty"`
	CredentialID        *uuid.UUID `json:"credential_id,omitempty"`
	CredentialName      string     `json:"credential_name,omitempty"`
	CredentialType      string     `json:"credential_type,omitempty"`
	Username            string     `json:"username,omitempty"`
	ProviderID          *uuid.UUID `json:"provider_id,omitempty"`
	ProviderName        string     `json:"provider_name,omitempty"`
	ProviderPort25Open  bool       `json:"provider_port_25_open"`
	ServerType          string     `json:"server_type"`
	Port25Status        string     `json:"port_25_status"`
	MTAInstalled        bool       `json:"mta_installed"`
	MTASoftware         string     `json:"mta_software"`
	MainIP              string     `json:"main_ip"`
	IsActive            bool       `json:"is_active"`
	AllowPrivateIP      bool       `json:"allow_private_ip"`
	PinnedHostKey       string     `json:"pinned_host_key,omitempty"`
	LastTestedAt        *time.Time `json:"last_tested_at,omitempty"`
	LastTestStatus      string     `json:"last_test_status,omitempty"`
	LastTestError       string     `json:"last_test_error,omitempty"`
	IPCount             int        `json:"ip_count"`
	VMTACount           int        `json:"vmta_count"`
	ProxyEnabled        bool       `json:"proxy_enabled"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type MTAServerFilter struct {
	ProviderID   *uuid.UUID
	Port25Status string
	MTAInstalled *bool
	Search       string
}

type CreateMTAServerRequest struct {
	Name           string     `json:"name"`
	HostnameOrIP   string     `json:"hostname_or_ip"`
	SSHPort        int        `json:"ssh_port"`
	ProviderID     *uuid.UUID `json:"provider_id,omitempty"`
	ServerType     string     `json:"server_type"` // default: "mta"
	MTASoftware    string     `json:"mta_software"` // default: "postfix"
	Environment    string     `json:"environment"` // default: "prod"
	Description    string     `json:"description,omitempty"`
	Tags           []string   `json:"tags,omitempty"`
	AllowPrivateIP bool       `json:"allow_private_ip"`

	// SSH Auth credentials
	CredentialID   *uuid.UUID `json:"credential_id,omitempty"`   // if using existing
	CredentialName string     `json:"credential_name,omitempty"` // optional custom name when saving key
	AuthType       string     `json:"auth_type"`                 // "password", "key", "pem"
	Username       string     `json:"username"`
	Password       string     `json:"password,omitempty"`
	PrivateKey     string     `json:"private_key,omitempty"`
	Passphrase     string     `json:"passphrase,omitempty"`
}

type UpdateMTAServerRequest struct {
	Name           *string    `json:"name,omitempty"`
	HostnameOrIP   *string    `json:"hostname_or_ip,omitempty"`
	SSHPort        *int       `json:"ssh_port,omitempty"`
	ProviderID     *uuid.UUID `json:"provider_id,omitempty"`
	MTASoftware    *string    `json:"mta_software,omitempty"`
	Environment    *string    `json:"environment,omitempty"`
	Description    *string    `json:"description,omitempty"`
	Tags           []string   `json:"tags,omitempty"`
	IsActive       *bool      `json:"is_active,omitempty"`
	CredentialID   *uuid.UUID `json:"credential_id,omitempty"`
}

type BulkAddMTAServerRequest struct {
	RawLines    string     `json:"raw_lines"`
	ProviderID  *uuid.UUID `json:"provider_id,omitempty"`
	MTASoftware string     `json:"mta_software"` // "postfix" or "powermta"
	DefaultUser string     `json:"default_user"` // e.g. "root"
	DefaultPort int        `json:"default_port"` // e.g. 22
}

type BulkAddResult struct {
	TotalParsed int         `json:"total_parsed"`
	AddedCount  int         `json:"added_count"`
	ErrorCount  int         `json:"error_count"`
	Errors      []string    `json:"errors"`
	Servers     []MTAServer `json:"servers"`
}

type SSHTestResult struct {
	ServerID     uuid.UUID `json:"server_id"`
	Success      bool      `json:"success"`
	Message      string    `json:"message"`
	OSInfo       string    `json:"os_info,omitempty"`
	Port25Status string    `json:"port_25_status"`
	Error        string    `json:"error,omitempty"`
	TestedAt     time.Time `json:"tested_at"`
}

type MTAService interface {
	ListServers(ctx context.Context, filter MTAServerFilter) ([]MTAServer, error)
	GetServer(ctx context.Context, id uuid.UUID) (*MTAServer, error)
	CreateServer(ctx context.Context, req CreateMTAServerRequest) (*MTAServer, error)
	BulkCreateServers(ctx context.Context, req BulkAddMTAServerRequest) (*BulkAddResult, error)
	UpdateServer(ctx context.Context, id uuid.UUID, req UpdateMTAServerRequest) (*MTAServer, error)
	DeleteServer(ctx context.Context, id uuid.UUID) error
	TestSSHConnection(ctx context.Context, id uuid.UUID) (*SSHTestResult, error)
}

type PostgresMTAService struct {
	db    *pgxpool.Pool
	vault *credentials.Vault
}

func NewPostgresMTAService(db *pgxpool.Pool, vault *credentials.Vault) *PostgresMTAService {
	return &PostgresMTAService{
		db:    db,
		vault: vault,
	}
}

func (s *PostgresMTAService) ListServers(ctx context.Context, filter MTAServerFilter) ([]MTAServer, error) {
	query := `
		SELECT 
			s.id, s.name, s.hostname_or_ip, s.ssh_port, COALESCE(s.os_info, ''), s.environment,
			s.tags, COALESCE(s.description, ''), s.credential_id,
			COALESCE(c.name, ''), COALESCE(c.cred_type, ''), COALESCE(c.username, ''),
			s.provider_id, COALESCE(p.name, ''), COALESCE(p.port_25_open, false),
			s.server_type, s.port_25_status, s.mta_installed, COALESCE(s.mta_software, 'postfix'),
			COALESCE(s.main_ip, s.hostname_or_ip), s.is_active, s.allow_private_ip,
			COALESCE(s.pinned_host_key, ''), s.last_tested_at, COALESCE(s.last_test_status, ''), COALESCE(s.last_test_error, ''),
			COALESCE((SELECT COUNT(*) FROM server_ips sip WHERE sip.server_id = s.id), 0) AS ip_count,
			COALESCE((SELECT COUNT(*) FROM vmtas v WHERE v.server_id = s.id), 0) AS vmta_count,
			COALESCE((SELECT (px.http_proxy_enabled OR px.socks_proxy_enabled) FROM proxy_servers px WHERE px.server_id = s.id), false) AS proxy_enabled,
			s.created_at, s.updated_at
		FROM servers s
		LEFT JOIN credentials c ON s.credential_id = c.id
		LEFT JOIN server_providers p ON s.provider_id = p.id
		WHERE 1=1
	`
	args := []any{}
	argIdx := 1

	if filter.ProviderID != nil {
		query += fmt.Sprintf(" AND s.provider_id = $%d", argIdx)
		args = append(args, *filter.ProviderID)
		argIdx++
	}
	if filter.Port25Status != "" {
		query += fmt.Sprintf(" AND s.port_25_status = $%d", argIdx)
		args = append(args, filter.Port25Status)
		argIdx++
	}
	if filter.MTAInstalled != nil {
		query += fmt.Sprintf(" AND s.mta_installed = $%d", argIdx)
		args = append(args, *filter.MTAInstalled)
		argIdx++
	}
	if filter.Search != "" {
		term := "%" + strings.ToLower(filter.Search) + "%"
		query += fmt.Sprintf(" AND (LOWER(s.name) LIKE $%d OR LOWER(s.hostname_or_ip) LIKE $%d OR LOWER(COALESCE(s.main_ip, '')) LIKE $%d)", argIdx, argIdx, argIdx)
		args = append(args, term)
		argIdx++
	}

	query += " ORDER BY s.created_at DESC"

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query servers: %w", err)
	}
	defer rows.Close()

	var list []MTAServer
	for rows.Next() {
		var srv MTAServer
		var credID, provID *uuid.UUID

		err := rows.Scan(
			&srv.ID, &srv.Name, &srv.HostnameOrIP, &srv.SSHPort, &srv.OSInfo, &srv.Environment,
			&srv.Tags, &srv.Description, &credID,
			&srv.CredentialName, &srv.CredentialType, &srv.Username,
			&provID, &srv.ProviderName, &srv.ProviderPort25Open,
			&srv.ServerType, &srv.Port25Status, &srv.MTAInstalled, &srv.MTASoftware,
			&srv.MainIP, &srv.IsActive, &srv.AllowPrivateIP,
			&srv.PinnedHostKey, &srv.LastTestedAt, &srv.LastTestStatus, &srv.LastTestError,
			&srv.IPCount, &srv.VMTACount, &srv.ProxyEnabled,
			&srv.CreatedAt, &srv.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan server: %w", err)
		}
		srv.CredentialID = credID
		srv.ProviderID = provID
		list = append(list, srv)
	}

	if list == nil {
		list = []MTAServer{}
	}
	return list, nil
}

func (s *PostgresMTAService) GetServer(ctx context.Context, id uuid.UUID) (*MTAServer, error) {
	query := `
		SELECT 
			s.id, s.name, s.hostname_or_ip, s.ssh_port, COALESCE(s.os_info, ''), s.environment,
			s.tags, COALESCE(s.description, ''), s.credential_id,
			COALESCE(c.name, ''), COALESCE(c.cred_type, ''), COALESCE(c.username, ''),
			s.provider_id, COALESCE(p.name, ''), COALESCE(p.port_25_open, false),
			s.server_type, s.port_25_status, s.mta_installed, COALESCE(s.mta_software, 'postfix'),
			COALESCE(s.main_ip, s.hostname_or_ip), s.is_active, s.allow_private_ip,
			COALESCE(s.pinned_host_key, ''), s.last_tested_at, COALESCE(s.last_test_status, ''), COALESCE(s.last_test_error, ''),
			COALESCE((SELECT COUNT(*) FROM server_ips sip WHERE sip.server_id = s.id), 0) AS ip_count,
			COALESCE((SELECT COUNT(*) FROM vmtas v WHERE v.server_id = s.id), 0) AS vmta_count,
			COALESCE((SELECT (px.http_proxy_enabled OR px.socks_proxy_enabled) FROM proxy_servers px WHERE px.server_id = s.id), false) AS proxy_enabled,
			s.created_at, s.updated_at
		FROM servers s
		LEFT JOIN credentials c ON s.credential_id = c.id
		LEFT JOIN server_providers p ON s.provider_id = p.id
		WHERE s.id = $1
	`
	var srv MTAServer
	var credID, provID *uuid.UUID

	err := s.db.QueryRow(ctx, query, id).Scan(
		&srv.ID, &srv.Name, &srv.HostnameOrIP, &srv.SSHPort, &srv.OSInfo, &srv.Environment,
		&srv.Tags, &srv.Description, &credID,
		&srv.CredentialName, &srv.CredentialType, &srv.Username,
		&provID, &srv.ProviderName, &srv.ProviderPort25Open,
		&srv.ServerType, &srv.Port25Status, &srv.MTAInstalled, &srv.MTASoftware,
		&srv.MainIP, &srv.IsActive, &srv.AllowPrivateIP,
		&srv.PinnedHostKey, &srv.LastTestedAt, &srv.LastTestStatus, &srv.LastTestError,
		&srv.IPCount, &srv.VMTACount, &srv.ProxyEnabled,
		&srv.CreatedAt, &srv.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrServerNotFound
		}
		return nil, fmt.Errorf("failed to get server: %w", err)
	}
	srv.CredentialID = credID
	srv.ProviderID = provID
	return &srv, nil
}

func (s *PostgresMTAService) CreateServer(ctx context.Context, req CreateMTAServerRequest) (*MTAServer, error) {
	req.Name = strings.TrimSpace(req.Name)
	req.HostnameOrIP = strings.TrimSpace(req.HostnameOrIP)
	if req.HostnameOrIP == "" {
		return nil, errors.New("hostname or IP address is required")
	}
	if req.Name == "" {
		req.Name = req.HostnameOrIP
	}
	if req.SSHPort <= 0 {
		req.SSHPort = 22
	}
	if req.ServerType == "" {
		req.ServerType = "mta"
	}
	if req.MTASoftware == "" {
		req.MTASoftware = "postfix"
	}
	if req.Environment == "" {
		req.Environment = "prod"
	}
	if req.Tags == nil {
		req.Tags = []string{"mta"}
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Determine CredentialID
	var credID uuid.UUID
	if req.CredentialID != nil && *req.CredentialID != uuid.Nil {
		credID = *req.CredentialID
		// If username is empty, auto-populate from existing credential
		if strings.TrimSpace(req.Username) == "" {
			var credUser string
			_ = tx.QueryRow(ctx, "SELECT username FROM credentials WHERE id = $1", credID).Scan(&credUser)
			if credUser != "" {
				req.Username = credUser
			}
		}
	} else {
		// Create a credential in credentials table
		username := strings.TrimSpace(req.Username)
		if username == "" {
			username = "root"
		}

		var secretBytes []byte
		var credType credentials.CredentialType

		switch req.AuthType {
		case "password":
			credType = credentials.TypePassword
			if req.Password == "" {
				return nil, errors.New("password is required for password authentication")
			}
			secretBytes = []byte(req.Password)
		case "key", "pem":
			credType = credentials.TypePrivateKey
			if req.PrivateKey == "" {
				return nil, errors.New("private key / PEM content is required")
			}
			if req.Passphrase != "" {
				credType = credentials.TypePrivateKeyWithPass
				// Store key and passphrase separated by null byte or delimiter
				secretBytes = []byte(req.PrivateKey + "\x00" + req.Passphrase)
			} else {
				secretBytes = []byte(req.PrivateKey)
			}
		default:
			// Default to password if provided
			if req.Password != "" {
				credType = credentials.TypePassword
				secretBytes = []byte(req.Password)
			} else {
				credType = credentials.TypePrivateKey
				secretBytes = []byte(req.PrivateKey)
			}
		}

		encryptedSecret, err := s.vault.Encrypt(secretBytes)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt credential secret: %w", err)
		}

		fingerprint := credentials.CalculateFingerprint(secretBytes)
		credID = uuid.New()
		credName := strings.TrimSpace(req.CredentialName)
		if credName == "" {
			credName = fmt.Sprintf("%s-ssh-%s", req.Name, username)
		}

		insertCredQuery := `
			INSERT INTO credentials (id, name, cred_type, username, encrypted_secret, key_version, fingerprint, description, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, 1, $6, $7, NOW(), NOW())
		`
		_, err = tx.Exec(ctx, insertCredQuery, credID, credName, credType, username, encryptedSecret, fingerprint, "SSH credential for "+req.Name)
		if err != nil {
			return nil, fmt.Errorf("failed to create credential: %w", err)
		}
	}

	serverID := uuid.New()
	mainIP := req.HostnameOrIP
	// Check if hostname is an IP
	if parsedIP := net.ParseIP(req.HostnameOrIP); parsedIP != nil {
		mainIP = parsedIP.String()
	}

	// Insert Server
	insertServerQuery := `
		INSERT INTO servers (
			id, name, hostname_or_ip, ssh_port, environment, tags, description,
			credential_id, is_active, allow_private_ip, provider_id, server_type,
			port_25_status, mta_installed, mta_software, main_ip, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7,
			$8, true, $9, $10, $11,
			'unknown', false, $12, $13, NOW(), NOW()
		)
	`
	_, err = tx.Exec(ctx, insertServerQuery,
		serverID, req.Name, req.HostnameOrIP, req.SSHPort, req.Environment, req.Tags, strings.TrimSpace(req.Description),
		credID, req.AllowPrivateIP, req.ProviderID, req.ServerType,
		req.MTASoftware, mainIP,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create server: %w", err)
	}

	// Also insert Main IP into server_ips
	serverIPID := uuid.New()
	insertIPQuery := `
		INSERT INTO server_ips (
			id, server_id, ip_address, subnet_cidr, interface_name, is_main, is_configured, created_at, updated_at
		) VALUES (
			$1, $2, $3, 32, 'eth0', true, true, NOW(), NOW()
		)
		ON CONFLICT (server_id, ip_address) DO NOTHING
	`
	_, err = tx.Exec(ctx, insertIPQuery, serverIPID, serverID, mainIP)
	if err != nil {
		return nil, fmt.Errorf("failed to insert main server IP: %w", err)
	}

	// Also create default VMTA
	vmtaName := fmt.Sprintf("vmta_%s", strings.ReplaceAll(mainIP, ".", "_"))
	insertVMTAQuery := `
		INSERT INTO vmtas (
			id, server_id, server_ip_id, vmta_name, ip_address, status, created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, 'active', NOW(), NOW()
		)
		ON CONFLICT (server_id, vmta_name) DO NOTHING
	`
	_, _ = tx.Exec(ctx, insertVMTAQuery, serverID, serverIPID, vmtaName, mainIP)

	// Create initial proxy record
	insertProxyQuery := `
		INSERT INTO proxy_servers (
			id, server_id, http_proxy_enabled, http_proxy_port, socks_proxy_enabled, socks_proxy_port,
			auth_user, auth_password, status, created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1, false, 3128, false, 1080,
			'proxyuser', 'SecretProxyPass123!', 'stopped', NOW(), NOW()
		)
		ON CONFLICT (server_id) DO NOTHING
	`
	_, _ = tx.Exec(ctx, insertProxyQuery, serverID)

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit server creation: %w", err)
	}

	return s.GetServer(ctx, serverID)
}

func (s *PostgresMTAService) BulkCreateServers(ctx context.Context, req BulkAddMTAServerRequest) (*BulkAddResult, error) {
	scanner := bufio.NewScanner(strings.NewReader(req.RawLines))
	res := &BulkAddResult{
		Errors:  []string{},
		Servers: []MTAServer{},
	}

	defaultUser := strings.TrimSpace(req.DefaultUser)
	if defaultUser == "" {
		defaultUser = "root"
	}
	defaultPort := req.DefaultPort
	if defaultPort <= 0 {
		defaultPort = 22
	}
	mtaSoftware := req.MTASoftware
	if mtaSoftware == "" {
		mtaSoftware = "postfix"
	}

	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		res.TotalParsed++

		// Formats accepted:
		// 1. ip:port:user:password:hostname
		// 2. ip:port:user:password
		// 3. ip:password
		// 4. ip:user:password
		// Also support comma, tab, or space separation
		var parts []string
		if strings.Contains(line, ":") {
			parts = strings.Split(line, ":")
		} else if strings.Contains(line, ",") {
			parts = strings.Split(line, ",")
		} else {
			parts = strings.Fields(line)
		}

		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}

		var ip, user, password, hostname string
		port := defaultPort

		switch len(parts) {
		case 1:
			ip = parts[0]
			user = defaultUser
		case 2:
			// ip:password
			ip = parts[0]
			password = parts[1]
			user = defaultUser
		case 3:
			// ip:user:password or ip:port:password
			ip = parts[0]
			if p, err := strconv.Atoi(parts[1]); err == nil {
				port = p
				password = parts[2]
				user = defaultUser
			} else {
				user = parts[1]
				password = parts[2]
			}
		case 4:
			// ip:port:user:password
			ip = parts[0]
			if p, err := strconv.Atoi(parts[1]); err == nil {
				port = p
			}
			user = parts[2]
			password = parts[3]
		case 5:
			// ip:port:user:password:hostname
			ip = parts[0]
			if p, err := strconv.Atoi(parts[1]); err == nil {
				port = p
			}
			user = parts[2]
			password = parts[3]
			hostname = parts[4]
		default:
			if len(parts) > 5 {
				ip = parts[0]
				if p, err := strconv.Atoi(parts[1]); err == nil {
					port = p
				}
				user = parts[2]
				password = parts[3]
				hostname = parts[4]
			}
		}

		if ip == "" {
			res.ErrorCount++
			res.Errors = append(res.Errors, fmt.Sprintf("Line %d: IP or Hostname is empty", lineNum))
			continue
		}
		if hostname == "" {
			hostname = ip
		}

		createReq := CreateMTAServerRequest{
			Name:           hostname,
			HostnameOrIP:   ip,
			SSHPort:        port,
			ProviderID:     req.ProviderID,
			ServerType:     "mta",
			MTASoftware:    mtaSoftware,
			Environment:    "prod",
			AuthType:       "password",
			Username:       user,
			Password:       password,
			AllowPrivateIP: false,
		}

		server, err := s.CreateServer(ctx, createReq)
		if err != nil {
			res.ErrorCount++
			res.Errors = append(res.Errors, fmt.Sprintf("Line %d (%s): %v", lineNum, ip, err))
			continue
		}

		res.AddedCount++
		res.Servers = append(res.Servers, *server)
	}

	return res, nil
}

func (s *PostgresMTAService) UpdateServer(ctx context.Context, id uuid.UUID, req UpdateMTAServerRequest) (*MTAServer, error) {
	current, err := s.GetServer(ctx, id)
	if err != nil {
		return nil, err
	}

	name := current.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}
	hostnameOrIP := current.HostnameOrIP
	if req.HostnameOrIP != nil && strings.TrimSpace(*req.HostnameOrIP) != "" {
		hostnameOrIP = strings.TrimSpace(*req.HostnameOrIP)
	}
	sshPort := current.SSHPort
	if req.SSHPort != nil && *req.SSHPort > 0 {
		sshPort = *req.SSHPort
	}
	providerID := current.ProviderID
	if req.ProviderID != nil {
		providerID = req.ProviderID
	}
	mtaSoftware := current.MTASoftware
	if req.MTASoftware != nil && strings.TrimSpace(*req.MTASoftware) != "" {
		mtaSoftware = strings.TrimSpace(*req.MTASoftware)
	}
	env := current.Environment
	if req.Environment != nil && strings.TrimSpace(*req.Environment) != "" {
		env = strings.TrimSpace(*req.Environment)
	}
	desc := current.Description
	if req.Description != nil {
		desc = strings.TrimSpace(*req.Description)
	}
	tags := current.Tags
	if req.Tags != nil {
		tags = req.Tags
	}
	isActive := current.IsActive
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	credID := current.CredentialID
	if req.CredentialID != nil {
		credID = req.CredentialID
	}

	query := `
		UPDATE servers
		SET name = $1, hostname_or_ip = $2, ssh_port = $3, provider_id = $4,
		    mta_software = $5, environment = $6, description = $7, tags = $8,
		    is_active = $9, credential_id = $10, updated_at = NOW()
		WHERE id = $11
	`
	_, err = s.db.Exec(ctx, query, name, hostnameOrIP, sshPort, providerID, mtaSoftware, env, desc, tags, isActive, credID, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update server: %w", err)
	}

	return s.GetServer(ctx, id)
}

func (s *PostgresMTAService) DeleteServer(ctx context.Context, id uuid.UUID) error {
	tag, err := s.db.Exec(ctx, "DELETE FROM servers WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete server: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrServerNotFound
	}
	return nil
}

// TestSSHConnection dials the server via SSH, tests authentication, checks port 25, and updates server health state
func (s *PostgresMTAService) TestSSHConnection(ctx context.Context, id uuid.UUID) (*SSHTestResult, error) {
	srv, err := s.GetServer(ctx, id)
	if err != nil {
		return nil, err
	}

	testRes := &SSHTestResult{
		ServerID:     id,
		TestedAt:     time.Now().UTC(),
		Port25Status: "unknown",
	}

	if srv.CredentialID == nil {
		errStr := "server has no attached SSH credential"
		_ = s.updateTestStatus(ctx, id, "failed", errStr, "", "unknown")
		testRes.Success = false
		testRes.Error = errStr
		testRes.Message = errStr
		return testRes, nil
	}

	// Fetch credential secret
	var credType credentials.CredentialType
	var username string
	var encryptedSecret []byte
	queryCred := `SELECT cred_type, username, encrypted_secret FROM credentials WHERE id = $1`
	err = s.db.QueryRow(ctx, queryCred, *srv.CredentialID).Scan(&credType, &username, &encryptedSecret)
	if err != nil {
		errStr := fmt.Sprintf("failed to load credential: %v", err)
		_ = s.updateTestStatus(ctx, id, "failed", errStr, "", "unknown")
		testRes.Success = false
		testRes.Error = errStr
		testRes.Message = errStr
		return testRes, nil
	}

	decrypted, err := s.vault.Decrypt(encryptedSecret)
	if err != nil {
		errStr := "failed to decrypt credential secret with vault"
		_ = s.updateTestStatus(ctx, id, "failed", errStr, "", "unknown")
		testRes.Success = false
		testRes.Error = errStr
		testRes.Message = errStr
		return testRes, nil
	}

	var authMethods []ssh.AuthMethod
	switch credType {
	case credentials.TypePassword:
		authMethods = append(authMethods, ssh.Password(string(decrypted)))
	case credentials.TypePrivateKey:
		signer, err := ssh.ParsePrivateKey(decrypted)
		if err != nil {
			errStr := fmt.Sprintf("failed to parse private key: %v", err)
			_ = s.updateTestStatus(ctx, id, "failed", errStr, "", "unknown")
			testRes.Success = false
			testRes.Error = errStr
			testRes.Message = errStr
			return testRes, nil
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	case credentials.TypePrivateKeyWithPass:
		// Split by null byte: key\0passphrase
		parts := strings.SplitN(string(decrypted), "\x00", 2)
		keyBytes := []byte(parts[0])
		var passBytes []byte
		if len(parts) > 1 {
			passBytes = []byte(parts[1])
		}
		signer, err := ssh.ParsePrivateKeyWithPassphrase(keyBytes, passBytes)
		if err != nil {
			errStr := fmt.Sprintf("failed to parse encrypted private key: %v", err)
			_ = s.updateTestStatus(ctx, id, "failed", errStr, "", "unknown")
			testRes.Success = false
			testRes.Error = errStr
			testRes.Message = errStr
			return testRes, nil
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	sshConfig := &ssh.ClientConfig{
		User:            username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	}

	targetAddr := net.JoinHostPort(srv.HostnameOrIP, strconv.Itoa(srv.SSHPort))
	client, err := ssh.Dial("tcp", targetAddr, sshConfig)
	if err != nil {
		errStr := fmt.Sprintf("SSH connection failed: %v", err)
		_ = s.updateTestStatus(ctx, id, "failed", errStr, "", "unknown")
		testRes.Success = false
		testRes.Error = errStr
		testRes.Message = errStr
		return testRes, nil
	}
	defer client.Close()

	// SSH session to check OS info
	session, err := client.NewSession()
	var osInfo string
	if err == nil {
		output, err := session.CombinedOutput("uname -srm; uptime -p 2>/dev/null || uptime")
		if err == nil {
			osInfo = strings.TrimSpace(string(output))
		}
		session.Close()
	}

	// Remote test for Port 25 outbound connectivity:
	// Try dialing standard SMTP port on known host
	port25Status := "closed"
	p25Session, err := client.NewSession()
	if err == nil {
		// Test outbound 25 connectivity
		cmd := `timeout 4 bash -c 'cat < /dev/null > /dev/tcp/smtp.gmail.com/25' 2>/dev/null && echo "PORT25_OK" || (nc -z -w 3 smtp.gmail.com 25 2>/dev/null && echo "PORT25_OK")`
		out, _ := p25Session.CombinedOutput(cmd)
		if strings.Contains(string(out), "PORT25_OK") {
			port25Status = "open"
		}
		p25Session.Close()
	}

	_ = s.updateTestStatus(ctx, id, "success", "", osInfo, port25Status)

	testRes.Success = true
	testRes.OSInfo = osInfo
	testRes.Port25Status = port25Status
	testRes.Message = fmt.Sprintf("SSH connection established successfully. Port 25 outbound is %s.", port25Status)
	return testRes, nil
}

func (s *PostgresMTAService) updateTestStatus(
	ctx context.Context,
	serverID uuid.UUID,
	status, lastErr, osInfo, port25Status string,
) error {
	var errPtr *string
	if lastErr != "" {
		errPtr = &lastErr
	}
	query := `
		UPDATE servers
		SET last_tested_at = NOW(),
		    last_test_status = $1,
		    last_test_error = $2,
		    os_info = CASE WHEN $3 != '' THEN $3 ELSE os_info END,
		    port_25_status = CASE WHEN $4 != 'unknown' THEN $4 ELSE port_25_status END,
		    updated_at = NOW()
		WHERE id = $5
	`
	_, err := s.db.Exec(ctx, query, status, errPtr, osInfo, port25Status, serverID)
	return err
}
