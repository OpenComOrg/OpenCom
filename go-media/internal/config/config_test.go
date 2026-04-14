package config

import "testing"

func TestNormalizeWSURL(t *testing.T) {
	value := normalizeWSURL("https://media.example.com/foo")
	if value != "wss://media.example.com/gateway" {
		t.Fatalf("unexpected ws url: %q", value)
	}
}
