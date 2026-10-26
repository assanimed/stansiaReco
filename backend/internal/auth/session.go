package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalidSession = errors.New("invalid or expired session")
	ErrUserDisabled   = errors.New("user account is inactive")
)

type Session struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	TokenHash string    `json:"-"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

type AuthenticatedUser struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type SessionContext struct {
	Session *Session
	User    *AuthenticatedUser
}

type SessionManager interface {
	CreateSession(ctx context.Context, userID uuid.UUID, ipAddress, userAgent string, ttl time.Duration) (string, *Session, error)
	ValidateSession(ctx context.Context, rawToken string) (*SessionContext, error)
	InvalidateSession(ctx context.Context, rawToken string) error
	InvalidateAllUserSessions(ctx context.Context, userID uuid.UUID) error
	CleanupExpiredSessions(ctx context.Context) (int64, error)
}

type PostgresSessionManager struct {
	db *pgxpool.Pool
}

func NewPostgresSessionManager(db *pgxpool.Pool) *PostgresSessionManager {
	return &PostgresSessionManager{db: db}
}

// GenerateSessionToken creates a 32-byte cryptographically random hex token
func GenerateSessionToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random session token: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

// HashSessionToken computes SHA-256 hex digest of the raw session token
func HashSessionToken(rawToken string) string {
	hash := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(hash[:])
}

// CreateSession generates a new session and persists only the token hash
func (m *PostgresSessionManager) CreateSession(
	ctx context.Context,
	userID uuid.UUID,
	ipAddress, userAgent string,
	ttl time.Duration,
) (string, *Session, error) {
	rawToken, err := GenerateSessionToken()
	if err != nil {
		return "", nil, err
	}

	tokenHash := HashSessionToken(rawToken)
	expiresAt := time.Now().UTC().Add(ttl)

	session := &Session{
		ID:        uuid.New(),
		UserID:    userID,
		TokenHash: tokenHash,
		IPAddress: ipAddress,
		UserAgent: userAgent,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now().UTC(),
	}

	query := `
		INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err = m.db.Exec(ctx, query,
		session.ID,
		session.UserID,
		session.TokenHash,
		session.IPAddress,
		session.UserAgent,
		session.ExpiresAt,
		session.CreatedAt,
	)
	if err != nil {
		return "", nil, fmt.Errorf("failed to insert session: %w", err)
	}

	return rawToken, session, nil
}

// ValidateSession verifies session token and returns active session & user details
func (m *PostgresSessionManager) ValidateSession(ctx context.Context, rawToken string) (*SessionContext, error) {
	if rawToken == "" {
		return nil, ErrInvalidSession
	}

	tokenHash := HashSessionToken(rawToken)

	query := `
		SELECT 
			s.id, s.user_id, s.token_hash, s.ip_address, s.user_agent, s.expires_at, s.created_at,
			u.id, u.email, u.full_name, u.role, u.is_active, u.created_at, u.updated_at
		FROM sessions s
		JOIN users u ON s.user_id = u.id
		WHERE s.token_hash = $1
	`

	var s Session
	var u AuthenticatedUser

	err := m.db.QueryRow(ctx, query, tokenHash).Scan(
		&s.ID, &s.UserID, &s.TokenHash, &s.IPAddress, &s.UserAgent, &s.ExpiresAt, &s.CreatedAt,
		&u.ID, &u.Email, &u.FullName, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidSession
		}
		return nil, fmt.Errorf("failed to query session: %w", err)
	}

	// Verify expiration
	if time.Now().UTC().After(s.ExpiresAt) {
		// Clean up expired session asynchronously or synchronously
		_ = m.InvalidateSession(ctx, rawToken)
		return nil, ErrInvalidSession
	}

	// Verify user active status
	if !u.IsActive {
		return nil, ErrUserDisabled
	}

	return &SessionContext{
		Session: &s,
		User:    &u,
	}, nil
}

// InvalidateSession deletes a session by token
func (m *PostgresSessionManager) InvalidateSession(ctx context.Context, rawToken string) error {
	if rawToken == "" {
		return nil
	}

	tokenHash := HashSessionToken(rawToken)
	_, err := m.db.Exec(ctx, "DELETE FROM sessions WHERE token_hash = $1", tokenHash)
	if err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	return nil
}

// InvalidateAllUserSessions removes all active sessions for a user
func (m *PostgresSessionManager) InvalidateAllUserSessions(ctx context.Context, userID uuid.UUID) error {
	_, err := m.db.Exec(ctx, "DELETE FROM sessions WHERE user_id = $1", userID)
	if err != nil {
		return fmt.Errorf("failed to delete user sessions: %w", err)
	}
	return nil
}

// CleanupExpiredSessions purges expired sessions from the database
func (m *PostgresSessionManager) CleanupExpiredSessions(ctx context.Context) (int64, error) {
	tag, err := m.db.Exec(ctx, "DELETE FROM sessions WHERE expires_at <= NOW()")
	if err != nil {
		return 0, fmt.Errorf("failed to clean up expired sessions: %w", err)
	}
	return tag.RowsAffected(), nil
}
