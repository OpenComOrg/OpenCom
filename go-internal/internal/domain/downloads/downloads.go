package downloads

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

type clientRow struct {
	ID             string
	Type           string
	Version        string
	Channel        string
	FilePath       string
	FileName       string
	MimeType       string
	FileSize       int64
	ChecksumSHA256 sql.NullString
	ReleaseNotes   sql.NullString
	CreatedAt      string
}

func (s Service) HandleDesktopLatest(c *gin.Context) {
	platform := strings.TrimSpace(c.Query("platform"))
	arch := strings.TrimSpace(c.Query("arch"))
	currentVersion := strings.TrimSpace(c.Query("currentVersion"))
	baseDir := resolveDownloadsBaseDir(s.cfg.RepoRoot, s.cfg.DownloadsStorageDir)
	origin := getPublicOrigin(c.Request)
	meta := loadDesktopPackageMetadata(s.cfg.RepoRoot)
	artifacts := listAvailableDesktopArtifacts(baseDir, origin)
	artifact := pickPreferredDesktopArtifact(platform, artifacts)
	latestVersion := meta.Version
	updateAvailable := artifact != nil && latestVersion != "" && (currentVersion == "" || compareVersionStrings(latestVersion, currentVersion) > 0)

	c.JSON(http.StatusOK, gin.H{
		"ok":                 artifact != nil && latestVersion != "",
		"checkedAt":          nowISO(),
		"productName":        meta.ProductName,
		"platform":           nullIfEmpty(platform),
		"arch":               nullIfEmpty(arch),
		"currentVersion":     nullIfEmpty(currentVersion),
		"latestVersion":      nullIfEmpty(latestVersion),
		"updateAvailable":    updateAvailable,
		"artifact":           artifact,
		"availableArtifacts": artifacts,
	})
}

func (s Service) HandleClientLatest(c *gin.Context) {
	platform := strings.TrimSpace(c.Query("platform"))
	channel := firstNonEmpty(strings.TrimSpace(c.Query("channel")), "stable")
	currentVersion := strings.TrimSpace(c.Query("currentVersion"))
	if !validClientPlatform(platform) || !validChannel(channel) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_QUERY"})
		return
	}

	row := s.db.QueryRow(`
		SELECT id, type, version, channel, file_path, file_name, mime_type,
		       file_size, checksum_sha256, release_notes, created_at
		  FROM client
		 WHERE type = ? AND channel = ? AND is_active = TRUE
		 ORDER BY created_at DESC
		 LIMIT 1`,
		platform, channel,
	)

	client, err := scanClientRow(row)
	if errorsIsNoRows(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "NO_BUILD_FOUND"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}

	origin := getPublicOrigin(c.Request)
	latest := serializeClientRow(client, origin)
	updateAvailable := currentVersion == "" || compareVersionStrings(client.Version, currentVersion) > 0

	c.JSON(http.StatusOK, gin.H{
		"ok":              true,
		"checkedAt":       nowISO(),
		"platform":        platform,
		"channel":         channel,
		"currentVersion":  nullIfEmpty(currentVersion),
		"updateAvailable": updateAvailable,
		"latest":          latest,
	})
}

func (s Service) HandleClientBuilds(c *gin.Context) {
	channel := firstNonEmpty(strings.TrimSpace(c.Query("channel")), "stable")
	if !validChannel(channel) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_QUERY"})
		return
	}

	rows, err := s.db.Query(`
		SELECT c.id, c.type, c.version, c.channel, c.file_path, c.file_name,
		       c.mime_type, c.file_size, c.checksum_sha256, c.release_notes, c.created_at
		  FROM client c
		  INNER JOIN (
		    SELECT type, MAX(created_at) AS latest_at
		      FROM client
		     WHERE channel = ? AND is_active = TRUE
		     GROUP BY type
		  ) newest ON newest.type = c.type AND newest.latest_at = c.created_at
		 WHERE c.channel = ? AND c.is_active = TRUE
		 ORDER BY c.type ASC`,
		channel, channel,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}
	defer rows.Close()

	builds := make([]map[string]any, 0)
	origin := getPublicOrigin(c.Request)
	for rows.Next() {
		client, scanErr := scanClientRows(rows)
		if scanErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
			return
		}
		builds = append(builds, serializeClientRow(client, origin))
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"channel": channel,
		"builds":  builds,
	})
}

