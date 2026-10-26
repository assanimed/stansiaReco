package credentials

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInvalidSecret = errors.New("secret payload is invalid or empty")
	ErrDecryptFailed = errors.New("decryption failed or authentication tag mismatch")
)

type CredentialType string

const (
	TypePassword            CredentialType = "password"
	TypePrivateKey          CredentialType = "private_key"
	TypePrivateKeyWithPass  CredentialType = "private_key_passphrase"
)

type Credential struct {
	ID          uuid.UUID      `json:"id"`
	Name        string         `json:"name"`
	CredType    CredentialType `json:"cred_type"`
	Username    string         `json:"username"`
	KeyVersion  int            `json:"key_version"`
	Fingerprint string         `json:"fingerprint"`
	Description string         `json:"description,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type Vault struct {
	masterKey []byte
	version   int
}

func NewVault(masterKey []byte, version int) (*Vault, error) {
	if len(masterKey) != 32 {
		return nil, errors.New("vault master key must be exactly 32 bytes for AES-256")
	}
	if version <= 0 {
		version = 1
	}
	return &Vault{
		masterKey: masterKey,
		version:   version,
	}, nil
}

// Encrypt encrypts secret plaintext using AES-256-GCM with a 96-bit random nonce
func (v *Vault) Encrypt(plaintext []byte) ([]byte, error) {
	if len(plaintext) == 0 {
		return nil, ErrInvalidSecret
	}

	block, err := aes.NewCipher(v.masterKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher block: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM mode: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Ciphertext has nonce prepended: [nonce][ciphertext+tag]
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// Decrypt decrypts ciphertext using AES-256-GCM
func (v *Vault) Decrypt(ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(v.masterKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher block: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM mode: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, ErrDecryptFailed
	}

	nonce, encryptedPayload := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, encryptedPayload, nil)
	if err != nil {
		return nil, ErrDecryptFailed
	}

	return plaintext, nil
}

// CalculateFingerprint generates SHA-256 hex fingerprint for keys/passwords
func CalculateFingerprint(data []byte) string {
	h := sha256.Sum256(data)
	hexStr := hex.EncodeToString(h[:])
	if len(hexStr) > 16 {
		return "SHA256:" + hexStr[:16] + "..."
	}
	return "SHA256:" + hexStr
}
