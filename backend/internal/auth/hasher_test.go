package auth_test

import (
	"testing"

	"stansiareco/backend/internal/auth"
)

func TestArgon2Hasher_Success(t *testing.T) {
	hasher := auth.NewArgon2Hasher()
	password := "CorrectHorseBatteryStaple123!"

	hash, err := hasher.HashPassword(password)
	if err != nil {
		t.Fatalf("unexpected error hashing password: %v", err)
	}

	if hash == "" {
		t.Fatal("expected non-empty hash string")
	}

	match, err := hasher.VerifyPassword(password, hash)
	if err != nil {
		t.Fatalf("unexpected error verifying password: %v", err)
	}
	if !match {
		t.Fatal("expected password to match hash")
	}
}

func TestArgon2Hasher_WrongPassword(t *testing.T) {
	hasher := auth.NewArgon2Hasher()
	password := "SecretP@ssw0rd!"

	hash, err := hasher.HashPassword(password)
	if err != nil {
		t.Fatalf("unexpected error hashing password: %v", err)
	}

	match, err := hasher.VerifyPassword("WrongP@ssw0rd!", hash)
	if err != nil {
		t.Fatalf("unexpected error verifying password: %v", err)
	}
	if match {
		t.Fatal("expected wrong password to NOT match")
	}
}

func TestArgon2Hasher_SaltUniqueness(t *testing.T) {
	hasher := auth.NewArgon2Hasher()
	password := "IdenticalPassword123"

	hash1, err := hasher.HashPassword(password)
	if err != nil {
		t.Fatalf("error: %v", err)
	}

	hash2, err := hasher.HashPassword(password)
	if err != nil {
		t.Fatalf("error: %v", err)
	}

	if hash1 == hash2 {
		t.Fatal("expected distinct salts for each password hash generation")
	}
}

func TestArgon2Hasher_EmptyPassword(t *testing.T) {
	hasher := auth.NewArgon2Hasher()
	_, err := hasher.HashPassword("")
	if err == nil {
		t.Fatal("expected error when hashing empty password, got nil")
	}

	match, err := hasher.VerifyPassword("", "$argon2id$v=19$m=65536,t=3,p=2$someSalt$someHash")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if match {
		t.Fatal("empty password should not verify")
	}
}

func TestArgon2Hasher_MalformedHash(t *testing.T) {
	hasher := auth.NewArgon2Hasher()

	testCases := []string{
		"not-a-valid-hash",
		"$argon2id$invalid",
		"$bcrypt$v=19$m=65536,t=3,p=2$salt$hash",
		"$argon2id$v=999$m=65536,t=3,p=2$salt$hash",
		"$argon2id$v=19$malformed$salt$hash",
		"$argon2id$v=19$m=65536,t=3,p=2$invalid_b64!$invalid_b64!",
	}

	for _, tc := range testCases {
		_, err := hasher.VerifyPassword("password", tc)
		if err == nil {
			t.Errorf("expected error for malformed hash '%s', got nil", tc)
		}
	}
}
