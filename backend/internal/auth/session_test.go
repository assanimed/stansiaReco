package auth_test

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"stansiareco/backend/internal/auth"
)

func TestGenerateSessionToken(t *testing.T) {
	token1, err := auth.GenerateSessionToken()
	if err != nil {
		t.Fatalf("failed to generate session token: %v", err)
	}

	token2, err := auth.GenerateSessionToken()
	if err != nil {
		t.Fatalf("failed to generate session token: %v", err)
	}

	if len(token1) != 64 {
		t.Fatalf("expected 64 hex characters (32 bytes), got length %d", len(token1))
	}

	if token1 == token2 {
		t.Fatal("expected unique session tokens, but got identical values")
	}
}

func TestHashSessionToken(t *testing.T) {
	rawToken := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	expected := sha256.Sum256([]byte(rawToken))
	expectedHex := hex.EncodeToString(expected[:])

	computed := auth.HashSessionToken(rawToken)
	if computed != expectedHex {
		t.Fatalf("expected hash %s, got %s", expectedHex, computed)
	}
}
