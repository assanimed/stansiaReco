package credentials

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
	ErrCredentialNotFound = errors.New("credential not found")
	ErrCredentialInUse    = errors.New("credential is in use by one or more servers and cannot be deleted")
)

type CredentialItem struct {
	ID          uuid.UUID      `json:"id"`
	Name        string         `json:"name"`
	CredType    CredentialType `json:"cred_type"`
	Username    string         `json:"username"`
	KeyVersion  int            `json:"key_version"`
	Fingerprint string         `json:"fingerprint"`
	Description string         `json:"description,omitempty"`
	ServerCount int            `json:"server_count"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type CreateCredentialRequest struct {
	Name        string         `json:"name"`
	CredType    CredentialType `json:"cred_type"` // "password", "private_key", "private_key_passphrase"
	Username    string         `json:"username"`
	Secret      string         `json:"secret"` // raw password or private key content
	Passphrase  string         `json:"passphrase,omitempty"`
	Description string         `json:"description,omitempty"`
}

type Service interface {
	ListCredentials(ctx context.Context, credType string) ([]CredentialItem, error)
	GetCredential(ctx context.Context, id uuid.UUID) (*CredentialItem, error)
	CreateCredential(ctx context.Context, req CreateCredentialRequest) (*CredentialItem, error)
	DeleteCredential(ctx context.Context, id uuid.UUID) error
}

type PostgresCredentialService struct {
	db    *pgxpool.Pool
	vault *Vault
}

func NewPostgresCredentialService(db *pgxpool.Pool, vault *Vault) *PostgresCredentialService {
	return &PostgresCredentialService{
		db:    db,
		vault: vault,
	}
}

func (s *PostgresCredentialService) ListCredentials(ctx context.Context, credType string) ([]CredentialItem, error) {
	query := `
		SELECT 
			c.id, c.name, c.cred_type, c.username, c.key_version, 
			COALESCE(c.fingerprint, ''), COALESCE(c.description, ''),
			COUNT(s.id) AS server_count,
			c.created_at, c.updated_at
		FROM credentials c
		LEFT JOIN servers s ON s.credential_id = c.id
	`
	var args []any
	cleanType := strings.TrimSpace(strings.ToLower(credType))

	if cleanType == "key" || cleanType == "private_key" {
		query += " WHERE c.cred_type IN ('private_key', 'private_key_passphrase')"
	} else if cleanType == "password" {
		query += " WHERE c.cred_type = 'password'"
	} else if cleanType != "" && cleanType != "all" {
		query += " WHERE c.cred_type = $1"
		args = append(args, cleanType)
	}

	query += `
		GROUP BY c.id, c.name, c.cred_type, c.username, c.key_version, c.fingerprint, c.description, c.created_at, c.updated_at
		ORDER BY c.created_at DESC
	`

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list credentials: %w", err)
	}
	defer rows.Close()

	var list []CredentialItem
	for rows.Next() {
		var item CredentialItem
		if err := rows.Scan(
			&item.ID, &item.Name, &item.CredType, &item.Username, &item.KeyVersion,
			&item.Fingerprint, &item.Description, &item.ServerCount,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan credential: %w", err)
		}
		list = append(list, item)
	}

	if list == nil {
		list = []CredentialItem{}
	}
	return list, nil
}

func (s *PostgresCredentialService) GetCredential(ctx context.Context, id uuid.UUID) (*CredentialItem, error) {
	query := `
		SELECT 
			c.id, c.name, c.cred_type, c.username, c.key_version, 
			COALESCE(c.fingerprint, ''), COALESCE(c.description, ''),
			COUNT(s.id) AS server_count,
			c.created_at, c.updated_at
		FROM credentials c
		LEFT JOIN servers s ON s.credential_id = c.id
		WHERE c.id = $1
		GROUP BY c.id, c.name, c.cred_type, c.username, c.key_version, c.fingerprint, c.description, c.created_at, c.updated_at
	`
	var item CredentialItem
	err := s.db.QueryRow(ctx, query, id).Scan(
		&item.ID, &item.Name, &item.CredType, &item.Username, &item.KeyVersion,
		&item.Fingerprint, &item.Description, &item.ServerCount,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCredentialNotFound
		}
		return nil, fmt.Errorf("failed to get credential: %w", err)
	}
	return &item, nil
}

func (s *PostgresCredentialService) CreateCredential(ctx context.Context, req CreateCredentialRequest) (*CredentialItem, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("credential name is required")
	}
	username := strings.TrimSpace(req.Username)
	if username == "" {
		username = "root"
	}
	secret := strings.TrimSpace(req.Secret)
	if secret == "" {
		return nil, errors.New("credential secret content is required")
	}

	var secretBytes []byte
	credType := req.CredType

	switch credType {
	case TypePassword:
		secretBytes = []byte(secret)
	case TypePrivateKey:
		if req.Passphrase != "" {
			credType = TypePrivateKeyWithPass
			secretBytes = []byte(secret + "\x00" + req.Passphrase)
		} else {
			secretBytes = []byte(secret)
		}
	case TypePrivateKeyWithPass:
		if req.Passphrase != "" {
			secretBytes = []byte(secret + "\x00" + req.Passphrase)
		} else {
			secretBytes = []byte(secret)
		}
	default:
		credType = TypePrivateKey
		secretBytes = []byte(secret)
	}

	encrypted, err := s.vault.Encrypt(secretBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt secret: %w", err)
	}

	fingerprint := CalculateFingerprint(secretBytes)
	id := uuid.New()
	now := time.Now().UTC()

	insertQuery := `
		INSERT INTO credentials (id, name, cred_type, username, encrypted_secret, key_version, fingerprint, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $8)
	`
	_, err = s.db.Exec(ctx, insertQuery, id, name, credType, username, encrypted, fingerprint, strings.TrimSpace(req.Description), now)
	if err != nil {
		return nil, fmt.Errorf("failed to insert credential: %w", err)
	}

	return &CredentialItem{
		ID:          id,
		Name:        name,
		CredType:    credType,
		Username:    username,
		KeyVersion:  1,
		Fingerprint: fingerprint,
		Description: strings.TrimSpace(req.Description),
		ServerCount: 0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (s *PostgresCredentialService) DeleteCredential(ctx context.Context, id uuid.UUID) error {
	var inUseCount int
	err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM servers WHERE credential_id = $1`, id).Scan(&inUseCount)
	if err != nil {
		return fmt.Errorf("failed to check credential usage: %w", err)
	}
	if inUseCount > 0 {
		return fmt.Errorf("%w: attached to %d server(s)", ErrCredentialInUse, inUseCount)
	}

	tag, err := s.db.Exec(ctx, `DELETE FROM credentials WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete credential: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrCredentialNotFound
	}
	return nil
}
