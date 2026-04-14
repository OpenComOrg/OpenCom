package linkpreview

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"internalapi/internal/config"

	"github.com/gin-gonic/gin"
)

var urlRE = regexp.MustCompile(`^https?://`)

type Service struct {
	cfg config.Config
	db  *sql.DB
}

func New(cfg config.Config, db *sql.DB) Service {
	return Service{cfg: cfg, db: db}
}

func (s Service) HandleLinkPreview(c *gin.Context) {
	rawURL := strings.TrimSpace(c.Query("url"))
	if len(rawURL) < 8 || len(rawURL) > 2048 || !urlRE.MatchString(rawURL) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_URL"})
		return
	}

	target, err := urlParse(rawURL)
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_URL"})
		return
	}

	appBaseHost := ""
	if appBaseURL, err := urlParse(s.cfg.AppBaseURL); err == nil {
		appBaseHost = strings.ToLower(appBaseURL.Hostname())
	}

	if err := assertPreviewTargetAllowed(target, appBaseHost); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "URL_NOT_ALLOWED"})
		return
	}

	if code := inviteCodeFromURL(target.Path); code != "" {
		payload, status, err := s.resolveInvitePreview(c.Request.Context(), rawURL, code)
		if err == nil {
			c.JSON(status, payload)
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "NOT_FOUND"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "FETCH_FAILED"})
		return
	}

	if code := giftCodeFromURL(target.Path); code != "" {
		payload, status, err := s.resolveGiftPreview(c.Request.Context(), rawURL, code)
		if err == nil {
			c.JSON(status, payload)
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "NOT_FOUND"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "FETCH_FAILED"})
		return
	}

	response, finalURL, err := fetchPreviewResponse(c.Request.Context(), target, appBaseHost)
	if err != nil || response == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "FETCH_FAILED"})
		return
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		c.JSON(http.StatusNotFound, gin.H{"error": "FETCH_FAILED"})
		return
	}

	contentType := strings.ToLower(response.Header.Get("content-type"))
	if !strings.Contains(contentType, "text/html") {
		c.JSON(http.StatusOK, gin.H{
			"url":         normalizeURL(finalURL.String()),
			"title":       "",
			"description": "",
			"siteName":    finalURL.Hostname(),
			"imageUrl":    "",
			"action":      nil,
			"hasMeta":     false,
		})
		return
	}

	html, err := readLimitedString(response.Body, 200000)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "FETCH_FAILED"})
		return
	}

	ogTitle := extractMeta(html, "og:title", "property")
	ogDescription := extractMeta(html, "og:description", "property")
	ogImage := extractMeta(html, "og:image", "property")
	ogSiteName := extractMeta(html, "og:site_name", "property")
	twTitle := extractMeta(html, "twitter:title", "name")
	twDescription := extractMeta(html, "twitter:description", "name")
	title := firstNonEmpty(ogTitle, twTitle, extractTitle(html))
	description := firstNonEmpty(ogDescription, twDescription)

	c.JSON(http.StatusOK, gin.H{
		"url":         normalizeURL(finalURL.String()),
		"title":       title,
		"description": description,
		"siteName":    firstNonEmpty(ogSiteName, finalURL.Hostname()),
		"imageUrl":    ogImage,
		"action":      nil,
		"hasMeta":     title != "" || description != "" || ogImage != "",
	})
}