func (s Service) HandleClientBuildDownload(c *gin.Context) {
	clientID := strings.TrimSpace(c.Param("clientId"))
	if clientID == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "NOT_FOUND"})
		return
	}

	row := s.db.QueryRow(`
		SELECT id, type, version, channel, file_path, file_name, mime_type,
		       file_size, checksum_sha256, release_notes, created_at
		  FROM client
		 WHERE id = ?
		 LIMIT 1`,
		clientID,
	)
	client, err := scanClientRow(row)
	if errorsIsNoRows(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "NOT_FOUND"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "INTERNAL_SERVER_ERROR"})
		return
	}

	relPath := strings.TrimLeft(strings.TrimSpace(client.FilePath), "/")
	if relPath == "" || strings.Contains(relPath, "..") {
		c.JSON(http.StatusNotFound, gin.H{"error": "NOT_FOUND"})
		return
	}

	baseDir := s.cfg.ClientArtifactsDir
	if baseDir == "" {
		baseDir = "./storage/profiles"
	}
	absolutePath := safeJoin(baseDir, relPath)
	if absolutePath == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "FORBIDDEN"})
		return
	}
	if !fileExists(absolutePath) {
		c.JSON(http.StatusNotFound, gin.H{"error": "NOT_FOUND"})
		return
	}

	c.Header("Content-Type", firstNonEmpty(client.MimeType, "application/octet-stream"))
	if client.FileSize > 0 {
		c.Header("Content-Length", itoa64(client.FileSize))
	}
	c.Header("Cache-Control", "public, max-age=600")
	c.Header("Content-Disposition", `attachment; filename="`+sanitizeFilename(firstNonEmpty(client.FileName, "OpenCom.bin"))+`"`)
	c.File(absolutePath)
}

func (s Service) HandleStaticDownload(c *gin.Context) {
	fileName := resolveDownloadFilename(c.Param("filename"))
	if fileName == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "NOT_FOUND"})
		return
	}
	baseDir := resolveDownloadsBaseDir(s.cfg.RepoRoot, s.cfg.DownloadsStorageDir)
	resolved := safeJoin(baseDir, fileName)
	if resolved == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "FORBIDDEN"})
		return
	}
	if !fileExists(resolved) {
		c.JSON(http.StatusNotFound, gin.H{"error": "NOT_FOUND"})
		return
	}

	if stat, err := os.Stat(resolved); err == nil {
		c.Header("Content-Length", itoa64(stat.Size()))
	}
	c.Header("Content-Type", resolveContentType(fileName))
	c.Header("Cache-Control", "public, max-age=600")
	c.Header("Content-Disposition", `attachment; filename="`+sanitizeFilename(fileName)+`"`)
	c.File(resolved)
}

type desktopPackageMetadata struct {
	Version     string
	ProductName string
}

