package config_test

import (
	"os"
	"testing"
	"time"

	"stansiareco/backend/internal/config"
)

func TestConfigLoadDefaults(t *testing.T) {
	// Clean env
	os.Clearenv()

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("expected config.Load() to succeed with defaults, got: %v", err)
	}

	if cfg.Environment != "development" {
		t.Errorf("expected Environment to be development, got %s", cfg.Environment)
	}
	if cfg.Port != "8080" {
		t.Errorf("expected default Port 8080, got %s", cfg.Port)
	}
	if len(cfg.EncryptionKey) != 32 {
		t.Errorf("expected 32-byte encryption key, got %d bytes", len(cfg.EncryptionKey))
	}
	if cfg.SessionTTL != 24*time.Hour {
		t.Errorf("expected SessionTTL 24h, got %v", cfg.SessionTTL)
	}
}

func TestConfigInvalidEncryptionKey(t *testing.T) {
	os.Clearenv()
	_ = os.Setenv("APP_ENCRYPTION_KEY", "invalid-hex-string")

	_, err := config.Load()
	if err == nil {
		t.Fatal("expected error with invalid encryption key hex, got nil")
	}
}

func TestConfigProductionSessionSecretRequirement(t *testing.T) {
	os.Clearenv()
	_ = os.Setenv("APP_ENV", "production")
	_ = os.Setenv("SESSION_SECRET", "short")

	_, err := config.Load()
	if err == nil {
		t.Fatal("expected error in production when SESSION_SECRET is too short, got nil")
	}
}
