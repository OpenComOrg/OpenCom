package http

import (
	"database/sql"
	"net/http"
	"strings"

	"internalapi/internal/config"
	"internalapi/internal/db"
	"internalapi/internal/domain/downloads"
	"internalapi/internal/domain/linkpreview"
	"internalapi/internal/domain/themes"

	"github.com/gin-gonic/gin"
)

func New(cfg config.Config) (*gin.Engine, error) {
	database, err := db.Open(cfg)
	if err != nil {
		return nil, err
	}

	linkPreviewSvc := linkpreview.New(cfg, database)
	downloadsSvc := downloads.New(cfg, database)
	themesSvc := themes.New(cfg, database)

	router := gin.Default()

	router.GET("/health", func(c *gin.Context) {
		if pingErr := pingDB(database); pingErr != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "DB_UNAVAILABLE"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	protected := router.Group("/")
	protected.Use(requireInternalToken(cfg.InternalToken))
	protected.GET("/v1/link-preview", linkPreviewSvc.HandleLinkPreview)
	protected.GET("/downloads/desktop/latest", downloadsSvc.HandleDesktopLatest)
	protected.GET("/downloads/:filename", downloadsSvc.HandleStaticDownload)
	protected.GET("/v1/client/latest", downloadsSvc.HandleClientLatest)
	protected.GET("/v1/client/builds", downloadsSvc.HandleClientBuilds)
	protected.GET("/v1/client/builds/:clientId/download", downloadsSvc.HandleClientBuildDownload)
	protected.GET("/v1/themes", themesSvc.HandlePublicThemes)
	protected.GET("/v1/themes/:id", themesSvc.HandlePublicTheme)
	protected.GET("/v1/me/themes", themesSvc.HandleMyThemes)
	protected.POST("/v1/themes", themesSvc.HandleCreateTheme)
	protected.PATCH("/v1/themes/:id", themesSvc.HandlePatchTheme)
	protected.POST("/v1/themes/:id/install", themesSvc.HandleInstallTheme)

	return router, nil
}

func requireInternalToken(expected string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if strings.TrimSpace(c.GetHeader("x-core-internal-secret")) != expected {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "INVALID_INTERNAL_SECRET"})
			return
		}
		c.Next()
	}
}

func pingDB(database *sql.DB) error {
	return database.Ping()
}
