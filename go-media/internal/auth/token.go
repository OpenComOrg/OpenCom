package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type VerifyInput struct {
	Secret   string
	Issuer   string
	Audience string
}

type MediaTokenClaims struct {
	Sub           string   `json:"sub"`
	ServerID      string   `json:"server_id"`
	CoreServerID  string   `json:"core_server_id"`
	GuildID       string   `json:"guild_id"`
	ChannelID     string   `json:"channel_id"`
	RoomID        string   `json:"room_id"`
	Roles         []string `json:"roles"`
	Permissions   []string `json:"permissions"`
	PlatformRole  string   `json:"platform_role,omitempty"`
	PrivateCallID string   `json:"private_call_id,omitempty"`
	Scope         string   `json:"scope,omitempty"`
	Issuer        string   `json:"iss,omitempty"`
	Audience      any      `json:"aud,omitempty"`
	ExpiresAt     int64    `json:"exp,omitempty"`
	IssuedAt      int64    `json:"iat,omitempty"`
}

type header struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

func VerifyMediaToken(token string, input VerifyInput) (MediaTokenClaims, error) {
	if len(strings.TrimSpace(input.Secret)) < 16 {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_SECRET_INVALID")
	}

	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_INVALID")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_INVALID")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_INVALID")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_INVALID")
	}

	var parsedHeader header
	if err := json.Unmarshal(headerBytes, &parsedHeader); err != nil {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_INVALID")
	}
	if parsedHeader.Alg != "HS256" {
		return MediaTokenClaims{}, fmt.Errorf("MEDIA_TOKEN_UNSUPPORTED_ALG:%s", parsedHeader.Alg)
	}

	mac := hmac.New(sha256.New, []byte(input.Secret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	expectedSignature := mac.Sum(nil)
	if !hmac.Equal(signature, expectedSignature) {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_SIGNATURE_INVALID")
	}

	var claims MediaTokenClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_INVALID")
	}

	if claims.Sub == "" || claims.ServerID == "" || claims.GuildID == "" || claims.ChannelID == "" {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_CLAIMS_INVALID")
	}
	if claims.CoreServerID == "" {
		claims.CoreServerID = claims.ServerID
	}
	if claims.RoomID == "" {
		claims.RoomID = BuildRoomID(claims.GuildID, claims.ChannelID)
	}
	if input.Issuer != "" && claims.Issuer != input.Issuer {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_ISSUER_INVALID")
	}
	if input.Audience != "" && !audienceMatches(claims.Audience, input.Audience) {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_AUDIENCE_INVALID")
	}
	now := time.Now().Unix()
	if claims.ExpiresAt > 0 && now >= claims.ExpiresAt {
		return MediaTokenClaims{}, errors.New("MEDIA_TOKEN_EXPIRED")
	}

	claims.Roles = normalizeStringSlice(claims.Roles)
	claims.Permissions = normalizeStringSlice(claims.Permissions)
	return claims, nil
}

func BuildRoomID(guildID, channelID string) string {
	return strings.TrimSpace(guildID) + ":" + strings.TrimSpace(channelID)
}

func normalizeStringSlice(values []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(values))
	for _, raw := range values {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func audienceMatches(raw any, expected string) bool {
	switch value := raw.(type) {
	case string:
		return strings.TrimSpace(value) == expected
	case []any:
		for _, item := range value {
			if text, ok := item.(string); ok && strings.TrimSpace(text) == expected {
				return true
			}
		}
	}
	return false
}
