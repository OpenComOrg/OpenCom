package service

import (
	"strconv"
	"strings"
	"time"
)

func itoa64(value int64) string {
	return strconv.FormatInt(value, 10)
}

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return strings.TrimSpace(value)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func sanitizeFilename(value string) string {
	return strings.ReplaceAll(value, `"`, "")
}
