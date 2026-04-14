package service

import (
	"database/sql"
	"strconv"
	"strings"
	"time"
)

func nullableString(value sql.NullString) any {
	if value.Valid {
		return value.String
	}
	return nil
}

func trimPtr(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func nullableStringFromPtr(value *string, maxLen int) any {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if len(trimmed) > maxLen {
		trimmed = trimmed[:maxLen]
	}
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func nullableUpdateValue(value *string) any {
	if value == nil {
		return nil
	}
	return strings.TrimSpace(*value)
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func parseLimit(value string, fallback, minValue, maxValue int) int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(trimmed)
	if err != nil {
		return fallback
	}
	if parsed < minValue {
		return minValue
	}
	if parsed > maxValue {
		return maxValue
	}
	return parsed
}

func errorsIsNoRows(err error) bool {
	return err == sql.ErrNoRows
}

func newID() string {
	return time.Now().UTC().Format("20060102150405.000000000")
}
