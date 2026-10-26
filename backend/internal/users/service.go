package users

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/auth"
)

var (
	ErrUserNotFound    = errors.New("user not found")
	ErrEmailExists     = errors.New("a user with this email already exists")
	ErrCannotDeleteSelf = errors.New("you cannot delete your own account")
	ErrInvalidRole     = errors.New("invalid role: must be admin, operator, or viewer")
)

type User struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type UserWithPermissions struct {
	User
	Permissions []auth.PermissionRule `json:"permissions"`
}

type CreateUserRequest struct {
	Email       string                 `json:"email"`
	Password    string                 `json:"password"`
	FullName    string                 `json:"full_name"`
	Role        string                 `json:"role"`
	IsActive    *bool                  `json:"is_active"`
	Permissions []auth.PermissionRule `json:"permissions,omitempty"`
}

type UpdateUserRequest struct {
	FullName    *string                `json:"full_name,omitempty"`
	Role        *string                `json:"role,omitempty"`
	Password    *string                `json:"password,omitempty"`
	IsActive    *bool                  `json:"is_active,omitempty"`
	Permissions []auth.PermissionRule `json:"permissions,omitempty"`
}

type Service interface {
	ListUsers(ctx context.Context) ([]UserWithPermissions, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (*UserWithPermissions, error)
	CreateUser(ctx context.Context, req CreateUserRequest) (*UserWithPermissions, error)
	UpdateUser(ctx context.Context, id uuid.UUID, req UpdateUserRequest) (*UserWithPermissions, error)
	DeleteUser(ctx context.Context, id uuid.UUID, requestingUserID uuid.UUID) error
}

type PostgresUserService struct {
	db     *pgxpool.Pool
	hasher auth.PasswordHasher
	rbac   auth.RBACService
}

func NewPostgresUserService(db *pgxpool.Pool, hasher auth.PasswordHasher, rbac auth.RBACService) *PostgresUserService {
	return &PostgresUserService{
		db:     db,
		hasher: hasher,
		rbac:   rbac,
	}
}

// ListUsers retrieves all users ordered by creation date
func (s *PostgresUserService) ListUsers(ctx context.Context) ([]UserWithPermissions, error) {
	query := `
		SELECT id, email, full_name, role, is_active, created_at, updated_at
		FROM users
		ORDER BY created_at ASC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var result []UserWithPermissions
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}

		perms, err := s.rbac.GetUserPermissions(ctx, u.ID, u.Role)
		if err != nil {
			return nil, fmt.Errorf("failed to get permissions for user %s: %w", u.ID, err)
		}

		result = append(result, UserWithPermissions{
			User:        u,
			Permissions: perms,
		})
	}

	if result == nil {
		result = []UserWithPermissions{}
	}

	return result, nil
}

// GetUserByID retrieves a specific user by ID along with their effective permissions
func (s *PostgresUserService) GetUserByID(ctx context.Context, id uuid.UUID) (*UserWithPermissions, error) {
	query := `
		SELECT id, email, full_name, role, is_active, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	var u User
	err := s.db.QueryRow(ctx, query, id).Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to query user: %w", err)
	}

	perms, err := s.rbac.GetUserPermissions(ctx, u.ID, u.Role)
	if err != nil {
		return nil, fmt.Errorf("failed to get permissions: %w", err)
	}

	return &UserWithPermissions{
		User:        u,
		Permissions: perms,
	}, nil
}

