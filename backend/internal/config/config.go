package config

import (
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Environment     string
	Port            string
	DatabaseURL     string
	DBMaxConns      int32
	DBMinConns      int32
	DBMaxIdleTime   time.Duration
	DBMaxConnLife   time.Duration
	EncryptionKey   []byte // 32 bytes for AES-256-GCM
	EncryptionKeyID int
	SessionSecret   string
	SessionTTL      time.Duration
	CORSOrigins     []string
	AllowPrivateIPs bool // global default for outbound network policy
	LogLevel        string
	AdminEmail      string
	AdminPassword   string
	AdminName       string
	SpoolDir        string
}

func Load() (*Config, error) {
	loadDotEnv()
	env := getEnv("APP_ENV", "development")
	port := getEnv("PORT", "8080")
	dbURL := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/stansiareco?sslmode=disable")

	dbMaxConns := int32(getEnvAsInt("DB_MAX_CONNS", 25))
	dbMinConns := int32(getEnvAsInt("DB_MIN_CONNS", 2))
	dbMaxIdleTime := getEnvAsDuration("DB_MAX_IDLE_TIME", 15*time.Minute)
	dbMaxConnLife := getEnvAsDuration("DB_MAX_CONN_LIFETIME", 1*time.Hour)

	// Encryption key must be 32 bytes (64 hex characters) for AES-256-GCM
	encHex := getEnv("APP_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	encKey, err := hex.DecodeString(encHex)
	if err != nil || len(encKey) != 32 {
		return nil, fmt.Errorf("APP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes): %w", err)
	}

	sessionSecret := getEnv("SESSION_SECRET", "super-secret-development-session-key-change-in-prod")
	if env == "production" && (sessionSecret == "super-secret-development-session-key-change-in-prod" || len(sessionSecret) < 32) {
		return nil, errors.New("in production, SESSION_SECRET must be at least 32 characters and not default")
	}

	sessionTTL := getEnvAsDuration("SESSION_TTL", 24*time.Hour)

	rawOrigins := getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
	corsOrigins := strings.Split(rawOrigins, ",")
	for i := range corsOrigins {
		corsOrigins[i] = strings.TrimSpace(corsOrigins[i])
	}

	allowPrivateIPs := getEnvAsBool("OUTBOUND_ALLOW_PRIVATE_IPS", false)
	logLevel := getEnv("LOG_LEVEL", "info")

	cfg := &Config{
		Environment:     env,
		Port:            port,
		DatabaseURL:     dbURL,
		DBMaxConns:      dbMaxConns,
		DBMinConns:      dbMinConns,
		DBMaxIdleTime:   dbMaxIdleTime,
		DBMaxConnLife:   dbMaxConnLife,
		EncryptionKey:   encKey,
		EncryptionKeyID: getEnvAsInt("APP_ENCRYPTION_KEY_ID", 1),
		SessionSecret:   sessionSecret,
		SessionTTL:      sessionTTL,
		CORSOrigins:     corsOrigins,
		AllowPrivateIPs: allowPrivateIPs,
		LogLevel:        logLevel,
		AdminEmail:      getEnv("ADMIN_EMAIL", "admin@stansiareco.local"),
		AdminPassword:   getEnv("ADMIN_PASSWORD", "AdminSecure123!#"),
		AdminName:       getEnv("ADMIN_NAME", "System Administrator"),
		SpoolDir:        getEnv("SPOOL_DIR", "./spool"),
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvAsInt(key string, fallback int) int {
	valStr := os.Getenv(key)
	if valStr == "" {
		return fallback
	}
	val, err := strconv.Atoi(valStr)
	if err != nil {
		return fallback
	}
	return val
}

func getEnvAsDuration(key string, fallback time.Duration) time.Duration {
	valStr := os.Getenv(key)
	if valStr == "" {
		return fallback
	}
	val, err := time.ParseDuration(valStr)
	if err != nil {
		return fallback
	}
	return val
}

func getEnvAsBool(key string, fallback bool) bool {
	valStr := os.Getenv(key)
	if valStr == "" {
		return fallback
	}
	val, err := strconv.ParseBool(valStr)
	if err != nil {
		return fallback
	}
	return val
}

func loadDotEnv() {
	paths := []string{".env", "../.env", "../../.env"}
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				k := strings.TrimSpace(parts[0])
				v := strings.TrimSpace(parts[1])
				if len(v) >= 2 && ((v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'')) {
					v = v[1 : len(v)-1]
				}
				if os.Getenv(k) == "" {
					_ = os.Setenv(k, v)
				}
			}
		}
	}
}

