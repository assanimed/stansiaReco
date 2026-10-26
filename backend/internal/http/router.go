package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"stansiareco/backend/internal/auth"
	"stansiareco/backend/internal/config"
	"stansiareco/backend/internal/http/handlers"
	"stansiareco/backend/internal/http/middleware"
	"stansiareco/backend/internal/campaigns"
	"stansiareco/backend/internal/credentials"
	"stansiareco/backend/internal/domains"
	"stansiareco/backend/internal/execution"
	"stansiareco/backend/internal/lists"
	"stansiareco/backend/internal/servers"
	"stansiareco/backend/internal/users"
)

// RouterDependencies holds instantiated services for router wiring
type RouterDependencies struct {
	Config            *config.Config
	DBPool            *pgxpool.Pool
	Hasher            auth.PasswordHasher
	SessionMgr        auth.SessionManager
	RBAC              auth.RBACService
	UserService       users.Service
	ProviderService   servers.ProviderService
	MTAService        servers.MTAService
	IPService         servers.IPService
	VMTAService       servers.VMTAService
	ProxyService      servers.ProxyService
	ActionService     servers.ActionService
	DomainService     domains.DomainService
	ExecutionService  execution.ExecutionService
	CredentialService credentials.Service
	ListService       lists.Service
	CampaignService   campaigns.Service
}

