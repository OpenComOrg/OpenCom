package service

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type themeInput struct {
	Name        *string  `json:"name"`
	Description *string  `json:"description"`
	CSS         *string  `json:"css"`
	Tags        []string `json:"tags"`
	Visibility  *string  `json:"visibility"`
}

func (s Service) HandlePublicThemes(c *gin.Context) {
	qText := strings.TrimSpace(c.Query("q"))
	sort := strings.TrimSpace(c.Query("sort"))
	if sort == "" {
		sort = "new"
	}
	if sort != "new" && sort != "popular" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_QUERY"})
		return
	}
	limit := parseLimit(c.Query("limit"), 48, 1, 100)
	orderBy := "t.updated_at DESC"
	if sort == "popular" {
		orderBy = "t.install_count DESC, t.updated_at DESC"
	}

	query := `
		SELECT t.id,t.author_user_id,t.name,t.description,t.css_text,t.tags,t.visibility,t.install_count,t.created_at,t.updated_at,u.username AS author_username
		  FROM user_themes t
		  JOIN users u ON u.id=t.author_user_id
		 WHERE t.visibility='public'
		   AND (? = '' OR t.name LIKE ? OR t.description LIKE ?)
		 ORDER BY ` + orderBy + `
		 LIMIT ?`
	rows, err := s.db.Query(query, qText, "%"+qText+"%", "%"+qText+"%", limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}
	defer rows.Close()

	themes := make([]map[string]any, 0)
	for rows.Next() {
		row, scanErr := scanThemeRows(rows)
		if scanErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
			return
		}
		themes = append(themes, serializeTheme(row, false))
	}
	c.JSON(http.StatusOK, gin.H{"themes": themes})
}

func (s Service) HandlePublicTheme(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	row, err := s.queryThemeByID(id)
	if errorsIsNoRows(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "THEME_NOT_FOUND"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}
	if row.Visibility != "public" {
		c.JSON(http.StatusForbidden, gin.H{"error": "THEME_NOT_PUBLIC"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"theme": serializeTheme(row, true)})
}

func (s Service) HandleMyThemes(c *gin.Context) {
	userID := strings.TrimSpace(c.GetHeader("x-auth-user-id"))
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "AUTH_REQUIRED"})
		return
	}

	rows, err := s.db.Query(`
		SELECT id,author_user_id,name,description,css_text,tags,visibility,install_count,created_at,updated_at,NULL AS author_username
		  FROM user_themes
		 WHERE author_user_id=?
		 ORDER BY updated_at DESC
		 LIMIT 100`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}
	defer rows.Close()

	themes := make([]map[string]any, 0)
	for rows.Next() {
		row, scanErr := scanThemeRows(rows)
		if scanErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
			return
		}
		themes = append(themes, serializeTheme(row, true))
	}
	c.JSON(http.StatusOK, gin.H{"themes": themes})
}

func (s Service) HandleCreateTheme(c *gin.Context) {
	userID := strings.TrimSpace(c.GetHeader("x-auth-user-id"))
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "AUTH_REQUIRED"})
		return
	}

	var body themeInput
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_BODY"})
		return
	}
	name := trimPtr(body.Name)
	css := trimPtr(body.CSS)
	if len(name) < 2 || len(name) > 80 || len(css) < 1 || len(css) > 200000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_BODY"})
		return
	}
	description := nullableStringFromPtr(body.Description, 500)
	visibility := trimPtr(body.Visibility)
	if visibility == "" {
		visibility = "private"
	}
	if visibility != "private" && visibility != "public" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_BODY"})
		return
	}
	tags := normalizeTags(body.Tags)
	tagsJSON, _ := json.Marshal(tags)
	id := newID()

	if _, err := s.db.Exec(`
		INSERT INTO user_themes (id,author_user_id,name,description,css_text,tags,visibility)
		VALUES (?,?,?,?,?,?,?)`,
		id, userID, name, description, css, string(tagsJSON), visibility,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "themeId": id})
}

func (s Service) HandlePatchTheme(c *gin.Context) {
	userID := strings.TrimSpace(c.GetHeader("x-auth-user-id"))
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "AUTH_REQUIRED"})
		return
	}
	id := strings.TrimSpace(c.Param("id"))

	row, err := s.queryThemeByID(id)
	if errorsIsNoRows(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "THEME_NOT_FOUND"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}
	if row.AuthorUserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "FORBIDDEN"})
		return
	}

	var body themeInput
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_BODY"})
		return
	}
	if body.Name == nil && body.Description == nil && body.CSS == nil && body.Tags == nil && body.Visibility == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "NO_CHANGES"})
		return
	}

	name := nullableUpdateValue(body.Name)
	descriptionSet := body.Description != nil
	description := nullableStringFromPtr(body.Description, 500)
	css := nullableUpdateValue(body.CSS)
	tagsSet := body.Tags != nil
	tagsJSON := ""
	if tagsSet {
		normalized := normalizeTags(body.Tags)
		encoded, _ := json.Marshal(normalized)
		tagsJSON = string(encoded)
	}
	visibilitySet := body.Visibility != nil
	visibility := trimPtr(body.Visibility)
	if visibilitySet && visibility != "private" && visibility != "public" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_BODY"})
		return
	}

	var tagsValue any
	if tagsSet {
		tagsValue = tagsJSON
	}
	var visibilityValue any
	if visibilitySet {
		visibilityValue = visibility
	}

	if _, err := s.db.Exec(`
		UPDATE user_themes
		   SET name = COALESCE(?, name),
		       description = CASE WHEN ?=1 THEN ? ELSE description END,
		       css_text = COALESCE(?, css_text),
		       tags = CASE WHEN ?=1 THEN ? ELSE tags END,
		       visibility = CASE WHEN ?=1 THEN ? ELSE visibility END
		 WHERE id=?`,
		name, boolToInt(descriptionSet), description, css, boolToInt(tagsSet), tagsValue, boolToInt(visibilitySet), visibilityValue, id,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s Service) HandleInstallTheme(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	row, err := s.queryThemeByID(id)
	if errorsIsNoRows(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "THEME_NOT_FOUND"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}
	if row.Visibility != "public" {
		c.JSON(http.StatusForbidden, gin.H{"error": "THEME_NOT_PUBLIC"})
		return
	}
	if _, err := s.db.Exec(`UPDATE user_themes SET install_count=install_count+1 WHERE id=?`, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s Service) queryThemeByID(id string) (themeRow, error) {
	row := s.db.QueryRow(`
		SELECT t.id,t.author_user_id,t.name,t.description,t.css_text,t.tags,t.visibility,t.install_count,t.created_at,t.updated_at,u.username AS author_username
		  FROM user_themes t
		  JOIN users u ON u.id=t.author_user_id
		 WHERE t.id=?
		 LIMIT 1`,
		id,
	)
	return scanThemeRow(row)
}

func scanThemeRow(row *sql.Row) (themeRow, error) {
	var theme themeRow
	err := row.Scan(&theme.ID, &theme.AuthorUserID, &theme.Name, &theme.Description, &theme.CSSText, &theme.Tags, &theme.Visibility, &theme.InstallCount, &theme.CreatedAt, &theme.UpdatedAt, &theme.AuthorUsername)
	return theme, err
}

func scanThemeRows(rows *sql.Rows) (themeRow, error) {
	var theme themeRow
	err := rows.Scan(&theme.ID, &theme.AuthorUserID, &theme.Name, &theme.Description, &theme.CSSText, &theme.Tags, &theme.Visibility, &theme.InstallCount, &theme.CreatedAt, &theme.UpdatedAt, &theme.AuthorUsername)
	return theme, err
}
