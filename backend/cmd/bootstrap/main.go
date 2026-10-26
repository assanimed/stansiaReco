package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"stansiareco/backend/internal/auth"
	"stansiareco/backend/internal/config"
	"stansiareco/backend/internal/database"
)

func main() {
	emailFlag := flag.String("email", "admin@stansiareco.local", "Administrator email address")
	passwordFlag := flag.String("password", "AdminSecure123!#", "Administrator password")
	nameFlag := flag.String("name", "System Administrator", "Administrator full name")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading configuration: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	dbPool, err := database.NewPool(ctx, cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error connecting to database: %v\n", err)
		os.Exit(1)
	}
	defer dbPool.Close()

	// Run migrations to ensure schema is ready
	if err := database.RunMigrations(ctx, dbPool); err != nil {
		fmt.Fprintf(os.Stderr, "Error running migrations: %v\n", err)
		os.Exit(1)
	}

	hasher := auth.NewArgon2Hasher()
	user, err := auth.EnsureAdminUser(ctx, dbPool, hasher, *emailFlag, *passwordFlag, *nameFlag)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error bootstrapping administrator: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Administrator ready: %s (%s) [ID: %s]\n", user.Email, user.FullName, user.ID)
}
