package handlers

import (
	"errors"
	"io"
	"net/http"
	"strings"

	"cdn/internal/config"
	"cdn/internal/storage"

	"github.com/gin-gonic/gin"
)

type FilesHandler struct {
	store  *storage.GCSClient
	config config.Config
}

func NewFilesHandler(store *storage.GCSClient, cfg config.Config) FilesHandler {
	return FilesHandler{store: store, config: cfg}
}

func (h FilesHandler) Get(c *gin.Context) {
	bucket := strings.TrimSpace(c.Param("bucket"))
	objectPath := strings.TrimPrefix(c.Param("path"), "/")

	if err := validateBucketAccess(h.config, bucket); err != nil {
		respondError(c, err)
		return
	}

	if objectPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file path is required"})
		return
	}

	stream, attrs, err := h.store.Open(c.Request.Context(), bucket, objectPath)
	if err != nil {
		respondError(c, err)
		return
	}
	defer stream.Close()

	if attrs.ContentType != "" {
		c.Header("Content-Type", attrs.ContentType)
	}
	if attrs.CacheControl != "" {
		c.Header("Cache-Control", attrs.CacheControl)
	}
	if attrs.Size >= 0 {
		c.Header("Content-Length", int64ToString(attrs.Size))
	}

	c.Status(http.StatusOK)
	_, copyErr := io.Copy(c.Writer, stream)
	if copyErr != nil && !errors.Is(copyErr, io.EOF) {
		c.Error(copyErr)
	}
}

func (h FilesHandler) Delete(c *gin.Context) {
	bucket := strings.TrimSpace(c.Param("bucket"))
	objectPath := strings.TrimPrefix(c.Param("path"), "/")

	if err := validateBucketAccess(h.config, bucket); err != nil {
		respondError(c, err)
		return
	}

	if objectPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file path is required"})
		return
	}

	if err := h.store.Delete(c.Request.Context(), bucket, objectPath); err != nil {
		respondError(c, err)
		return
	}

	c.Status(http.StatusNoContent)
}
