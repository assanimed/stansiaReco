package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

var (
	ErrInvalidHash         = errors.New("the encoded password hash is invalid")
	ErrIncompatibleVersion = errors.New("incompatible version of argon2")
)

// Default Argon2id parameters (RFC 9106 recommended)
const (
	Argon2Time        = 3
	Argon2Memory      = 64 * 1024 // 64 MB
	Argon2Parallelism = 2
	Argon2KeyLen      = 32
	Argon2SaltLen     = 16
)

type PasswordHasher interface {
	HashPassword(password string) (string, error)
	VerifyPassword(password, encodedHash string) (bool, error)
}

type Argon2Hasher struct {
	time        uint32
	memory      uint32
	parallelism uint8
	keyLen      uint32
	saltLen     uint32
}

func NewArgon2Hasher() *Argon2Hasher {
	return &Argon2Hasher{
		time:        Argon2Time,
		memory:      Argon2Memory,
		parallelism: Argon2Parallelism,
		keyLen:      Argon2KeyLen,
		saltLen:     Argon2SaltLen,
	}
}

// HashPassword generates a standard PHC-formatted Argon2id hash
func (h *Argon2Hasher) HashPassword(password string) (string, error) {
	if password == "" {
		return "", errors.New("password cannot be empty")
	}

	salt := make([]byte, h.saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("failed to generate random salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, h.time, h.memory, h.parallelism, h.keyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	// Format: $argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>
	encoded := fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, h.memory, h.time, h.parallelism, b64Salt, b64Hash,
	)

	return encoded, nil
}

// VerifyPassword verifies whether candidate password matches the encoded Argon2id hash
func (h *Argon2Hasher) VerifyPassword(password, encodedHash string) (bool, error) {
	if password == "" || encodedHash == "" {
		return false, nil
	}

	vals := strings.Split(encodedHash, "$")
	if len(vals) != 6 {
		return false, ErrInvalidHash
	}

	if vals[1] != "argon2id" {
		return false, fmt.Errorf("unsupported algorithm: %s", vals[1])
	}

	var version int
	if _, err := fmt.Sscanf(vals[2], "v=%d", &version); err != nil {
		return false, ErrInvalidHash
	}
	if version != argon2.Version {
		return false, ErrIncompatibleVersion
	}

	var memory, time uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(vals[3], "m=%d,t=%d,p=%d", &memory, &time, &parallelism); err != nil {
		return false, ErrInvalidHash
	}

	salt, err := base64.RawStdEncoding.Strict().DecodeString(vals[4])
	if err != nil {
		return false, ErrInvalidHash
	}

	expectedHash, err := base64.RawStdEncoding.Strict().DecodeString(vals[5])
	if err != nil {
		return false, ErrInvalidHash
	}

	hash := argon2.IDKey([]byte(password), salt, time, memory, parallelism, uint32(len(expectedHash)))

	if subtle.ConstantTimeCompare(hash, expectedHash) == 1 {
		return true, nil
	}

	return false, nil
}
