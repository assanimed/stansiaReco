package servers

import (
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
	ErrProviderNotFound = errors.New("server provider not found")
	ErrProviderExists   = errors.New("a provider with this name already exists")
)

type ServerProvider struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Port25Open  bool      `json:"port_25_open"`
	Website     string    `json:"website,omitempty"`
	Description string    `json:"description,omitempty"`
	ServerCount int       `json:"server_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateProviderRequest struct {
	Name        string `json:"name"`
	Port25Open  bool   `json:"port_25_open"`
	Website     string `json:"website,omitempty"`
	Description string `json:"description,omitempty"`
}

type UpdateProviderRequest struct {
	Name        *string `json:"name,omitempty"`
	Port25Open  *bool   `json:"port_25_open,omitempty"`
	Website     *string `json:"website,omitempty"`
	Description *string `json:"description,omitempty"`
}

type ProviderService interface {
	ListProviders(ctx context.Context) ([]ServerProvider, error)
	GetProvider(ctx context.Context, id uuid.UUID) (*ServerProvider, error)
	CreateProvider(ctx context.Context, req CreateProviderRequest) (*ServerProvider, error)
	UpdateProvider(ctx context.Context, id uuid.UUID, req UpdateProviderRequest) (*ServerProvider, error)
	DeleteProvider(ctx context.Context, id uuid.UUID) error
}

type PostgresProviderService struct {
	db *pgxpool.Pool
}

func NewPostgresProviderService(db *pgxpool.Pool) *PostgresProviderService {
	return &PostgresProviderService{db: db}
}

func (s *PostgresProviderService) ListProviders(ctx context.Context) ([]ServerProvider, error) {
	query := `
		SELECT 
			p.id, p.name, p.port_25_open, COALESCE(p.website, ''), COALESCE(p.description, ''),
			p.created_at, p.updated_at,
			(SELECT COUNT(*) FROM servers s WHERE s.provider_id = p.id) as server_count
		FROM server_providers p
		ORDER BY p.name ASC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query server providers: %w", err)
	}
	defer rows.Close()

	var list []ServerProvider
	for rows.Next() {
		var p ServerProvider
		if err := rows.Scan(&p.ID, &p.Name, &p.Port25Open, &p.Website, &p.Description, &p.CreatedAt, &p.UpdatedAt, &p.ServerCount); err != nil {
			return nil, fmt.Errorf("failed to scan provider: %w", err)
		}
		list = append(list, p)
	}
	if list == nil {
		list = []ServerProvider{}
	}
	return list, nil
}

func (s *PostgresProviderService) GetProvider(ctx context.Context, id uuid.UUID) (*ServerProvider, error) {
	query := `
		SELECT 
			p.id, p.name, p.port_25_open, COALESCE(p.website, ''), COALESCE(p.description, ''),
			p.created_at, p.updated_at,
			(SELECT COUNT(*) FROM servers s WHERE s.provider_id = p.id) as server_count
		FROM server_providers p
		WHERE p.id = $1
	`
	var p ServerProvider
	err := s.db.QueryRow(ctx, query, id).Scan(&p.ID, &p.Name, &p.Port25Open, &p.Website, &p.Description, &p.CreatedAt, &p.UpdatedAt, &p.ServerCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProviderNotFound
		}
		return nil, fmt.Errorf("failed to get provider: %w", err)
	}
	return &p, nil
}

func (s *PostgresProviderService) CreateProvider(ctx context.Context, req CreateProviderRequest) (*ServerProvider, error) {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return nil, errors.New("provider name cannot be empty")
	}

	var exists bool
	err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM server_providers WHERE LOWER(name) = LOWER($1))", req.Name).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing provider: %w", err)
	}
	if exists {
		return nil, ErrProviderExists
	}

	p := ServerProvider{
		ID:          uuid.New(),
		Name:        req.Name,
		Port25Open:  req.Port25Open,
		Website:     strings.TrimSpace(req.Website),
		Description: strings.TrimSpace(req.Description),
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	query := `
		INSERT INTO server_providers (id, name, port_25_open, website, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err = s.db.Exec(ctx, query, p.ID, p.Name, p.Port25Open, p.Website, p.Description, p.CreatedAt, p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert provider: %w", err)
	}

	return &p, nil
}

func (s *PostgresProviderService) UpdateProvider(ctx context.Context, id uuid.UUID, req UpdateProviderRequest) (*ServerProvider, error) {
	current, err := s.GetProvider(ctx, id)
	if err != nil {
		return nil, err
	}

	name := current.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}

	port25Open := current.Port25Open
	if req.Port25Open != nil {
		port25Open = *req.Port25Open
	}

	website := current.Website
	if req.Website != nil {
		website = strings.TrimSpace(*req.Website)
	}

	desc := current.Description
	if req.Description != nil {
		desc = strings.TrimSpace(*req.Description)
	}

	query := `
		UPDATE server_providers
		SET name = $1, port_25_open = $2, website = $3, description = $4, updated_at = NOW()
		WHERE id = $5
	`
	_, err = s.db.Exec(ctx, query, name, port25Open, website, desc, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update provider: %w", err)
	}

	return s.GetProvider(ctx, id)
}

func (s *PostgresProviderService) DeleteProvider(ctx context.Context, id uuid.UUID) error {
	tag, err := s.db.Exec(ctx, "DELETE FROM server_providers WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete provider: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrProviderNotFound
	}
	return nil
}