func loadDesktopPackageMetadata(repoRoot string) desktopPackageMetadata {
	pkgPath := filepath.Join(repoRoot, "client", "package.json")
	body, err := os.ReadFile(pkgPath)
	if err != nil {
		return desktopPackageMetadata{Version: "", ProductName: "OpenCom"}
	}
	var parsed struct {
		Version string `json:"version"`
		Build   struct {
			ProductName string `json:"productName"`
		} `json:"build"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return desktopPackageMetadata{Version: "", ProductName: "OpenCom"}
	}
	productName := strings.TrimSpace(parsed.Build.ProductName)
	if productName == "" {
		productName = "OpenCom"
	}
	return desktopPackageMetadata{
		Version:     strings.TrimSpace(parsed.Version),
		ProductName: productName,
	}
}

func listAvailableDesktopArtifacts(baseDir, origin string) []map[string]any {
	artifacts := make([]map[string]any, 0)
	for _, artifact := range desktopReleaseArtifacts {
		filePath := safeJoin(baseDir, artifact.FileName)
		if filePath == "" || !fileExists(filePath) {
			continue
		}
		stat, err := os.Stat(filePath)
		if err != nil {
			continue
		}
		downloadPath := "/downloads/" + artifact.FileName
		downloadURL := downloadPath
		if origin != "" {
			downloadURL = origin + downloadPath
		}
		artifacts = append(artifacts, map[string]any{
			"platform":     artifact.Platform,
			"kind":         artifact.Kind,
			"fileName":     artifact.FileName,
			"size":         stat.Size(),
			"downloadPath": downloadPath,
			"downloadUrl":  downloadURL,
		})
	}
	return artifacts
}

func pickPreferredDesktopArtifact(platform string, artifacts []map[string]any) map[string]any {
	p := strings.ToLower(strings.TrimSpace(platform))
	if p == "win32" || p == "windows" {
		for _, artifact := range artifacts {
			if artifact["platform"] == "win32" {
				return artifact
			}
		}
		return nil
	}
	if p == "linux" {
		order := []string{"deb", "rpm", "snap", "tarball"}
		for _, kind := range order {
			for _, artifact := range artifacts {
				if artifact["platform"] == "linux" && artifact["kind"] == kind {
					return artifact
				}
			}
		}
		return nil
	}
	if p == "darwin" || p == "mac" || p == "macos" {
		return nil
	}
	if len(artifacts) == 0 {
		return nil
	}
	return artifacts[0]
}

func serializeClientRow(row clientRow, origin string) map[string]any {
	downloadPath := "/v1/client/builds/" + row.ID + "/download"
	downloadURL := downloadPath
	if origin != "" {
		downloadURL = origin + downloadPath
	}
	return map[string]any{
		"id":           row.ID,
		"type":         row.Type,
		"version":      row.Version,
		"channel":      row.Channel,
		"fileName":     row.FileName,
		"mimeType":     row.MimeType,
		"fileSize":     row.FileSize,
		"checksum":     nullableString(row.ChecksumSHA256),
		"releaseNotes": nullableString(row.ReleaseNotes),
		"downloadUrl":  downloadURL,
		"publishedAt":  row.CreatedAt,
	}
}

func scanClientRow(row *sql.Row) (clientRow, error) {
	var client clientRow
	err := row.Scan(
		&client.ID, &client.Type, &client.Version, &client.Channel, &client.FilePath,
		&client.FileName, &client.MimeType, &client.FileSize, &client.ChecksumSHA256,
		&client.ReleaseNotes, &client.CreatedAt,
	)
	return client, err
}

func scanClientRows(rows *sql.Rows) (clientRow, error) {
	var client clientRow
	err := rows.Scan(
		&client.ID, &client.Type, &client.Version, &client.Channel, &client.FilePath,
		&client.FileName, &client.MimeType, &client.FileSize, &client.ChecksumSHA256,
		&client.ReleaseNotes, &client.CreatedAt,
	)
	return client, err
}

func validClientPlatform(value string) bool {
	switch value {
	case "windows", "linux_deb", "linux_rpm", "linux_snap", "linux_tar", "android", "ios", "macos":
		return true
	default:
		return false
	}
}

func validChannel(value string) bool {
	switch value {
	case "stable", "beta", "nightly":
		return true
	default:
		return false
	}
}

func nullableString(value sql.NullString) any {
	if value.Valid {
		return value.String
	}
	return nil
}

func errorsIsNoRows(err error) bool {
	return err == sql.ErrNoRows
}
