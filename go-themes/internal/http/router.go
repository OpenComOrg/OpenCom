package http

import (
	"database/sql"
	"net/http"
	"strings"

	"themes/internal/config"
	"themes/internal/db"
	"themes/internal/service"

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

	v1 := router.Group("/v1")
	v1.Use(requireInternalToken(cfg.InternalToken))
	v1.GET("/themes", svc.HandlePublicThemes)
	v1.GET("/themes/:id", svc.HandlePublicTheme)
	v1.GET("/me/themes", svc.HandleMyThemes)
	v1.POST("/themes", svc.HandleCreateTheme)
	v1.PATCH("/themes/:id", svc.HandlePatchTheme)
	v1.POST("/themes/:id/install", svc.HandleInstallTheme)

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