// CreateUser creates a new user, hashes password with Argon2id, and stores custom permission rules if provided
func (s *PostgresUserService) CreateUser(ctx context.Context, req CreateUserRequest) (*UserWithPermissions, error) {
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.FullName = strings.TrimSpace(req.FullName)
	req.Role = strings.TrimSpace(strings.ToLower(req.Role))

	if req.Email == "" || req.Password == "" || req.FullName == "" {
		return nil, errors.New("email, password, and full name are required")
	}
	if req.Role != "admin" && req.Role != "operator" && req.Role != "viewer" {
		return nil, ErrInvalidRole
	}

	// Check for existing email
	var exists bool
	err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)", req.Email).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing user: %w", err)
	}
	if exists {
		return nil, ErrEmailExists
	}

	passwordHash, err := s.hasher.HashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	newID := uuid.New()
	insertQuery := `
		INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		RETURNING created_at, updated_at
	`
	var createdAt, updatedAt time.Time
	err = s.db.QueryRow(ctx, insertQuery, newID, req.Email, passwordHash, req.FullName, req.Role, isActive).Scan(&createdAt, &updatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert user: %w", err)
	}

	// Save custom user permissions overrides if supplied
	for _, rule := range req.Permissions {
		if err := s.rbac.SetUserPermission(ctx, newID, rule); err != nil {
			return nil, fmt.Errorf("failed to save permission for %s: %w", rule.Resource, err)
		}
	}

	perms, err := s.rbac.GetUserPermissions(ctx, newID, req.Role)
	if err != nil {
		return nil, err
	}

	return &UserWithPermissions{
		User: User{
			ID:        newID,
			Email:     req.Email,
			FullName:  req.FullName,
			Role:      req.Role,
			IsActive:  isActive,
			CreatedAt: createdAt,
			UpdatedAt: updatedAt,
		},
		Permissions: perms,
	}, nil
}

// UpdateUser modifies an existing user and updates custom permissions
func (s *PostgresUserService) UpdateUser(ctx context.Context, id uuid.UUID, req UpdateUserRequest) (*UserWithPermissions, error) {
	current, err := s.GetUserByID(ctx, id)
	if err != nil {
		return nil, err
	}

	fullName := current.FullName
	if req.FullName != nil && strings.TrimSpace(*req.FullName) != "" {
		fullName = strings.TrimSpace(*req.FullName)
	}

	role := current.Role
	if req.Role != nil {
		newRole := strings.TrimSpace(strings.ToLower(*req.Role))
		if newRole != "admin" && newRole != "operator" && newRole != "viewer" {
			return nil, ErrInvalidRole
		}
		role = newRole
	}

	isActive := current.IsActive
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	var passwordHash *string
	if req.Password != nil && strings.TrimSpace(*req.Password) != "" {
		hashed, err := s.hasher.HashPassword(*req.Password)
		if err != nil {
			return nil, fmt.Errorf("failed to hash new password: %w", err)
		}
		passwordHash = &hashed
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if passwordHash != nil {
		query := `
			UPDATE users
			SET full_name = $1, role = $2, is_active = $3, password_hash = $4, updated_at = NOW()
			WHERE id = $5
		`
		_, err = tx.Exec(ctx, query, fullName, role, isActive, *passwordHash, id)
	} else {
		query := `
			UPDATE users
			SET full_name = $1, role = $2, is_active = $3, updated_at = NOW()
			WHERE id = $4
		`
		_, err = tx.Exec(ctx, query, fullName, role, isActive, id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	// Update custom user permissions if provided
	if req.Permissions != nil {
		// Clear existing user permissions for this user
		_, err = tx.Exec(ctx, "DELETE FROM user_permissions WHERE user_id = $1", id)
		if err != nil {
			return nil, fmt.Errorf("failed to reset user permissions: %w", err)
		}

		for _, rule := range req.Permissions {
			insertPerm := `
				INSERT INTO user_permissions (id, user_id, resource, can_view, can_insert, can_update, can_delete, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
			`
			_, err = tx.Exec(ctx, insertPerm, id, rule.Resource, rule.CanView, rule.CanInsert, rule.CanUpdate, rule.CanDelete)
			if err != nil {
				return nil, fmt.Errorf("failed to insert user permission: %w", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit update: %w", err)
	}

	return s.GetUserByID(ctx, id)
}

// DeleteUser removes a user and their cascading sessions and permission overrides
func (s *PostgresUserService) DeleteUser(ctx context.Context, id uuid.UUID, requestingUserID uuid.UUID) error {
	if id == requestingUserID {
		return ErrCannotDeleteSelf
	}

	tag, err := s.db.Exec(ctx, "DELETE FROM users WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}

	return nil
}
