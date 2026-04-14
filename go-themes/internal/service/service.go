package service

import (
	"database/sql"
	"encoding/json"
	"regexp"
	"strings"
	"time"

	"themes/internal/config"
)

var tagRE = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,24}$`)

type Service struct {
	cfg config.Config
	db  *sql.DB
}

type themeRow struct {
	ID             string
	AuthorUserID   string
	Name           string
	Description    sql.NullString
	CSSText        string
	Tags           string
	Visibility     string
	InstallCount   int
	CreatedAt      time.Time
	UpdatedAt      time.Time
	AuthorUsername sql.NullString
}

func New(cfg config.Config, db *sql.DB) Service {
	return Service{cfg: cfg, db: db}
}

func normalizeTags(input []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(input))
	for _, raw := range input {
		value := strings.ToLower(strings.TrimSpace(raw))
		if !tagRE.MatchString(value) {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
		if len(out) >= 12 {
			break
		}
	}
	return out
}

func parseTags(raw string) []string {
	var values []string
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return []string{}
	}
	return normalizeTags(values)
}

func serializeTheme(row themeRow, includeCSS bool) map[string]any {
	payload := map[string]any{
		"id":             row.ID,
		"authorId":       row.AuthorUserID,
		"authorUsername": nullableString(row.AuthorUsername),
		"name":           row.Name,
		"description":    nullableString(row.Description),
		"tags":           parseTags(row.Tags),
		"visibility":     row.Visibility,
		"installCount":   row.InstallCount,
		"createdAt":      row.CreatedAt.Format(time.RFC3339),
		"updatedAt":      row.UpdatedAt.Format(time.RFC3339),
	}
	if includeCSS {
		payload["css"] = row.CSSText
	}
	return payload
}
