package credentials_test

import (
	"crypto/rand"
	"testing"

	"stansiareco/backend/internal/credentials"
)

func TestVault_EncryptDecrypt(t *testing.T) {
	key := make([]byte, 32)
	_, _ = rand.Read(key)

	vault, err := credentials.NewVault(key, 1)
	if err != nil {
		t.Fatalf("failed to create vault: %v", err)
	}

	secret := "SuperSecretSSHKeyContentOrPassword12345!"
	encrypted, err := vault.Encrypt([]byte(secret))
	if err != nil {
		t.Fatalf("encryption failed: %v", err)
	}

	if string(encrypted) == secret {
		t.Fatal("ciphertext must not equal plaintext")
	}

	decrypted, err := vault.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("decryption failed: %v", err)
	}

	if string(decrypted) != secret {
		t.Fatalf("expected decrypted text %s, got %s", secret, string(decrypted))
	}
}

func TestVault_TamperDetection(t *testing.T) {
	key := make([]byte, 32)
	_, _ = rand.Read(key)

	vault, _ := credentials.NewVault(key, 1)
	encrypted, _ := vault.Encrypt([]byte("test-payload"))

	// Tamper with ciphertext
	if len(encrypted) > 20 {
		encrypted[20] ^= 0xFF
	}

	_, err := vault.Decrypt(encrypted)
	if err == nil {
		t.Fatal("expected authentication error on tampered ciphertext, got nil")
	}
}
