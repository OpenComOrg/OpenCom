package handlers

import (
	"testing"

	"cdn/internal/config"
	"cdn/internal/storage"
)

func TestValidateBucketAccess(t *testing.T) {
	cfg := config.Config{
		AllowedBuckets: map[string]struct{}{
			"allowed-bucket": {},
		},
		DisallowedBuckets: map[string]struct{}{
			"blocked-bucket": {},
		},
	}

	if err := validateBucketAccess(cfg, "allowed-bucket"); err != nil {
		t.Fatalf("expected allowed bucket to pass, got %v", err)
	}

	if err := validateBucketAccess(cfg, "blocked-bucket"); err != storage.ErrBucketForbidden {
		t.Fatalf("expected blocked bucket to be forbidden, got %v", err)
	}

	if err := validateBucketAccess(cfg, "unknown-bucket"); err != storage.ErrBucketForbidden {
		t.Fatalf("expected unknown bucket to be forbidden, got %v", err)
	}
}
