package http

import (
	"net/http"
	"strings"
	"sync"

	"media/internal/auth"
	"media/internal/config"
	"media/internal/protocol"
	"media/internal/service/voice"
	"media/internal/webrtc"

	"github.com/gin-gonic/gin"
	"golang.org/x/net/websocket"
)

type wsConn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (w *wsConn) Send(msg protocol.GatewayEnvelope) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return websocket.JSON.Send(w.conn, msg)
}

func (w *wsConn) Close() error {
	return w.conn.Close()
}

func New(cfg config.Config) (*gin.Engine, error) {
	engine, err := webrtc.NewEngine(cfg)
	if err != nil {
		return nil, err
	}
	service := voice.New(cfg, engine)
	router := gin.Default()

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"ok":     true,
			"wsPath": "/gateway",
			"media":  service.Diagnostics(),
		})
	})

	router.POST("/v1/internal/voice/member-state", func(c *gin.Context) {
		if !validateSyncSecret(c, cfg) {
			return
		}
		var body struct {
			GuildID string `json:"guildId"`
			UserID  string `json:"userId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.GuildID) == "" || strings.TrimSpace(body.UserID) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_BODY"})
			return
		}
		emitted := service.RefreshMemberState(strings.TrimSpace(body.GuildID), strings.TrimSpace(body.UserID))
		c.JSON(http.StatusOK, gin.H{"ok": true, "emitted": emitted})
	})

	router.POST("/v1/internal/voice/disconnect-member", func(c *gin.Context) {
		if !validateSyncSecret(c, cfg) {
			return
		}
		var body struct {
			GuildID   string `json:"guildId"`
			ChannelID string `json:"channelId"`
			UserID    string `json:"userId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.GuildID) == "" || strings.TrimSpace(body.ChannelID) == "" || strings.TrimSpace(body.UserID) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_BODY"})
			return
		}
		disconnected := service.ForceDisconnectMember(strings.TrimSpace(body.GuildID), strings.TrimSpace(body.ChannelID), strings.TrimSpace(body.UserID))
		c.JSON(http.StatusOK, gin.H{"ok": true, "disconnected": disconnected})
	})

	router.POST("/v1/internal/voice/close-room", func(c *gin.Context) {
		if !validateSyncSecret(c, cfg) {
			return
		}
		var body struct {
			GuildID   string `json:"guildId"`
			ChannelID string `json:"channelId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.GuildID) == "" || strings.TrimSpace(body.ChannelID) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_BODY"})
			return
		}
		disconnected := service.CloseRoom(strings.TrimSpace(body.GuildID), strings.TrimSpace(body.ChannelID))
		c.JSON(http.StatusOK, gin.H{"ok": true, "disconnected": disconnected})
	})

	router.GET("/gateway", func(c *gin.Context) {
		if !originAllowed(cfg, c.GetHeader("Origin")) {
			c.JSON(http.StatusForbidden, gin.H{"error": "MEDIA_ORIGIN_NOT_ALLOWED"})
			return
		}

		handler := websocket.Handler(func(ws *websocket.Conn) {
			connection := &wsConn{conn: ws}
			connID := connectionID(ws.Request())
			defer service.RemoveConnection(connID)

			_ = connection.Send(protocol.GatewayEnvelope{
				Op: "HELLO",
				D: map[string]any{"heartbeat_interval": 25000},
			})

			identified := false
			for {
				var envelope protocol.GatewayEnvelope
				if err := websocket.JSON.Receive(ws, &envelope); err != nil {
					return
				}

				if envelope.Op == "IDENTIFY" && !identified {
					payload := decodeIdentify(envelope.D)
					claims, err := auth.VerifyMediaToken(payload.MediaToken, auth.VerifyInput{
						Secret:   cfg.TokenSecret,
						Issuer:   cfg.TokenIssuer,
						Audience: cfg.TokenAudience,
					})
					if err != nil {
						_ = connection.Send(protocol.GatewayEnvelope{
							Op: "ERROR",
							D: map[string]any{"error": "INVALID_MEDIA_TOKEN"},
						})
						_ = connection.Close()
						return
					}

					ready := service.HandleIdentify(connID, connection, claims, ws.Request().RemoteAddr)
					_ = connection.Send(ready)
					identified = true
					continue
				}

				if !identified {
					continue
				}

				for _, response := range service.HandleEnvelope(connID, envelope) {
					_ = connection.Send(response)
				}
			}
		})
		handler.ServeHTTP(c.Writer, c.Request)
	})

	return router, nil
}

func validateSyncSecret(c *gin.Context, cfg config.Config) bool {
	if cfg.SyncSecret == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MEDIA_SYNC_SECRET_NOT_CONFIGURED"})
		return false
	}
	if c.GetHeader("x-node-sync-secret") != cfg.SyncSecret {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "INVALID_SYNC_SECRET"})
		return false
	}
	return true
}

func originAllowed(cfg config.Config, origin string) bool {
	trimmed := strings.TrimSpace(origin)
	if trimmed == "" {
		return true
	}
	if _, ok := cfg.AllowedOrigins["*"]; ok {
		return true
	}
	if len(cfg.AllowedOrigins) == 0 {
		return true
	}
	_, ok := cfg.AllowedOrigins[trimmed]
	return ok
}

func decodeIdentify(value any) protocol.MediaIdentify {
	bytes, err := jsonMarshal(value)
	if err != nil {
		return protocol.MediaIdentify{}
	}
	var payload protocol.MediaIdentify
	_ = jsonUnmarshal(bytes, &payload)
	return payload
}

func connectionID(r *http.Request) string {
	return strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(r.RemoteAddr, ":", "_"), ".", "_"), "/", "_") + "_" + strings.ReplaceAll(r.Header.Get("Sec-Websocket-Key"), "=", "")
}