// NewRouter constructs and configures the main HTTP router
func NewRouter(deps RouterDependencies) *chi.Mux {
	r := chi.NewRouter()

	// Base middleware
	r.Use(middleware.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.RequestLogger)
	r.Use(middleware.Recoverer)

	// Attach authentication context if session token present
	if deps.SessionMgr != nil {
		r.Use(middleware.Authenticate(deps.SessionMgr))
	}

	// CORS configuration
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   deps.Config.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health and readiness endpoints
	healthHandler := handlers.NewHealthHandler(deps.DBPool, deps.Config.Environment)
	r.Get("/healthz", healthHandler.Healthz)
	r.Get("/readyz", healthHandler.Readyz)

	// Handlers
	authHandler := handlers.NewAuthHandler(
		deps.DBPool,
		deps.Hasher,
		deps.SessionMgr,
		deps.RBAC,
		deps.Config.SessionTTL,
		deps.Config.Environment == "production",
	)
	usersHandler := handlers.NewUsersHandler(deps.UserService, deps.DBPool)
	serversHandler := handlers.NewServersHandler(
		deps.ProviderService,
		deps.MTAService,
		deps.IPService,
		deps.VMTAService,
		deps.ProxyService,
		deps.ActionService,
	)
	domainsHandler := handlers.NewDomainsHandler(deps.DomainService, deps.DBPool)
	executionsHandler := handlers.NewExecutionsHandler(deps.ExecutionService, deps.DBPool)
	var credentialsHandler *handlers.CredentialsHandler
	if deps.CredentialService != nil {
		credentialsHandler = handlers.NewCredentialsHandler(deps.CredentialService, deps.DBPool)
	}
	var listsHandler *handlers.ListsHandler
	if deps.ListService != nil {
		listsHandler = handlers.NewListsHandler(deps.ListService, deps.DBPool)
	}
	var campaignsHandler *handlers.CampaignsHandler
	if deps.CampaignService != nil {
		campaignsHandler = handlers.NewCampaignsHandler(deps.CampaignService, deps.DBPool)
	}

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/version", func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"app":         "StansiaReco API",
				"version":     "1.0.0",
				"environment": deps.Config.Environment,
			})
		})

		// Authentication routes
		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", authHandler.Login)
			r.Post("/logout", authHandler.Logout)

			// Authenticated user profile
			r.With(middleware.RequireAuth).Get("/me", authHandler.Me)
		})

		// Users management routes protected by fine-grained RBAC
		r.Route("/users", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceUsers, auth.ActionView)).Get("/", usersHandler.List)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceUsers, auth.ActionInsert)).Post("/", usersHandler.Create)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceUsers, auth.ActionView)).Get("/{userID}", usersHandler.GetByID)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceUsers, auth.ActionUpdate)).Put("/{userID}", usersHandler.Update)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceUsers, auth.ActionDelete)).Delete("/{userID}", usersHandler.Delete)
		})

		// Credentials Vault routes protected by fine-grained RBAC
		if credentialsHandler != nil {
			r.Route("/credentials", func(r chi.Router) {
				r.Use(middleware.RequireAuth)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCredentials, auth.ActionView)).Get("/", credentialsHandler.List)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCredentials, auth.ActionInsert)).Post("/", credentialsHandler.Create)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCredentials, auth.ActionView)).Get("/{credentialID}", credentialsHandler.GetByID)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCredentials, auth.ActionDelete)).Delete("/{credentialID}", credentialsHandler.Delete)
			})
		}

		// Server Inventory & MTA routes protected by fine-grained RBAC
		r.Route("/servers", func(r chi.Router) {
			r.Use(middleware.RequireAuth)

			// Standard Server Actions
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionView)).Get("/actions", serversHandler.GetActions)

			// Server Providers
			r.Route("/providers", func(r chi.Router) {
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServerProviders, auth.ActionView)).Get("/", serversHandler.ListProviders)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServerProviders, auth.ActionInsert)).Post("/", serversHandler.CreateProvider)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServerProviders, auth.ActionView)).Get("/{providerID}", serversHandler.GetProvider)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServerProviders, auth.ActionUpdate)).Put("/{providerID}", serversHandler.UpdateProvider)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServerProviders, auth.ActionDelete)).Delete("/{providerID}", serversHandler.DeleteProvider)
			})

			// VMTAs global index
			r.Route("/vmtas", func(r chi.Router) {
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceVMTAs, auth.ActionView)).Get("/", serversHandler.ListVMTAs)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceVMTAs, auth.ActionDelete)).Delete("/{vmtaID}", serversHandler.DeleteVMTA)
			})

			// Proxies global index
			r.Route("/proxies", func(r chi.Router) {
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceProxies, auth.ActionView)).Get("/", serversHandler.ListProxies)
			})

			// MTA Servers
			r.Route("/mta", func(r chi.Router) {
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionView)).Get("/", serversHandler.ListServers)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionView)).Get("/ips", serversHandler.ListAllIPs)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionInsert)).Post("/", serversHandler.CreateServer)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionInsert)).Post("/bulk", serversHandler.BulkCreateServers)

				r.Route("/{serverID}", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionView)).Get("/", serversHandler.GetServer)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionUpdate)).Put("/", serversHandler.UpdateServer)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionDelete)).Delete("/", serversHandler.DeleteServer)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionUpdate)).Post("/test-connection", serversHandler.TestSSHConnection)

					// Additional IPs & nmcli
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionView)).Get("/ips", serversHandler.ListIPs)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionInsert)).Post("/ips", serversHandler.AddIP)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionInsert)).Post("/ips/bulk", serversHandler.BulkAddIPs)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionUpdate)).Post("/ips/apply", serversHandler.ApplyIPsToServer)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionDelete)).Delete("/ips/{ipID}", serversHandler.DeleteIP)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionUpdate)).Post("/ips/{ipID}/mark-configured", serversHandler.MarkIPConfigured)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionView)).Get("/nmcli-script", serversHandler.GetNmcliScript)

					// VMTAs on this server
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceVMTAs, auth.ActionInsert)).Post("/vmtas", serversHandler.CreateVMTA)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceVMTAs, auth.ActionInsert)).Post("/vmtas/bulk", serversHandler.BulkCreateVMTAs)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceVMTAs, auth.ActionView)).Get("/vmta-config", serversHandler.GetVMTAConfig)

					// Proxies on this server
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceProxies, auth.ActionView)).Get("/proxy", serversHandler.GetProxy)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceProxies, auth.ActionUpdate)).Put("/proxy", serversHandler.UpdateProxy)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceProxies, auth.ActionView)).Get("/proxy/install-script", serversHandler.GetProxyInstallScript)

					// Install MTA
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceServers, auth.ActionUpdate)).Post("/install", serversHandler.InstallMTA)
				})
			})
		})

		// Domains & DNS management routes protected by fine-grained RBAC
		r.Route("/domains", func(r chi.Router) {
			r.Use(middleware.RequireAuth)

			// Domain Providers
			r.Route("/providers", func(r chi.Router) {
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionView)).Get("/", domainsHandler.ListProviders)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionInsert)).Post("/", domainsHandler.CreateProvider)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionView)).Get("/{providerID}", domainsHandler.GetProvider)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionUpdate)).Put("/{providerID}", domainsHandler.UpdateProvider)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionDelete)).Delete("/{providerID}", domainsHandler.DeleteProvider)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionView)).Post("/{providerID}/test", domainsHandler.TestProviderConnection)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionUpdate)).Post("/{providerID}/sync", domainsHandler.SyncProvider)
			})

			// Domains Inventory
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionView)).Get("/outbound-ip", domainsHandler.GetOutboundIP)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionView)).Get("/", domainsHandler.ListDomains)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionInsert)).Post("/", domainsHandler.CreateDomain)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionInsert)).Post("/bulk", domainsHandler.CreateBulkDomains)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionUpdate)).Post("/sync", domainsHandler.SyncAllDomains)

			r.Route("/{domainID}", func(r chi.Router) {
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionView)).Get("/", domainsHandler.GetDomain)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionUpdate)).Put("/", domainsHandler.UpdateDomain)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionDelete)).Delete("/", domainsHandler.DeleteDomain)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDomains, auth.ActionUpdate)).Post("/sync", domainsHandler.SyncDomain)

				// DNS Records within domain
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionView)).Get("/records", domainsHandler.ListDNSRecords)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionInsert)).Post("/records", domainsHandler.CreateDNSRecord)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionDelete)).Delete("/records", domainsHandler.FlushSingleDomainDNSRecords)
			})
		})

		// Global DNS Records & Bulk IP replacement
		r.Route("/dns", func(r chi.Router) {
			r.Use(middleware.RequireAuth)

			// Bulk deletion & flush
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionDelete)).Post("/records/bulk-delete", domainsHandler.BulkDeleteDNSRecords)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionDelete)).Post("/flush", domainsHandler.FlushDomainsDNSRecords)

			// Custom Record & SPF Studio Deployments
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionInsert)).Post("/records/custom-deploy", domainsHandler.DeployCustomRecord)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionInsert)).Post("/spf/deploy", domainsHandler.DeploySPF)
			r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionView)).Get("/spf/status", domainsHandler.ListSPFStatus)

			r.Route("/records/{recordID}", func(r chi.Router) {
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionUpdate)).Put("/", domainsHandler.UpdateDNSRecord)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionDelete)).Delete("/", domainsHandler.DeleteDNSRecord)
			})

			// Bulk IP Replacement
			r.Route("/ip-replace", func(r chi.Router) {
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionView)).Post("/preview", domainsHandler.PreviewIPReplacement)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDNS, auth.ActionUpdate)).Post("/", domainsHandler.ExecuteIPReplacement)
			})
		})

		// Remote Executions: Commands, Pre-configured Scripts & Live SSH Terminal TTY
		r.Route("/executions", func(r chi.Router) {
			// WebSocket endpoint for active terminal TTY session
			r.Get("/terminal/sessions/{sessionID}/ws", executionsHandler.ServeTerminalWebSocket)

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireAuth)

				// Pre-configured Scripts Registry
				r.Route("/scripts", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceScripts, auth.ActionView)).Get("/", executionsHandler.ListScripts)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceScripts, auth.ActionInsert)).Post("/", executionsHandler.CreateScript)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceScripts, auth.ActionView)).Get("/{scriptID}", executionsHandler.GetScript)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceScripts, auth.ActionUpdate)).Put("/{scriptID}", executionsHandler.UpdateScript)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceScripts, auth.ActionDelete)).Delete("/{scriptID}", executionsHandler.DeleteScript)
				})

				// Remote Commands & Script Jobs
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionView)).Get("/jobs", executionsHandler.ListExecutions)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionView)).Get("/jobs/{jobID}", executionsHandler.GetExecution)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionInsert)).Post("/run", executionsHandler.ExecuteCommand)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionInsert)).Post("/stream", executionsHandler.StreamExecution)

				// Live SSH Terminal TTY Sessions
				r.Route("/terminal/sessions", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionView)).Get("/", executionsHandler.ListTerminalSessions)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionInsert)).Post("/", executionsHandler.CreateTerminalSession)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionInsert)).Post("/{sessionID}/input", executionsHandler.WriteTerminalInput)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionView)).Get("/{sessionID}/output", executionsHandler.ReadTerminalOutput)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionUpdate)).Post("/{sessionID}/resize", executionsHandler.ResizeTerminal)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionDelete)).Delete("/{sessionID}", executionsHandler.CloseTerminalSession)
				})

				// iRedMail Server Deployments & Automated DNS Pipeline
				r.Route("/iredmail", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionView)).Get("/", executionsHandler.ListIRedMailServers)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionView)).Post("/check-os", executionsHandler.CheckServerUbuntuOS)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionInsert)).Post("/", executionsHandler.CreateIRedMailServer)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionView)).Get("/{id}", executionsHandler.GetIRedMailServer)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionUpdate)).Post("/{id}/retry", executionsHandler.RetryIRedMailServer)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionUpdate)).Post("/{id}/sync-dns", executionsHandler.SyncIRedMailDNSAndDKIM)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceExecutions, auth.ActionDelete)).Delete("/{id}", executionsHandler.DeleteIRedMailServer)
				})
			})
		})

		// Mail Lists & ESP Administration routes
		if listsHandler != nil {
			r.Route("/lists", func(r chi.Router) {
				r.Use(middleware.RequireAuth)

				// Global Summary & Metrics
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailLists, auth.ActionView)).Get("/summary", listsHandler.GetGlobalSummary)

				// Mailbox Providers
				r.Route("/mailbox-providers", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailboxProviders, auth.ActionView)).Get("/", listsHandler.ListMailboxProviders)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailboxProviders, auth.ActionInsert)).Post("/", listsHandler.CreateMailboxProvider)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailboxProviders, auth.ActionView)).Get("/{id}", listsHandler.GetMailboxProvider)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailboxProviders, auth.ActionUpdate)).Put("/{id}", listsHandler.UpdateMailboxProvider)
				})

				// Sending ESPs
				r.Route("/sending-esps", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSendingESPs, auth.ActionView)).Get("/", listsHandler.ListSendingESPs)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSendingESPs, auth.ActionInsert)).Post("/", listsHandler.CreateSendingESP)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSendingESPs, auth.ActionView)).Get("/{id}", listsHandler.GetSendingESP)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSendingESPs, auth.ActionUpdate)).Put("/{id}", listsHandler.UpdateSendingESP)
				})

				// Sending IP Pools
				r.Route("/ip-pools", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSendingIPPools, auth.ActionView)).Get("/", listsHandler.ListSendingIPPools)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSendingIPPools, auth.ActionInsert)).Post("/", listsHandler.CreateSendingIPPool)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSendingIPPools, auth.ActionView)).Get("/{id}", listsHandler.GetSendingIPPool)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSendingIPPools, auth.ActionUpdate)).Put("/{id}", listsHandler.UpdateSendingIPPool)
				})

				// Countries & Verticals Catalogs
				r.Route("/countries", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCountries, auth.ActionView)).Get("/", listsHandler.ListCountries)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCountries, auth.ActionInsert)).Post("/", listsHandler.CreateCountry)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCountries, auth.ActionUpdate)).Put("/{code}/toggle", listsHandler.ToggleCountry)
				})

				r.Route("/verticals", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceVerticals, auth.ActionView)).Get("/", listsHandler.ListVerticals)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceVerticals, auth.ActionInsert)).Post("/", listsHandler.CreateVertical)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceVerticals, auth.ActionUpdate)).Put("/{code}/toggle", listsHandler.ToggleVertical)
				})

				// Global Contacts
				r.Route("/contacts", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceContacts, auth.ActionView)).Get("/", listsHandler.ListContacts)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceContacts, auth.ActionInsert)).Post("/", listsHandler.CreateContact)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceContacts, auth.ActionView)).Get("/{id}", listsHandler.GetContact)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceContacts, auth.ActionUpdate)).Put("/{id}", listsHandler.UpdateContact)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceContacts, auth.ActionDelete)).Delete("/{id}", listsHandler.DeleteContact)
				})

				// Import Jobs
				r.Route("/imports", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceImports, auth.ActionView)).Get("/", listsHandler.ListImportJobs)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceImports, auth.ActionInsert)).Post("/preview", listsHandler.PreviewCSV)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceImports, auth.ActionInsert)).Post("/", listsHandler.CreateImportJob)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceImports, auth.ActionView)).Get("/{id}", listsHandler.GetImportJob)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceImports, auth.ActionUpdate)).Post("/{id}/cancel", listsHandler.CancelImportJob)
				})

				// Suppressions
				r.Route("/suppressions", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSuppressions, auth.ActionView)).Get("/", listsHandler.ListSuppressions)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSuppressions, auth.ActionInsert)).Post("/", listsHandler.CreateSuppression)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSuppressions, auth.ActionInsert)).Post("/bulk", listsHandler.BulkCreateSuppressions)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceSuppressions, auth.ActionDelete)).Delete("/{id}", listsHandler.DeleteSuppression)
				})

				// Data Quality & Activity Events
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailLists, auth.ActionView)).Get("/data-quality", listsHandler.GetDataQualityReport)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailLists, auth.ActionView)).Get("/activity", listsHandler.ListEvents)

				// Data Settings
				r.Route("/settings", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDataSettings, auth.ActionView)).Get("/", listsHandler.GetDataSettings)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceDataSettings, auth.ActionUpdate)).Put("/", listsHandler.UpdateDataSettings)
				})

				// Mail Lists CRUD
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailLists, auth.ActionView)).Get("/", listsHandler.ListMailLists)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailLists, auth.ActionInsert)).Post("/", listsHandler.CreateMailList)

				r.Route("/{listID}", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailLists, auth.ActionView)).Get("/", listsHandler.GetMailList)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailLists, auth.ActionUpdate)).Put("/", listsHandler.UpdateMailList)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailLists, auth.ActionUpdate)).Patch("/status", listsHandler.SetMailListStatus)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceMailLists, auth.ActionView)).Get("/metrics", listsHandler.GetMailListMetrics)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceContacts, auth.ActionView)).Get("/contacts", listsHandler.ListContacts)
				})
			})
		}

		// Campaigns & Dispatcher routes
		if campaignsHandler != nil {
			r.Route("/campaigns", func(r chi.Router) {
				r.Use(middleware.RequireAuth)

				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionView)).Get("/summary", campaignsHandler.GetSummaryKPIs)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionView)).Post("/preview", campaignsHandler.Preview)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionView)).Post("/estimate-audience", campaignsHandler.EstimateAudience)

				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionView)).Get("/", campaignsHandler.List)
				r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionInsert)).Post("/", campaignsHandler.Create)

				r.Route("/{id}", func(r chi.Router) {
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionView)).Get("/", campaignsHandler.GetByID)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionUpdate)).Put("/", campaignsHandler.Update)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionDelete)).Delete("/", campaignsHandler.Delete)

					// Lifecycle
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionUpdate)).Post("/launch", campaignsHandler.Launch)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionUpdate)).Post("/pause", campaignsHandler.Pause)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionUpdate)).Post("/resume", campaignsHandler.Resume)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionUpdate)).Post("/cancel", campaignsHandler.Cancel)

					// Logs, Test send, Spool
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionView)).Get("/logs", campaignsHandler.ListLogs)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionInsert)).Post("/test-send", campaignsHandler.TestSend)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionView)).Get("/spool/files", campaignsHandler.GetSpoolFiles)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionView)).Get("/spool/view", campaignsHandler.ReadSpoolFile)
					r.With(middleware.RequirePermission(deps.RBAC, auth.ResourceCampaigns, auth.ActionView)).Get("/spool/download", campaignsHandler.DownloadSpoolZip)
				})
			})
		}
	})

	return r
}
