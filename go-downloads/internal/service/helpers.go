package service

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

var downloadFileMap = map[string]string{
	"opencom.apk":                   "OpenCom.apk",
	"opencom.exe":                   "OpenCom.exe",
	"opencom.deb":                   "OpenCom.deb",
	"opencom.rpm":                   "OpenCom.rpm",
	"opencom.snap":                  "OpenCom.snap",
	"opencom.tar.gz":                "OpenCom.tar.gz",
	"desktop-release-manifest.json": "desktop-release-manifest.json",
	"linux-release-manifest.json":   "linux-release-manifest.json",
	"linux-release.sha256":          "linux-release.sha256",
}

var desktopReleaseArtifacts = []struct {
	Platform string
	Kind     string
	FileName string
}{
	{Platform: "win32", Kind: "nsis", FileName: "OpenCom.exe"},
	{Platform: "linux", Kind: "deb", FileName: "OpenCom.deb"},
	{Platform: "linux", Kind: "rpm", FileName: "OpenCom.rpm"},
	{Platform: "linux", Kind: "snap", FileName: "OpenCom.snap"},
	{Platform: "linux", Kind: "tarball", FileName: "OpenCom.tar.gz"},
}

var mimeByExt = map[string]string{
	".apk":    "application/vnd.android.package-archive",
	".deb":    "application/vnd.debian.binary-package",
	".exe":    "application/octet-stream",
	".gz":     "application/gzip",
	".json":   "application/json; charset=utf-8",
	".rpm":    "application/x-rpm",
	".sha256": "text/plain; charset=utf-8",
	".snap":   "application/octet-stream",
}

func resolveDownloadsBaseDir(repoRoot, configured string) string {
	if strings.TrimSpace(configured) == "" {
		return filepath.Clean(filepath.Join(repoRoot, "frontend/public/downloads"))
	}
	if filepath.IsAbs(configured) {
		return filepath.Clean(configured)
	}
	cwdResolved, _ := filepath.Abs(configured)
	if _, err := os.Stat(cwdResolved); err == nil {
		return cwdResolved
	}
	return filepath.Clean(filepath.Join(repoRoot, configured))
}

func resolveDownloadFilename(requested string) string {
	normalized := strings.TrimSpace(requested)
	if normalized == "" {
		return ""
	}
	if mapped, ok := downloadFileMap[strings.ToLower(normalized)]; ok {
		return mapped
	}
	for _, name := range downloadFileMap {
		if name == normalized {
			return name
		}
	}
	return ""
}

func compareVersionStrings(a, b string) int {
	left := splitVersion(a)
	right := splitVersion(b)
	maxLen := len(left)
	if len(right) > maxLen {
		maxLen = len(right)
	}
	for index := 0; index < maxLen; index++ {
		lv := 0
		rv := 0
		if index < len(left) {
			lv = left[index]
		}
		if index < len(right) {
			rv = right[index]
		}
		if lv != rv {
			return lv - rv
		}
	}
	return 0
}

func splitVersion(value string) []int {
	fields := strings.FieldsFunc(value, func(r rune) bool {
		return r < '0' || r > '9'
	})
	out := make([]int, 0, len(fields))
	for _, field := range fields {
		if field == "" {
			continue
		}
		parsed, err := strconv.Atoi(field)
		if err != nil {
			continue
		}
		out = append(out, parsed)
	}
	return out
}

func getPublicOrigin(r *http.Request) string {
	if explicit := strings.TrimSpace(r.Header.Get("x-opencom-public-origin")); explicit != "" {
		return explicit
	}
	proto := strings.TrimSpace(strings.Split(r.Header.Get("x-forwarded-proto"), ",")[0])
	host := strings.TrimSpace(strings.Split(r.Header.Get("x-forwarded-host"), ",")[0])
	if host == "" {
		host = strings.TrimSpace(strings.Split(r.Host, ",")[0])
	}
	if host == "" {
		return ""
	}
	if proto == "" {
		proto = "https"
	}
	return proto + "://" + host
}

func safeJoin(baseDir, fileName string) string {
	target := filepath.Clean(filepath.Join(baseDir, fileName))
	base := filepath.Clean(baseDir)
	if target == base || strings.HasPrefix(target, base+string(filepath.Separator)) {
		return target
	}
	return ""
}

func fileExists(filePath string) bool {
	_, err := os.Stat(filePath)
	return err == nil
}

func resolveContentType(fileName string) string {
	if contentType, ok := mimeByExt[strings.ToLower(filepath.Ext(fileName))]; ok {
		return contentType
	}
	return "application/octet-stream"
}
