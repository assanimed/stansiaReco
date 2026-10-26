package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Action string

const (
	ActionView   Action = "view"
	ActionInsert Action = "insert"
	ActionUpdate Action = "update"
	ActionDelete Action = "delete"
)

// Standard system resources (pages / sections)
const (
	ResourceDashboard       = "dashboard"
	ResourceDomains         = "domains"
	ResourceDNS             = "dns"
	ResourceServers         = "servers"
	ResourceServerProviders = "server_providers"
	ResourceVMTAs           = "vmtas"
	ResourceProxies         = "proxies"
	ResourceCredentials     = "credentials"
	ResourceScripts         = "scripts"
	ResourceExecutions      = "executions"
	ResourceSettings        = "settings"
	ResourceUsers           = "users"
	ResourceAudit           = "audit"

	// Mail lists & contacts management resources
	ResourceMailLists        = "mail_lists"
	ResourceContacts         = "contacts"
	ResourceImports          = "imports"
	ResourceSuppressions     = "suppressions"
	ResourceMailboxProviders = "mailbox_providers"
	ResourceSendingESPs      = "sending_esps"
	ResourceSendingIPPools   = "sending_ip_pools"
	ResourceCountries        = "countries"
	ResourceVerticals        = "verticals"
	ResourceDataSettings     = "data_settings"
	ResourceCampaigns        = "campaigns"
)

var AllResources = []string{
	ResourceDashboard,
	ResourceDomains,
	ResourceDNS,
	ResourceServers,
	ResourceServerProviders,
	ResourceVMTAs,
	ResourceProxies,
	ResourceCredentials,
	ResourceScripts,
	ResourceExecutions,
	ResourceSettings,
	ResourceUsers,
	ResourceAudit,
	ResourceMailLists,
	ResourceContacts,
	ResourceImports,
	ResourceSuppressions,
	ResourceMailboxProviders,
	ResourceSendingESPs,
	ResourceSendingIPPools,
	ResourceCountries,
	ResourceVerticals,
	ResourceDataSettings,
	ResourceCampaigns,
}

type PermissionRule struct {
	Resource  string `json:"resource"`
	CanView   bool   `json:"can_view"`
	CanInsert bool   `json:"can_insert"`
	CanUpdate bool   `json:"can_update"`
	CanDelete bool   `json:"can_delete"`
}

type RBACService interface {
	HasPermission(ctx context.Context, userID uuid.UUID, role string, resource string, action Action) (bool, error)
	GetUserPermissions(ctx context.Context, userID uuid.UUID, role string) ([]PermissionRule, error)
	SetUserPermission(ctx context.Context, userID uuid.UUID, rule PermissionRule) error
	DeleteUserPermission(ctx context.Context, userID uuid.UUID, resource string) error
}

type PostgresRBACService struct {
	db *pgxpool.Pool
}

func NewPostgresRBACService(db *pgxpool.Pool) *PostgresRBACService {
	return &PostgresRBACService{db: db}
}

// HasPermission determines if a user possesses permission for a given resource and action
func (s *PostgresRBACService) HasPermission(
	ctx context.Context,
	userID uuid.UUID,
	role string,
	resource string,
	action Action,
) (bool, error) {
	// Administrator role has unrestricted access across all resources
	if role == "admin" {
		return true, nil
	}

	// 1. Check for explicit per-user override rule
	var userRule PermissionRule
	queryUser := `
		SELECT resource, can_view, can_insert, can_update, can_delete
		FROM user_permissions
		WHERE user_id = $1 AND resource = $2
	`
	err := s.db.QueryRow(ctx, queryUser, userID, resource).Scan(
		&userRule.Resource,
		&userRule.CanView,
		&userRule.CanInsert,
		&userRule.CanUpdate,
		&userRule.CanDelete,
	)
	if err == nil {
		return checkActionAllowed(userRule, action), nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return false, fmt.Errorf("failed to query user permissions: %w", err)
	}

	// 2. Fall back to role permissions
	var roleRule PermissionRule
	queryRole := `
		SELECT resource, can_view, can_insert, can_update, can_delete
		FROM role_permissions
		WHERE role_name = $1 AND resource = $2
	`
	err = s.db.QueryRow(ctx, queryRole, role, resource).Scan(
		&roleRule.Resource,
		&roleRule.CanView,
		&roleRule.CanInsert,
		&roleRule.CanUpdate,
		&roleRule.CanDelete,
	)
	if err == nil {
		return checkActionAllowed(roleRule, action), nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return false, fmt.Errorf("failed to query role permissions: %w", err)
	}

	// Default deny
	return false, nil
}

