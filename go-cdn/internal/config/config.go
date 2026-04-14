package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const defaultPort = "8000"

type Config struct {
	Port              string
	UploadAuthToken   string
	AllowedBuckets    map[string]struct{}
	DisallowedBuckets map[string]struct{}
}

func Load() (Config, error) {
	loadDotEnvIfPresent()

	cfg := Config{
		Port:              envOrDefault("PORT", defaultPort),
		UploadAuthToken:   strings.TrimSpace(os.Getenv("UPLOAD_AUTH_TOKEN")),
		AllowedBuckets:    parseCSVSet(os.Getenv("ALLOWED_BUCKETS")),
		DisallowedBuckets: parseCSVSet(os.Getenv("DISALLOWED_BUCKETS")),
	}

	if cfg.UploadAuthToken == "" {
		return Config{}, errors.New("UPLOAD_AUTH_TOKEN is required")
	}

	return cfg, nil
}

func (c Config) BindAddress() string {
	return ":" + c.Port
}

func loadDotEnvIfPresent() {
	paths := []string{
		".env",
		filepath.Join("go-cdn", ".env"),
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
		if key == "" {
			return fmt.Errorf("invalid .env key in line: %q", line)
		}

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

func parseCSVSet(value string) map[string]struct{} {
	out := make(map[string]struct{})

	for _, part := range strings.Split(value, ",") {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		out[item] = struct{}{}
	}

	return out
}
