package credentials_test

import (
	"crypto/rand"
	"strings"
	"testing"

	"stansiareco/backend/internal/credentials"
)

func TestCalculateFingerprint(t *testing.T) {
	data := []byte("ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC...")
	fp := credentials.CalculateFingerprint(data)
	if !strings.HasPrefix(fp, "SHA256:") {
		t.Fatalf("expected fingerprint to start with SHA256:, got %s", fp)
	}
}

func TestVault_EncryptDecryptValidation(t *testing.T) {
	key := make([]byte, 32)
	_, _ = rand.Read(key)

	vault, err := credentials.NewVault(key, 1)
	if err != nil {
		t.Fatalf("failed to create vault: %v", err)
	}

	_, err = vault.Encrypt([]byte{})
	if err == nil {
		t.Fatal("expected error on empty secret, got nil")
	}
}