// GetUserPermissions aggregates effective permissions across all sections
func (s *PostgresRBACService) GetUserPermissions(
	ctx context.Context,
	userID uuid.UUID,
	role string,
) ([]PermissionRule, error) {
	// If admin, return full permission matrix for all known resources
	if role == "admin" {
		rules := make([]PermissionRule, len(AllResources))
		for i, res := range AllResources {
			rules[i] = PermissionRule{
				Resource:  res,
				CanView:   true,
				CanInsert: true,
				CanUpdate: true,
				CanDelete: true,
			}
		}
		return rules, nil
	}

	// Load user overrides map
	userOverrides := make(map[string]PermissionRule)
	queryUser := `
		SELECT resource, can_view, can_insert, can_update, can_delete
		FROM user_permissions
		WHERE user_id = $1
	`
	rowsUser, err := s.db.Query(ctx, queryUser, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to load user permissions: %w", err)
	}
	defer rowsUser.Close()

	for rowsUser.Next() {
		var r PermissionRule
		if err := rowsUser.Scan(&r.Resource, &r.CanView, &r.CanInsert, &r.CanUpdate, &r.CanDelete); err != nil {
			return nil, err
		}
		userOverrides[r.Resource] = r
	}

	// Load role permissions map
	roleRules := make(map[string]PermissionRule)
	queryRole := `
		SELECT resource, can_view, can_insert, can_update, can_delete
		FROM role_permissions
		WHERE role_name = $1
	`
	rowsRole, err := s.db.Query(ctx, queryRole, role)
	if err != nil {
		return nil, fmt.Errorf("failed to load role permissions: %w", err)
	}
	defer rowsRole.Close()

	for rowsRole.Next() {
		var r PermissionRule
		if err := rowsRole.Scan(&r.Resource, &r.CanView, &r.CanInsert, &r.CanUpdate, &r.CanDelete); err != nil {
			return nil, err
		}
		roleRules[r.Resource] = r
	}

	// Combine rules: user override takes precedence over role rule
	results := make([]PermissionRule, 0, len(AllResources))
	for _, res := range AllResources {
		if rule, ok := userOverrides[res]; ok {
			results = append(results, rule)
		} else if rule, ok := roleRules[res]; ok {
			results = append(results, rule)
		} else {
			results = append(results, PermissionRule{
				Resource:  res,
				CanView:   false,
				CanInsert: false,
				CanUpdate: false,
				CanDelete: false,
			})
		}
	}

	return results, nil
}

// SetUserPermission sets or updates a custom permission rule for a specific user
func (s *PostgresRBACService) SetUserPermission(
	ctx context.Context,
	userID uuid.UUID,
	rule PermissionRule,
) error {
	query := `
		INSERT INTO user_permissions (id, user_id, resource, can_view, can_insert, can_update, can_delete, updated_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (user_id, resource)
		DO UPDATE SET
			can_view = EXCLUDED.can_view,
			can_insert = EXCLUDED.can_insert,
			can_update = EXCLUDED.can_update,
			can_delete = EXCLUDED.can_delete,
			updated_at = NOW()
	`
	_, err := s.db.Exec(ctx, query,
		userID,
		rule.Resource,
		rule.CanView,
		rule.CanInsert,
		rule.CanUpdate,
		rule.CanDelete,
	)
	if err != nil {
		return fmt.Errorf("failed to upsert user permission: %w", err)
	}
	return nil
}

// DeleteUserPermission removes a custom permission rule, reverting the user to role defaults
func (s *PostgresRBACService) DeleteUserPermission(ctx context.Context, userID uuid.UUID, resource string) error {
	_, err := s.db.Exec(ctx, "DELETE FROM user_permissions WHERE user_id = $1 AND resource = $2", userID, resource)
	if err != nil {
		return fmt.Errorf("failed to delete user permission: %w", err)
	}
	return nil
}

func checkActionAllowed(rule PermissionRule, action Action) bool {
	switch action {
	case ActionView:
		return rule.CanView
	case ActionInsert:
		return rule.CanInsert
	case ActionUpdate:
		return rule.CanUpdate
	case ActionDelete:
		return rule.CanDelete
	default:
		return false
	}
}
