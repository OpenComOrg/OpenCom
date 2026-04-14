package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func TestVerifyMediaToken(t *testing.T) {
	headerBytes, _ := json.Marshal(map[string]any{
		"alg": "HS256",
		"typ": "JWT",
	})
	payloadBytes, _ := json.Marshal(map[string]any{
		"sub":            "user-1",
		"server_id":      "node-1",
		"core_server_id": "core-1",
		"guild_id":       "guild-1",
		"channel_id":     "channel-1",
		"room_id":        "guild-1:channel-1",
		"roles":          []string{"member"},
		"permissions":    []string{"connect"},
		"iss":            "opencom-media",
		"exp":            time.Now().Add(5 * time.Minute).Unix(),
	})

	header := base64.RawURLEncoding.EncodeToString(headerBytes)
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	mac := hmac.New(sha256.New, []byte("0123456789abcdef"))
	mac.Write([]byte(header + "." + payload))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	token := header + "." + payload + "." + signature

	claims, err := VerifyMediaToken(token, VerifyInput{
		Secret: "0123456789abcdef",
		Issuer: "opencom-media",
	})
	if err != nil {
		t.Fatalf("expected token to verify, got error: %v", err)
	}
	if claims.Sub != "user-1" {
		t.Fatalf("expected sub user-1, got %q", claims.Sub)
	}
	if claims.RoomID != "guild-1:channel-1" {
		t.Fatalf("expected room id to round-trip, got %q", claims.RoomID)
	}
}
