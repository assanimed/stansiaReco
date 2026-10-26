package users_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"stansiareco/backend/internal/auth"
	"stansiareco/backend/internal/users"
)

type mockHasher struct{}

func (m *mockHasher) HashPassword(password string) (string, error) {
	return "$argon2id$v=19$mockhash$" + password, nil
}

func (m *mockHasher) VerifyPassword(password, encodedHash string) (bool, error) {
	return encodedHash == "$argon2id$v=19$mockhash$"+password, nil
}

type mockRBAC struct{}

func (m *mockRBAC) HasPermission(ctx context.Context, userID uuid.UUID, role string, resource string, action auth.Action) (bool, error) {
	return true, nil
}

func (m *mockRBAC) GetUserPermissions(ctx context.Context, userID uuid.UUID, role string) ([]auth.PermissionRule, error) {
	return []auth.PermissionRule{
		{Resource: auth.ResourceServers, CanView: true, CanInsert: false, CanUpdate: false, CanDelete: false},
	}, nil
}

func (m *mockRBAC) SetUserPermission(ctx context.Context, userID uuid.UUID, rule auth.PermissionRule) error {
	return nil
}

func (m *mockRBAC) DeleteUserPermission(ctx context.Context, userID uuid.UUID, resource string) error {
	return nil
}

func TestValidationErrors(t *testing.T) {
	service := users.NewPostgresUserService(nil, &mockHasher{}, &mockRBAC{})
	ctx := context.Background()

	// Missing fields
	_, err := service.CreateUser(ctx, users.CreateUserRequest{
		Email:    "",
		Password: "pass",
		FullName: "Name",
		Role:     "operator",
	})
	if err == nil {
		t.Fatal("expected error for empty email, got nil")
	}

	// Invalid role
	_, err = service.CreateUser(ctx, users.CreateUserRequest{
		Email:    "test@user.local",
		Password: "pass",
		FullName: "Name",
		Role:     "superadmin", // invalid
	})
	if err != users.ErrInvalidRole {
		t.Fatalf("expected ErrInvalidRole, got: %v", err)
	}

	// Self-deletion blocked
	sameID := uuid.New()
	err = service.DeleteUser(ctx, sameID, sameID)
	if err != users.ErrCannotDeleteSelf {
		t.Fatalf("expected ErrCannotDeleteSelf, got: %v", err)
	}
}
