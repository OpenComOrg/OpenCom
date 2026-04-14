package http

import (
	"cdn/internal/config"
	"cdn/internal/http/handlers"
	"cdn/internal/http/middleware"
	"cdn/internal/storage"

	"github.com/gin-gonic/gin"
)

func New(cfg config.Config) (*gin.Engine, error) {
	store, err := storage.NewGCSClient()
	if err != nil {
		return nil, err
	}

	r := gin.Default()

	healthHandler := handlers.NewHealthHandler()
	filesHandler := handlers.NewFilesHandler(store, cfg)
	uploadHandler := handlers.NewUploadHandler(store, cfg)

	r.GET("/health", healthHandler.Get)

	v1 := r.Group("/v1")
	{
		files := v1.Group("/files")
		{
			files.GET("/:bucket/*path", filesHandler.Get)
		}

		protected := v1.Group("/")
		protected.Use(middleware.RequireBearerToken(cfg.UploadAuthToken))
		{
			protected.POST("/upload", uploadHandler.Post)
			protected.DELETE("/files/:bucket/*path", filesHandler.Delete)
		}
	}

	return r, nil
}
