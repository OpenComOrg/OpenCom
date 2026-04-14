package linkpreview

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	neturl "net/url"
	"regexp"
	"strings"
	"time"
)

var (
	metaRe        = regexp.MustCompile(`(?i)<meta[^>]*>`)
	titleRe       = regexp.MustCompile(`(?is)<title[^>]*>([^<]+)</title>`)
	contentAttrRe = regexp.MustCompile(`(?i)content=["']([^"']+)["']`)
)

func isPrivateHostname(hostname string) bool {
	host := strings.ToLower(hostname)
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return true
	}
	if host == "0.0.0.0" || host == "::1" {
		return true
	}
	return isPrivateIPAddress(host)
}

func isPrivateIPAddress(address string) bool {
	ip := net.ParseIP(address)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	if ipv4 := ip.To4(); ipv4 != nil {
		if ipv4[0] == 0 {
			return true
		}
		if ipv4[0] == 100 && ipv4[1] >= 64 && ipv4[1] <= 127 {
			return true
		}
	}
	return false
}

func assertPreviewTargetAllowed(target *neturl.URL, appBaseHost string) error {
	if target == nil || target.User != nil {
		return errors.New("URL_NOT_ALLOWED")
	}

	targetHost := strings.ToLower(target.Hostname())
	if targetHost == "" {
		return errors.New("URL_NOT_ALLOWED")
	}
	if targetHost != appBaseHost && isPrivateHostname(targetHost) {
		return errors.New("URL_NOT_ALLOWED")
	}
	if targetHost == appBaseHost {
		return nil
	}
	if isPrivateIPAddress(targetHost) {
		return errors.New("URL_NOT_ALLOWED")
	}

	resolved, err := net.LookupIP(targetHost)
	if err != nil || len(resolved) == 0 {
		return errors.New("URL_NOT_ALLOWED")
	}
	for _, entry := range resolved {
		if isPrivateIPAddress(entry.String()) {
			return errors.New("URL_NOT_ALLOWED")
		}
	}
	return nil
}

func fetchPreviewResponse(ctx context.Context, target *neturl.URL, appBaseHost string) (*http.Response, *neturl.URL, error) {
	client := &http.Client{
		Timeout: 4500 * time.Millisecond,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("FETCH_FAILED")
			}
			if err := assertPreviewTargetAllowed(req.URL, appBaseHost); err != nil {
				return err
			}
			return nil
		},
	}

	if err := assertPreviewTargetAllowed(target, appBaseHost); err != nil {
		return nil, nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, nil, err
	}
	request.Header.Set("User-Agent", "OpenComLinkPreview/1.0 (+https://opencom.online)")
	request.Header.Set("Accept", "text/html,application/xhtml+xml")

	response, err := client.Do(request)
	if err != nil {
		return nil, nil, err
	}
	return response, response.Request.URL, nil
}

func normalizeURL(raw string) string {
	parsed, err := neturl.Parse(raw)
	if err != nil {
		return raw
	}
	parsed.Fragment = ""
	return parsed.String()
}

func decodeHTMLEntities(input string) string {
	return strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
	).Replace(input)
}

func extractMeta(html, key, attr string) string {
	matches := metaRe.FindAllString(html, -1)
	for _, match := range matches {
		lower := strings.ToLower(match)
		if !strings.Contains(lower, strings.ToLower(attr)+`="`+strings.ToLower(key)+`"`) &&
			!strings.Contains(lower, strings.ToLower(attr)+`='`+strings.ToLower(key)+`'`) {
			continue
		}
		content := contentAttrRe.FindStringSubmatch(match)
		if len(content) < 2 {
			continue
		}
		return strings.TrimSpace(decodeHTMLEntities(content[1]))
	}
	return ""
}

func extractTitle(html string) string {
	match := titleRe.FindStringSubmatch(html)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(decodeHTMLEntities(match[1]))
}

func inviteCodeFromURL(path string) string {
	re := regexp.MustCompile(`^/join/([a-zA-Z0-9_-]{3,32})/?$`)
	match := re.FindStringSubmatch(path)
	if len(match) < 2 {
		return ""
	}
	return match[1]
}

func giftCodeFromURL(path string) string {
	re := regexp.MustCompile(`^/gift/([a-zA-Z0-9_-]{8,96})/?$`)
	match := re.FindStringSubmatch(path)
	if len(match) < 2 {
		return ""
	}
	return match[1]
}

func readLimitedString(reader io.Reader, limit int64) (string, error) {
	body, err := io.ReadAll(io.LimitReader(reader, limit))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func urlParse(raw string) (*neturl.URL, error) {
	return neturl.Parse(raw)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
