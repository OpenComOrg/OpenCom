package http

import (
	"database/sql"
	"net/http"
	"strings"

	"downloads/internal/config"
	"downloads/internal/db"
	"downloads/internal/service"

	"github.com/gin-gonic/gin"
)

func New(cfg config.Config) (*gin.Engine, error) {
	database, err := db.Open(cfg)
	if err != nil {
		return nil, err
	}

	svc := service.New(cfg, database)
	router := gin.Default()

	router.GET("/health", func(c *gin.Context) {
		if pingErr := pingDB(database); pingErr != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "DB_UNAVAILABLE"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	v1 := router.Group("/")
	v1.Use(requireInternalToken(cfg.InternalToken))
	v1.GET("/downloads/desktop/latest", svc.HandleDesktopLatest)
	v1.GET("/v1/client/latest", svc.HandleClientLatest)
	v1.GET("/v1/client/builds", svc.HandleClientBuilds)
	v1.GET("/v1/client/builds/:clientId/download", svc.HandleClientBuildDownload)
	v1.GET("/downloads/:filename", svc.HandleStaticDownload)

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
