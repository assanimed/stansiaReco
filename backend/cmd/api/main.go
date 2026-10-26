package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stansiareco/backend/internal/auth"
	"stansiareco/backend/internal/config"
	"stansiareco/backend/internal/campaigns"
	"stansiareco/backend/internal/credentials"
	"stansiareco/backend/internal/database"
	internalhttp "stansiareco/backend/internal/http"
	"stansiareco/backend/internal/domains"
	"stansiareco/backend/internal/execution"
	"stansiareco/backend/internal/lists"
	"stansiareco/backend/internal/observability"
	"stansiareco/backend/internal/servers"
	"stansiareco/backend/internal/users"
)

func main() {
	// Initialize configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Setup structured logger
	logger := observability.SetupLogger(cfg.LogLevel)
	logger.Info("Starting StansiaReco API server",
		"env", cfg.Environment,
		"port", cfg.Port,
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to PostgreSQL database
	dbPool, err := database.NewPool(ctx, cfg)
	if err != nil {
		logger.Error("Failed to connect to PostgreSQL", "error", err)
		os.Exit(1)
	}
	defer dbPool.Close()

	logger.Info("Connected to PostgreSQL successfully")

	// Run database migrations
	if err := database.RunMigrations(ctx, dbPool); err != nil {
		logger.Error("Failed to run database migrations", "error", err)
		os.Exit(1)
	}

	// Initialize Auth & Security services
	hasher := auth.NewArgon2Hasher()
	sessionMgr := auth.NewPostgresSessionManager(dbPool)
	rbac := auth.NewPostgresRBACService(dbPool)
	userService := users.NewPostgresUserService(dbPool, hasher, rbac)

	// Ensure administrator exists
	adminUser, err := auth.EnsureAdminUser(ctx, dbPool, hasher, cfg.AdminEmail, cfg.AdminPassword, cfg.AdminName)
	if err != nil {
		logger.Error("Failed to ensure administrator account", "error", err)
		os.Exit(1)
	}
	logger.Info("Administrator account confirmed", "email", adminUser.Email, "id", adminUser.ID)

	// Initialize Credentials Vault
	vault, err := credentials.NewVault(cfg.EncryptionKey, cfg.EncryptionKeyID)
	if err != nil {
		logger.Error("Failed to initialize credentials vault", "error", err)
		os.Exit(1)
	}

	// Initialize Server Inventory & MTA services
	providerService := servers.NewPostgresProviderService(dbPool)
	mtaService := servers.NewPostgresMTAService(dbPool, vault)
	ipService := servers.NewPostgresIPService(dbPool, vault)
	vmtaService := servers.NewPostgresVMTAService(dbPool)
	proxyService := servers.NewPostgresProxyService(dbPool)
	actionService := servers.NewPostgresActionService(dbPool)
	domainService := domains.NewPostgresDomainService(dbPool, vault)
	executionService := execution.NewPostgresExecutionService(dbPool, vault)
	executionService.SetDomainService(domainService)
	credentialService := credentials.NewPostgresCredentialService(dbPool, vault)
	listService := lists.NewPostgresListService(dbPool)
	campaignSpooler := campaigns.NewFileDeliverySpooler(cfg.SpoolDir)
	campaignService := campaigns.NewPostgresCampaignService(dbPool, campaignSpooler)

	// Create HTTP router
	router := internalhttp.NewRouter(internalhttp.RouterDependencies{
		Config:            cfg,
		DBPool:            dbPool,
		Hasher:            hasher,
		SessionMgr:        sessionMgr,
		RBAC:              rbac,
		UserService:       userService,
		ProviderService:   providerService,
		MTAService:        mtaService,
		IPService:         ipService,
		VMTAService:       vmtaService,
		ProxyService:      proxyService,
		ActionService:     actionService,
		DomainService:     domainService,
		ExecutionService:  executionService,
		CredentialService: credentialService,
		ListService:       listService,
		CampaignService:   campaignService,
	})

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown channel
	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		logger.Info("HTTP server listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for shutdown signal
	sig := <-shutdownChan
	logger.Info("Received termination signal, initiating graceful shutdown...", "signal", sig.String())

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("Graceful shutdown failed, forcing close", "error", err)
		_ = server.Close()
	}

	logger.Info("Server stopped cleanly")
}
