package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const defaultPort = "3015"

type Config struct {
	Port                string
	InternalToken       string
	AppBaseURL          string
	DBHost              string
	DBPort              int
	DBUser              string
	DBPassword          string
	DBName              string
	DownloadsStorageDir string
	ClientArtifactsDir  string
	RepoRoot            string
}

func Load() (Config, error) {
	loadDotEnvIfPresent()

	repoRoot := strings.TrimSpace(os.Getenv("REPO_ROOT"))
	if repoRoot == "" {
		repoRoot = ".."
	}

	cfg := Config{
		Port:                envOrDefault("PORT", defaultPort),
		InternalToken:       strings.TrimSpace(firstNonEmpty(os.Getenv("INTERNAL_SERVICE_TOKEN"), os.Getenv("GO_INTERNAL_SERVICE_TOKEN"))),
		AppBaseURL:          strings.TrimSpace(os.Getenv("APP_BASE_URL")),
		DBHost:              envOrDefault("DB_HOST", "127.0.0.1"),
		DBPort:              parseIntDefault(os.Getenv("DB_PORT"), 3306),
		DBUser:              strings.TrimSpace(os.Getenv("DB_USER")),
		DBPassword:          os.Getenv("DB_PASSWORD"),
		DBName:              strings.TrimSpace(os.Getenv("DB_NAME")),
		DownloadsStorageDir: strings.TrimSpace(os.Getenv("DOWNLOADS_STORAGE_DIR")),
		ClientArtifactsDir:  strings.TrimSpace(os.Getenv("CLIENT_ARTIFACTS_STORAGE_DIR")),
		RepoRoot:            repoRoot,
	}

	if cfg.AppBaseURL == "" {
		return Config{}, errors.New("APP_BASE_URL is required")
	}
	if len(cfg.InternalToken) < 16 {
		return Config{}, errors.New("INTERNAL_SERVICE_TOKEN is required and must be at least 16 characters")
	}
	if cfg.DBUser == "" || cfg.DBName == "" {
		return Config{}, errors.New("DB_USER and DB_NAME are required")
	}

	return cfg, nil
}

func (c Config) BindAddress() string {
	return ":" + c.Port
}

func (c Config) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true&charset=utf8mb4,utf8",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName)
}

func loadDotEnvIfPresent() {
	paths := []string{
		".env",
		filepath.Join("go-internal", ".env"),
	}
	for _, path := range paths {
		if err := loadEnvFile(path); err == nil {
			return
		}
	}
}

func loadEnvFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			return fmt.Errorf("invalid .env line: %q", line)
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
	return scanner.Err()
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func parseIntDefault(value string, fallback int) int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(trimmed)
	if err != nil {
		return fallback
	}
	return parsed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
