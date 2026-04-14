package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"cdn/internal/config"
	"cdn/internal/storage"

	"github.com/gin-gonic/gin"
)

func validateBucketAccess(cfg config.Config, bucket string) error {
	if bucket == "" {
		return storage.ErrInvalidBucket
	}

	if _, blocked := cfg.DisallowedBuckets[bucket]; blocked {
		return storage.ErrBucketForbidden
	}

	if len(cfg.AllowedBuckets) == 0 {
		return nil
	}

	if _, allowed := cfg.AllowedBuckets[bucket]; !allowed {
		return storage.ErrBucketForbidden
	}

	return nil
}

func respondError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, storage.ErrInvalidBucket), errors.Is(err, storage.ErrInvalidPath):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, storage.ErrBucketForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, storage.ErrObjectNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}

func int64ToString(value int64) string {
	return strconv.FormatInt(value, 10)
}
