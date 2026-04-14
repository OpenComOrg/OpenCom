package handlers

import (
	"net/http"
	"strings"

	"cdn/internal/config"
	"cdn/internal/storage"

	"github.com/gin-gonic/gin"
)

type UploadHandler struct {
	store  *storage.GCSClient
	config config.Config
}

func NewUploadHandler(store *storage.GCSClient, cfg config.Config) UploadHandler {
	return UploadHandler{store: store, config: cfg}
}

func (h UploadHandler) Post(c *gin.Context) {
	bucket := strings.TrimSpace(c.PostForm("bucket"))
	objectPath := strings.Trim(strings.TrimSpace(c.PostForm("path")), "/")

	if err := validateBucketAccess(h.config, bucket); err != nil {
		respondError(c, err)
		return
	}

	if objectPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if strings.TrimSpace(contentType) == "" {
		contentType = "application/octet-stream"
	}

	if err := h.store.Upload(c.Request.Context(), storage.UploadInput{
		Bucket:      bucket,
		Path:        objectPath,
		ContentType: contentType,
		Reader:      file,
	}); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"bucket": bucket,
		"path":   objectPath,
		"url":    "/v1/files/" + bucket + "/" + objectPath,
	})
}
