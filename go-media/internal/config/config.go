package config

import (
	"bufio"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const defaultPort = "3003"

type Config struct {
	Port                string
	Host                string
	MediaServerURL      string
	MediaWSURL          string
	AllowedOrigins      map[string]struct{}
	TokenSecret         string
	TokenIssuer         string
	TokenAudience       string
	SyncSecret          string
	GCPDeploymentMode   string
	WebRTCEngine        string
	WebRTCPublicHost    string
	WebRTCUDPMinPort    int
	WebRTCUDPMaxPort    int
}

func Load() (Config, error) {
	loadDotEnvIfPresent()

	cfg := Config{
		Port:              envOrDefault("PORT", envOrDefault("MEDIA_PORT", defaultPort)),
		Host:              envOrDefault("MEDIA_HOST", "0.0.0.0"),
		MediaServerURL:    normalizeHTTPURL(os.Getenv("MEDIA_SERVER_URL")),
		MediaWSURL:        normalizeWSURL(firstNonEmpty(os.Getenv("MEDIA_WS_URL"), os.Getenv("MEDIA_SERVER_URL"))),
		AllowedOrigins:    parseAllowedOrigins(os.Getenv("MEDIA_ALLOWED_ORIGINS")),
		TokenSecret:       strings.TrimSpace(os.Getenv("MEDIA_TOKEN_SECRET")),
		TokenIssuer:       firstNonEmpty(strings.TrimSpace(os.Getenv("MEDIA_TOKEN_ISSUER")), "opencom-media"),
		TokenAudience:     strings.TrimSpace(os.Getenv("MEDIA_TOKEN_AUDIENCE")),
		SyncSecret:        strings.TrimSpace(firstNonEmpty(os.Getenv("MEDIA_SYNC_SECRET"), os.Getenv("NODE_SYNC_SECRET"))),
		GCPDeploymentMode: firstNonEmpty(strings.TrimSpace(os.Getenv("GCP_DEPLOYMENT_MODE")), "hybrid"),
		WebRTCEngine:      firstNonEmpty(strings.TrimSpace(os.Getenv("WEBRTC_ENGINE")), "noop"),
		WebRTCPublicHost:  strings.TrimSpace(os.Getenv("WEBRTC_PUBLIC_HOST")),
		WebRTCUDPMinPort:  parseIntDefault(os.Getenv("WEBRTC_UDP_MIN_PORT"), 40000),
		WebRTCUDPMaxPort:  parseIntDefault(os.Getenv("WEBRTC_UDP_MAX_PORT"), 40100),
	}

	if len(cfg.TokenSecret) < 16 {
		return Config{}, errors.New("MEDIA_TOKEN_SECRET is required and must be at least 16 characters")
	}
	if cfg.MediaWSURL == "" {
		return Config{}, errors.New("MEDIA_WS_URL or MEDIA_SERVER_URL is required")
	}
	if cfg.WebRTCUDPMinPort > cfg.WebRTCUDPMaxPort {
		return Config{}, errors.New("WEBRTC_UDP_MIN_PORT must be less than or equal to WEBRTC_UDP_MAX_PORT")
	}

	return cfg, nil
}

func (c Config) BindAddress() string {
	return c.Host + ":" + c.Port
}

func (c Config) Diagnostics() map[string]any {
	warnings := make([]string, 0)
	switch c.GCPDeploymentMode {
	case "cloud-run":
		warnings = append(warnings, "Cloud Run mode is signaling/control-plane only; do not expect public UDP RTP termination here.")
	case "hybrid":
		if c.WebRTCPublicHost == "" {
			warnings = append(warnings, "Hybrid mode usually needs WEBRTC_PUBLIC_HOST set to the UDP-capable media plane.")
		}
	case "gce", "gke":
	default:
		warnings = append(warnings, "Unknown GCP_DEPLOYMENT_MODE; expected cloud-run, gce, gke, or hybrid.")
	}

	if c.WebRTCEngine == "noop" {
		warnings = append(warnings, "WEBRTC_ENGINE=noop means transport/media operations are compatibility stubs for now.")
	}

	return map[string]any{
		"deploymentMode": c.GCPDeploymentMode,
		"engine":         c.WebRTCEngine,
		"mediaServerUrl": c.MediaServerURL,
		"mediaWsUrl":     c.MediaWSURL,
		"webrtc": map[string]any{
			"publicHost": c.WebRTCPublicHost,
			"udpMinPort": c.WebRTCUDPMinPort,
			"udpMaxPort": c.WebRTCUDPMaxPort,
		},
		"warnings": warnings,
	}
}

func loadDotEnvIfPresent() {
	paths := []string{
		".env",
		filepath.Join("go-media", ".env"),
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

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func parseAllowedOrigins(value string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, part := range strings.Split(value, ",") {
		origin := normalizeOrigin(part)
		if origin == "" {
			continue
		}
		out[origin] = struct{}{}
	}
	return out
}

func normalizeOrigin(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	if raw == "*" {
		return "*"
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

func normalizeHTTPURL(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/")
}

func normalizeWSURL(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	switch parsed.Scheme {
	case "http":
		parsed.Scheme = "ws"
	case "https":
		parsed.Scheme = "wss"
	case "ws", "wss":
	default:
		return ""
	}
	parsed.Path = "/gateway"
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/")
}

func parseIntDefault(value string, fallback int) int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	var parsed int
	if _, err := fmt.Sscanf(trimmed, "%d", &parsed); err != nil {
		return fallback
	}
	return parsed
}
