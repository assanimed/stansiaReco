package servers

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrVMTANotFound = errors.New("VMTA not found")
	ErrVMTADuplicate = errors.New("a VMTA with this name already exists for this server")
)

type VMTA struct {
	ID         uuid.UUID  `json:"id"`
	ServerID   uuid.UUID  `json:"server_id"`
	ServerName string     `json:"server_name,omitempty"`
	ServerIPID *uuid.UUID `json:"server_ip_id,omitempty"`
	VMTAName   string     `json:"vmta_name"`
	IPAddress  string     `json:"ip_address"`
	DomainName string     `json:"domain_name,omitempty"`
	HostName   string     `json:"host_name,omitempty"`
	Status     string     `json:"status"` // "active", "paused", "disabled"
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type CreateVMTARequest struct {
	ServerID   uuid.UUID  `json:"server_id"`
	ServerIPID *uuid.UUID `json:"server_ip_id,omitempty"`
	VMTAName   string     `json:"vmta_name"`
	IPAddress  string     `json:"ip_address"`
	DomainName string     `json:"domain_name,omitempty"`
	HostName   string     `json:"host_name,omitempty"`
}

type BulkCreateVMTAsRequest struct {
	ServerID uuid.UUID `json:"server_id"`
	RawLines string    `json:"raw_lines"` // formats: vmta_name:ip:domain or ip:domain
}

type VMTAService interface {
	ListVMTAs(ctx context.Context, serverID *uuid.UUID) ([]VMTA, error)
	GetVMTA(ctx context.Context, id uuid.UUID) (*VMTA, error)
	CreateVMTA(ctx context.Context, req CreateVMTARequest) (*VMTA, error)
	BulkCreateVMTAs(ctx context.Context, req BulkCreateVMTAsRequest) ([]VMTA, error)
	DeleteVMTA(ctx context.Context, id uuid.UUID) error
	UpdateVMTAStatus(ctx context.Context, id uuid.UUID, status string) error
	GenerateVMTAConfig(ctx context.Context, serverID uuid.UUID, mtaType string) (string, error)
}

type PostgresVMTAService struct {
	db *pgxpool.Pool
}

func NewPostgresVMTAService(db *pgxpool.Pool) *PostgresVMTAService {
	return &PostgresVMTAService{db: db}
}

func (s *PostgresVMTAService) ListVMTAs(ctx context.Context, serverID *uuid.UUID) ([]VMTA, error) {
	query := `
		SELECT 
			v.id, v.server_id, s.name, v.server_ip_id, v.vmta_name,
			v.ip_address, COALESCE(v.domain_name, ''), COALESCE(v.host_name, ''),
			v.status, v.created_at, v.updated_at
		FROM vmtas v
		JOIN servers s ON v.server_id = s.id
		WHERE 1=1
	`
	args := []any{}
	if serverID != nil {
		query += " AND v.server_id = $1"
		args = append(args, *serverID)
	}
	query += " ORDER BY v.vmta_name ASC"

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query VMTAs: %w", err)
	}
	defer rows.Close()

	var list []VMTA
	for rows.Next() {
		var item VMTA
		var ipID *uuid.UUID
		err := rows.Scan(
			&item.ID, &item.ServerID, &item.ServerName, &ipID, &item.VMTAName,
			&item.IPAddress, &item.DomainName, &item.HostName,
			&item.Status, &item.CreatedAt, &item.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan VMTA: %w", err)
		}
		item.ServerIPID = ipID
		list = append(list, item)
	}

	if list == nil {
		list = []VMTA{}
	}
	return list, nil
}

func (s *PostgresVMTAService) GetVMTA(ctx context.Context, id uuid.UUID) (*VMTA, error) {
	query := `
		SELECT 
			v.id, v.server_id, s.name, v.server_ip_id, v.vmta_name,
			v.ip_address, COALESCE(v.domain_name, ''), COALESCE(v.host_name, ''),
			v.status, v.created_at, v.updated_at
		FROM vmtas v
		JOIN servers s ON v.server_id = s.id
		WHERE v.id = $1
	`
	var item VMTA
	var ipID *uuid.UUID
	err := s.db.QueryRow(ctx, query, id).Scan(
		&item.ID, &item.ServerID, &item.ServerName, &ipID, &item.VMTAName,
		&item.IPAddress, &item.DomainName, &item.HostName,
		&item.Status, &item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrVMTANotFound
		}
		return nil, fmt.Errorf("failed to get VMTA: %w", err)
	}
	item.ServerIPID = ipID
	return &item, nil
}

func (s *PostgresVMTAService) CreateVMTA(ctx context.Context, req CreateVMTARequest) (*VMTA, error) {
	req.VMTAName = strings.TrimSpace(req.VMTAName)
	req.IPAddress = strings.TrimSpace(req.IPAddress)
	if req.VMTAName == "" {
		req.VMTAName = fmt.Sprintf("vmta_%s", strings.ReplaceAll(req.IPAddress, ".", "_"))
	}
	if req.IPAddress == "" {
		return nil, errors.New("IP address is required for VMTA")
	}

	var exists bool
	err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM vmtas WHERE server_id = $1 AND vmta_name = $2)", req.ServerID, req.VMTAName).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing VMTA: %w", err)
	}
	if exists {
		return nil, ErrVMTADuplicate
	}

	id := uuid.New()
	query := `
		INSERT INTO vmtas (
			id, server_id, server_ip_id, vmta_name, ip_address, domain_name, host_name, status, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW()
		)
	`
	var dom, host *string
	if req.DomainName != "" {
		dom = &req.DomainName
	}
	if req.HostName != "" {
		host = &req.HostName
	}

	_, err = s.db.Exec(ctx, query, id, req.ServerID, req.ServerIPID, req.VMTAName, req.IPAddress, dom, host)
	if err != nil {
		return nil, fmt.Errorf("failed to insert VMTA: %w", err)
	}

	return s.GetVMTA(ctx, id)
}

