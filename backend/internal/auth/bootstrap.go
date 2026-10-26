package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EnsureAdminUser ensures that an initial administrator account exists in the database
func EnsureAdminUser(
	ctx context.Context,
	db *pgxpool.Pool,
	hasher PasswordHasher,
	email, password, fullName string,
) (*AuthenticatedUser, error) {
	if email == "" || password == "" {
		return nil, errors.New("admin email and password cannot be empty")
	}
	if fullName == "" {
		fullName = "System Administrator"
	}

	queryFind := `
		SELECT id, email, full_name, role, is_active, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	var user AuthenticatedUser
	err := db.QueryRow(ctx, queryFind, email).Scan(
		&user.ID,
		&user.Email,
		&user.FullName,
		&user.Role,
		&user.IsActive,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err == nil {
		slog.Debug("Administrator account already exists", "email", email)
		return &user, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("failed to check existing admin user: %w", err)
	}

	// Create the administrator
	passwordHash, err := hasher.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash admin password: %w", err)
	}

	user.ID = uuid.New()
	user.Email = email
	user.FullName = fullName
	user.Role = "admin"
	user.IsActive = true

	insertQuery := `
		INSERT INTO users (id, email, password_hash, role, full_name, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		RETURNING created_at, updated_at
	`
	err = db.QueryRow(ctx, insertQuery,
		user.ID,
		user.Email,
		passwordHash,
		user.Role,
		user.FullName,
		user.IsActive,
	).Scan(&user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert initial administrator: %w", err)
	}

	slog.Info("Initial administrator account bootstrapped successfully",
		"id", user.ID,
		"email", user.Email,
		"role", user.Role,
	)

	return &user, nil
}