func (s *PostgresVMTAService) BulkCreateVMTAs(ctx context.Context, req BulkCreateVMTAsRequest) ([]VMTA, error) {
	scanner := bufio.NewScanner(strings.NewReader(req.RawLines))
	var created []VMTA

	for scanner.Scan() {
		raw := strings.TrimSpace(scanner.Text())
		if raw == "" || strings.HasPrefix(raw, "#") {
			continue
		}
		var parts []string
		if strings.Contains(raw, ":") {
			parts = strings.Split(raw, ":")
		} else if strings.Contains(raw, ",") {
			parts = strings.Split(raw, ",")
		} else {
			parts = strings.Fields(raw)
		}

		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}

		var vmtaName, ip, domain, host string
		switch len(parts) {
		case 1:
			ip = parts[0]
			vmtaName = "vmta_" + strings.ReplaceAll(ip, ".", "_")
		case 2:
			// ip:domain or vmta_name:ip
			if strings.Contains(parts[0], ".") && !strings.Contains(parts[0], "_") {
				ip = parts[0]
				domain = parts[1]
				vmtaName = "vmta_" + strings.ReplaceAll(ip, ".", "_")
			} else {
				vmtaName = parts[0]
				ip = parts[1]
			}
		case 3:
			// vmta_name:ip:domain
			vmtaName = parts[0]
			ip = parts[1]
			domain = parts[2]
		case 4:
			// vmta_name:ip:domain:hostname
			vmtaName = parts[0]
			ip = parts[1]
			domain = parts[2]
			host = parts[3]
		}

		if host == "" && domain != "" {
			host = "mail." + domain
		}

		item, err := s.CreateVMTA(ctx, CreateVMTARequest{
			ServerID:   req.ServerID,
			VMTAName:   vmtaName,
			IPAddress:  ip,
			DomainName: domain,
			HostName:   host,
		})
		if err == nil && item != nil {
			created = append(created, *item)
		}
	}

	return created, nil
}

func (s *PostgresVMTAService) DeleteVMTA(ctx context.Context, id uuid.UUID) error {
	tag, err := s.db.Exec(ctx, "DELETE FROM vmtas WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete VMTA: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrVMTANotFound
	}
	return nil
}

func (s *PostgresVMTAService) UpdateVMTAStatus(ctx context.Context, id uuid.UUID, status string) error {
	tag, err := s.db.Exec(ctx, "UPDATE vmtas SET status = $1, updated_at = NOW() WHERE id = $2", status, id)
	if err != nil {
		return fmt.Errorf("failed to update VMTA status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrVMTANotFound
	}
	return nil
}

func (s *PostgresVMTAService) GenerateVMTAConfig(ctx context.Context, serverID uuid.UUID, mtaType string) (string, error) {
	vmtas, err := s.ListVMTAs(ctx, &serverID)
	if err != nil {
		return "", err
	}
	if len(vmtas) == 0 {
		return "", errors.New("no VMTAs configured for this server")
	}

	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("# ==============================================================================\n"))
	buf.WriteString(fmt.Sprintf("# StansiaReco Auto-Generated VMTA Configuration (%s)\n", strings.ToUpper(mtaType)))
	buf.WriteString(fmt.Sprintf("# Generated at: %s | Total VMTAs: %d\n", time.Now().UTC().Format(time.RFC3339), len(vmtas)))
	buf.WriteString(fmt.Sprintf("# ==============================================================================\n\n"))

	if strings.ToLower(mtaType) == "powermta" {
		for _, v := range vmtas {
			buf.WriteString(fmt.Sprintf("<virtual-mta %s>\n", v.VMTAName))
			host := v.HostName
			if host == "" {
				host = v.DomainName
			}
			if host != "" {
				buf.WriteString(fmt.Sprintf("    smtp-source-host %s %s\n", v.IPAddress, host))
			} else {
				buf.WriteString(fmt.Sprintf("    smtp-source-ip %s\n", v.IPAddress))
			}
			buf.WriteString(fmt.Sprintf("</virtual-mta>\n\n"))
		}
		// Virtual MTA Pool
		buf.WriteString("<virtual-mta-pool default-pool>\n")
		for _, v := range vmtas {
			buf.WriteString(fmt.Sprintf("    virtual-mta %s\n", v.VMTAName))
		}
		buf.WriteString("</virtual-mta-pool>\n")
	} else {
		// Postfix syntax: master.cf transport definitions & sender_dependent_default_transport_maps
		buf.WriteString("# --- Add to /etc/postfix/master.cf ---\n")
		for _, v := range vmtas {
			helo := v.HostName
			if helo == "" {
				helo = v.DomainName
			}
			buf.WriteString(fmt.Sprintf("%s unix - - n - - smtp\n", v.VMTAName))
			buf.WriteString(fmt.Sprintf("    -o smtp_bind_address=%s\n", v.IPAddress))
			if helo != "" {
				buf.WriteString(fmt.Sprintf("    -o smtp_helo_name=%s\n", helo))
			}
			buf.WriteString(fmt.Sprintf("    -o syslog_name=postfix-%s\n\n", v.VMTAName))
		}

		buf.WriteString("# --- Add to /etc/postfix/sender_dependent_transport_maps (then run postmap) ---\n")
		for _, v := range vmtas {
			if v.DomainName != "" {
				buf.WriteString(fmt.Sprintf("@%s    %s:\n", v.DomainName, v.VMTAName))
			}
		}
	}

	return buf.String(), nil
}
