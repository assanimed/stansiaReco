package domains

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	goDaddyProdBaseURL = "https://api.godaddy.com"
	goDaddyOTEBaseURL  = "https://api.ote-godaddy.com"
)

// GoDaddyClient interacts with the GoDaddy REST API (v1 and v3).
// It supports both:
//   - Modern Personal Access Tokens (PAT): Authorization: Bearer <PAT>
//   - Classic API Key & Secret pairs:      Authorization: sso-key <KEY>:<SECRET>
type GoDaddyClient struct {
	ApiKey      string
	ApiSecret   string
	ShopperID   string
	Environment string
	BaseURL     string
	HTTPClient  *http.Client
}

// GoDaddyDomainSummary represents a domain returned by GoDaddy's domain list APIs.
type GoDaddyDomainSummary struct {
	Domain         string
	DomainID       string
	Status         string
	ExpiresAt      *time.Time
	CreatedAt      *time.Time
	Locked         bool
	RenewAuto      bool
	NameServers    []string
	UsesGoDaddyDNS bool
}

// GoDaddyDNSRecord represents a single DNS record from GoDaddy (v1 or v3).
type GoDaddyDNSRecord struct {
	RecordID string `json:"recordId,omitempty"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Data     string `json:"data"`
	TTL      int    `json:"ttl"`
	Priority *int   `json:"priority,omitempty"`
	Service  string `json:"service,omitempty"`
	Protocol string `json:"protocol,omitempty"`
	Port     *int   `json:"port,omitempty"`
	Weight   *int   `json:"weight,omitempty"`
}

type goDaddyAPIErrorField struct {
	Code        string `json:"code"`
	Message     string `json:"message"`
	Path        string `json:"path"`
	PathRelated string `json:"pathRelated,omitempty"`
}

type goDaddyAPIErrorResponse struct {
	Code    string                 `json:"code"`
	Message string                 `json:"message"`
	Fields  []goDaddyAPIErrorField `json:"fields,omitempty"`
}

// NewGoDaddyClient creates a configured GoDaddy API client.
func NewGoDaddyClient(apiKey, apiSecret, shopperID, env string) *GoDaddyClient {
	cleanEnv := strings.ToLower(strings.TrimSpace(env))
	baseURL := goDaddyProdBaseURL
	if cleanEnv == "ote" || cleanEnv == "sandbox" || cleanEnv == "test" {
		baseURL = goDaddyOTEBaseURL
	}

	return &GoDaddyClient{
		ApiKey:      strings.TrimSpace(apiKey),
		ApiSecret:   strings.TrimSpace(apiSecret),
		ShopperID:   strings.TrimSpace(shopperID),
		Environment: cleanEnv,
		BaseURL:     baseURL,
		HTTPClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

// AuthMode returns "PAT" if using a Personal Access Token (Bearer) or "sso-key" if using Key:Secret.
func (c *GoDaddyClient) AuthMode() string {
	key := strings.TrimSpace(c.ApiKey)
	secret := strings.TrimSpace(c.ApiSecret)

	lowerKey := strings.ToLower(key)
	if strings.HasPrefix(lowerKey, "bearer ") {
		return "PAT"
	}
	if strings.HasPrefix(lowerKey, "sso-key ") {
		return "sso-key"
	}
	if secret != "" && !strings.EqualFold(secret, "pat") && secret != key {
		return "sso-key"
	}
	if strings.Contains(key, ":") && !strings.HasPrefix(lowerKey, "pat_") {
		return "sso-key"
	}
	return "PAT"
}

func (c *GoDaddyClient) authHeader() string {
	key := strings.TrimSpace(c.ApiKey)
	secret := strings.TrimSpace(c.ApiSecret)

	lowerKey := strings.ToLower(key)
	if strings.HasPrefix(lowerKey, "bearer ") {
		return "Bearer " + strings.TrimSpace(key[7:])
	}
	if strings.HasPrefix(lowerKey, "sso-key ") {
		return "sso-key " + strings.TrimSpace(key[8:])
	}

	if secret != "" && !strings.EqualFold(secret, "pat") && secret != key {
		return fmt.Sprintf("sso-key %s:%s", key, secret)
	}

	if strings.Contains(key, ":") && !strings.HasPrefix(lowerKey, "pat_") {
		return "sso-key " + key
	}

	return "Bearer " + key
}

var validShopperIDRegex = regexp.MustCompile(`^[0-9a-zA-Z\-]{4,64}$`)

func (c *GoDaddyClient) shouldSendShopperHeader() bool {
	s := strings.TrimSpace(c.ShopperID)
	if s == "" || strings.Contains(s, "@") || strings.Contains(s, " ") {
		return false
	}
	return validShopperIDRegex.MatchString(s)
}

func (c *GoDaddyClient) doRequest(ctx context.Context, method, path string, query url.Values, payload any) ([]byte, int, error) {
	base := strings.TrimRight(c.BaseURL, "/")
	fullURL := base + path
	if len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	var bodyReader io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to marshal GoDaddy request payload: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create GoDaddy request: %w", err)
	}

	req.Header.Set("Authorization", c.authHeader())
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.shouldSendShopperHeader() {
		req.Header.Set("X-Shopper-Id", c.ShopperID)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to reach GoDaddy API (%s): %w", base, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read GoDaddy API response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return respBody, resp.StatusCode, parseGoDaddyError(resp.StatusCode, respBody)
	}

	return respBody, resp.StatusCode, nil
}

func parseGoDaddyError(statusCode int, respBody []byte) error {
	var apiErr goDaddyAPIErrorResponse
	if len(respBody) > 0 && json.Unmarshal(respBody, &apiErr) == nil && (apiErr.Code != "" || apiErr.Message != "") {
		var details []string
		for _, f := range apiErr.Fields {
			if f.Path != "" && f.Message != "" {
				details = append(details, fmt.Sprintf("%s: %s", f.Path, f.Message))
			} else if f.Message != "" {
				details = append(details, f.Message)
			}
		}
		msg := apiErr.Message
		if msg == "" {
			msg = apiErr.Code
		}
		if len(details) > 0 {
			msg = fmt.Sprintf("%s (%s)", msg, strings.Join(details, "; "))
		}
		code := apiErr.Code
		if code == "" {
			code = fmt.Sprintf("HTTP_%d", statusCode)
		}
		return fmt.Errorf("[%s] %s (HTTP %d)", code, msg, statusCode)
	}

	snippet := strings.TrimSpace(string(respBody))
	if len(snippet) > 240 {
		snippet = snippet[:240] + "..."
	}
	if snippet == "" {
		snippet = http.StatusText(statusCode)
	}
	return fmt.Errorf("[HTTP_%d] GoDaddy API returned status %d: %s", statusCode, statusCode, snippet)
}

// TestConnection verifies credentials against the live GoDaddy API and measures latency.
func (c *GoDaddyClient) TestConnection(ctx context.Context) (*TestConnectionResult, error) {
	if strings.TrimSpace(c.ApiKey) == "" {
		return &TestConnectionResult{
			Success: false,
			Message: "GoDaddy requires a Personal Access Token (PAT) or an API Key & Secret",
			Latency: "0ms",
		}, nil
	}

	start := time.Now()
	q := url.Values{"limit": []string{"5"}}
	body, status, err := c.doRequest(ctx, http.MethodGet, "/v1/domains", q, nil)
	if err != nil && c.AuthMode() == "PAT" && (status == http.StatusUnauthorized || status == http.StatusForbidden) {
		// Try v3 endpoint in case PAT is scoped strictly for v3
		qV3 := url.Values{"pageSize": []string{"5"}}
		bodyV3, _, errV3 := c.doRequest(ctx, http.MethodGet, "/v3/domains/domain-names", qV3, nil)
		if errV3 == nil {
			body = bodyV3
			err = nil
		}
	}

	latency := time.Since(start)
	if err != nil {
		return &TestConnectionResult{
			Success: false,
			Message: fmt.Sprintf("GoDaddy authentication failed: %s", err.Error()),
			Latency: fmt.Sprintf("%dms", latency.Milliseconds()),
		}, nil
	}

	domainCount := 0
	var v1Items []map[string]any
	if json.Unmarshal(body, &v1Items) == nil {
		domainCount = len(v1Items)
	} else {
		var v3Resp struct {
			Items []map[string]any `json:"items"`
		}
		if json.Unmarshal(body, &v3Resp) == nil {
			domainCount = len(v3Resp.Items)
		}
	}

	envLabel := "Production"
	if c.BaseURL == goDaddyOTEBaseURL {
		envLabel = "OTE Sandbox"
	}

	return &TestConnectionResult{
		Success: true,
		Message: fmt.Sprintf("Successfully authenticated with GoDaddy (%s, %s auth, %d+ domain(s) accessible)", envLabel, c.AuthMode(), domainCount),
		Latency: fmt.Sprintf("%dms", latency.Milliseconds()),
	}, nil
}

type goDaddyV1Domain struct {
	Domain      string   `json:"domain"`
	DomainID    any      `json:"domainId"`
	Status      string   `json:"status"`
	Expires     string   `json:"expires"`
	CreatedAt   string   `json:"createdAt"`
	Locked      bool     `json:"locked"`
	RenewAuto   bool     `json:"renewAuto"`
	NameServers []string `json:"nameServers"`
}

type goDaddyV3DomainListResponse struct {
	Items []struct {
		Domain       string   `json:"domain"`
		DomainID     any      `json:"domainId"`
		Status       string   `json:"status"`
		ExpiresAt    string   `json:"expiresAt"`
		CreatedAt    string   `json:"createdAt"`
		TransferLock bool     `json:"transferLock"`
		AutoRenew    bool     `json:"autoRenew"`
		NameServers  []string `json:"nameServers"`
	} `json:"items"`
}

func isGoDaddyNameservers(ns []string) bool {
	if len(ns) == 0 {
		return true
	}
	for _, n := range ns {
		lower := strings.ToLower(strings.TrimSpace(n))
		if strings.Contains(lower, "domaincontrol.com") ||
			strings.Contains(lower, "secureserver.net") ||
			strings.Contains(lower, "godaddy.com") {
			return true
		}
	}
	return false
}

func normalizeGoDaddyDomainStatus(raw string) string {
	upper := strings.ToUpper(strings.TrimSpace(raw))
	switch {
	case upper == "ACTIVE" || upper == "TRANSFERRED_IN":
		return "active"
	case strings.Contains(upper, "EXPIRED") || strings.Contains(upper, "CANCELLED") || strings.Contains(upper, "DELETED"):
		return "expired"
	case strings.Contains(upper, "PENDING") || strings.Contains(upper, "AWAITING"):
		return "pending"
	default:
		return "active"
	}
}

func parseGoDaddyTime(val string) *time.Time {
	val = strings.TrimSpace(val)
	if val == "" {
		return nil
	}
	formats := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05Z0700",
		"2006-01-02T15:04:05.000Z",
		"2006-01-02",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, val); err == nil {
			return &t
		}
	}
	return nil
}

func formatDomainID(v any) string {
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return strconv.FormatInt(int64(val), 10)
	case int64:
		return strconv.FormatInt(val, 10)
	case json.Number:
		return val.String()
	default:
		if v != nil {
			return fmt.Sprintf("%v", v)
		}
		return ""
	}
}

// GetDomainList retrieves all domains registered in the GoDaddy account.
// It queries v1 (/v1/domains) with automatic fallback to v3 (/v3/domains/domain-names) for v3-scoped PATs.
func (c *GoDaddyClient) GetDomainList(ctx context.Context) ([]GoDaddyDomainSummary, error) {
	q := url.Values{
		"limit":    []string{"500"},
		"includes": []string{"nameServers"},
	}

	body, status, err := c.doRequest(ctx, http.MethodGet, "/v1/domains", q, nil)
	if err == nil {
		var rawDomains []goDaddyV1Domain
		if uErr := json.Unmarshal(body, &rawDomains); uErr != nil {
			return nil, fmt.Errorf("failed to decode GoDaddy domain list: %w", uErr)
		}

		results := make([]GoDaddyDomainSummary, 0, len(rawDomains))
		for _, item := range rawDomains {
			dName := strings.ToLower(strings.TrimSpace(item.Domain))
			if dName == "" {
				continue
			}
			// Skip cancelled/deleted historical domains unless active or recently expired
			upperStatus := strings.ToUpper(strings.TrimSpace(item.Status))
			if strings.HasPrefix(upperStatus, "CANCELLED") || strings.HasPrefix(upperStatus, "CONFISCATED") {
				continue
			}

			ns := make([]string, 0, len(item.NameServers))
			for _, n := range item.NameServers {
				if trimmed := strings.ToLower(strings.TrimSpace(n)); trimmed != "" {
					ns = append(ns, trimmed)
				}
			}

			results = append(results, GoDaddyDomainSummary{
				Domain:         dName,
				DomainID:       formatDomainID(item.DomainID),
				Status:         normalizeGoDaddyDomainStatus(item.Status),
				ExpiresAt:      parseGoDaddyTime(item.Expires),
				CreatedAt:      parseGoDaddyTime(item.CreatedAt),
				Locked:         item.Locked,
				RenewAuto:      item.RenewAuto,
				NameServers:    ns,
				UsesGoDaddyDNS: isGoDaddyNameservers(ns),
			})
		}
		return results, nil
	}

	// Fallback to v3 if PAT is scoped to v3
	if c.AuthMode() == "PAT" && (status == http.StatusUnauthorized || status == http.StatusForbidden || status == http.StatusNotFound) {
		qV3 := url.Values{"pageSize": []string{"100"}}
		bodyV3, _, errV3 := c.doRequest(ctx, http.MethodGet, "/v3/domains/domain-names", qV3, nil)
		if errV3 != nil {
			return nil, err // Return original or v3 error
		}

		var v3Resp goDaddyV3DomainListResponse
		if uErr := json.Unmarshal(bodyV3, &v3Resp); uErr != nil {
			return nil, fmt.Errorf("failed to decode GoDaddy v3 domain list: %w", uErr)
		}

		results := make([]GoDaddyDomainSummary, 0, len(v3Resp.Items))
		for _, item := range v3Resp.Items {
			dName := strings.ToLower(strings.TrimSpace(item.Domain))
			if dName == "" {
				continue
			}
			upperStatus := strings.ToUpper(strings.TrimSpace(item.Status))
			if strings.HasPrefix(upperStatus, "CANCELLED") {
				continue
			}

			ns := make([]string, 0, len(item.NameServers))
			for _, n := range item.NameServers {
				if trimmed := strings.ToLower(strings.TrimSpace(n)); trimmed != "" {
					ns = append(ns, trimmed)
				}
			}

			results = append(results, GoDaddyDomainSummary{
				Domain:         dName,
				DomainID:       formatDomainID(item.DomainID),
				Status:         normalizeGoDaddyDomainStatus(item.Status),
				ExpiresAt:      parseGoDaddyTime(item.ExpiresAt),
				CreatedAt:      parseGoDaddyTime(item.CreatedAt),
				Locked:         item.TransferLock,
				RenewAuto:      item.AutoRenew,
				NameServers:    ns,
				UsesGoDaddyDNS: isGoDaddyNameservers(ns),
			})
		}
		return results, nil
	}

	return nil, err
}

// GetDNSRecords fetches all authoritative DNS records for a domain from GoDaddy.
// It also returns a boolean indicating whether the domain is using GoDaddy's nameservers.
func (c *GoDaddyClient) GetDNSRecords(ctx context.Context, domainName string) ([]GoDaddyDNSRecord, bool, error) {
	domainName = strings.ToLower(strings.TrimSpace(domainName))
	if domainName == "" {
		return nil, false, fmt.Errorf("domain name is required")
	}

	usesGoDaddyDNS := true
	// Check domain details for nameservers (best-effort)
	if domBody, _, domErr := c.doRequest(ctx, http.MethodGet, "/v1/domains/"+url.PathEscape(domainName), nil, nil); domErr == nil {
		var dInfo goDaddyV1Domain
		if json.Unmarshal(domBody, &dInfo) == nil && len(dInfo.NameServers) > 0 {
			usesGoDaddyDNS = isGoDaddyNameservers(dInfo.NameServers)
		}
	}

	// 1. Try v1 /v1/domains/{domain}/records (supported by both sso-key and standard PATs)
	records, status, err := c.getDNSRecordsV1(ctx, domainName)
	if err == nil {
		return records, usesGoDaddyDNS, nil
	}

	// 2. If PAT is used and v1 returned 401/403, try v3 /v3/domains/zones/{zone}/dns-records
	if c.AuthMode() == "PAT" && (status == http.StatusUnauthorized || status == http.StatusForbidden) {
		v3Records, errV3 := c.getDNSRecordsV3(ctx, domainName)
		if errV3 == nil {
			return v3Records, usesGoDaddyDNS, nil
		}
	}

	return nil, usesGoDaddyDNS, err
}

func (c *GoDaddyClient) getDNSRecordsV1(ctx context.Context, domainName string) ([]GoDaddyDNSRecord, int, error) {
	allRecords := make([]GoDaddyDNSRecord, 0)
	limit := 500
	offset := 0

	for page := 0; page < 10; page++ {
		q := url.Values{
			"limit":  []string{strconv.Itoa(limit)},
			"offset": []string{strconv.Itoa(offset)},
		}
		path := fmt.Sprintf("/v1/domains/%s/records", url.PathEscape(domainName))
		body, status, err := c.doRequest(ctx, http.MethodGet, path, q, nil)
		if err != nil {
			return nil, status, err
		}

		var batch []GoDaddyDNSRecord
		if err := json.Unmarshal(body, &batch); err != nil {
			return nil, status, fmt.Errorf("failed to parse GoDaddy DNS records: %w", err)
		}

		allRecords = append(allRecords, batch...)
		if len(batch) < limit {
			break
		}
		offset += limit
	}

	return allRecords, http.StatusOK, nil
}

func (c *GoDaddyClient) getDNSRecordsV3(ctx context.Context, domainName string) ([]GoDaddyDNSRecord, error) {
	allRecords := make([]GoDaddyDNSRecord, 0)
	pageSize := 100

	for page := 1; page <= 10; page++ {
		q := url.Values{
			"page":     []string{strconv.Itoa(page)},
			"pageSize": []string{strconv.Itoa(pageSize)},
		}
		path := fmt.Sprintf("/v3/domains/zones/%s/dns-records", url.PathEscape(domainName))
		body, _, err := c.doRequest(ctx, http.MethodGet, path, q, nil)
		if err != nil {
			return nil, err
		}

		var resp struct {
			Items []GoDaddyDNSRecord `json:"items"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return nil, fmt.Errorf("failed to parse GoDaddy v3 DNS records: %w", err)
		}

		allRecords = append(allRecords, resp.Items...)
		if len(resp.Items) < pageSize {
			break
		}
	}

	return allRecords, nil
}

// isImmutableGoDaddyRecord returns true for system-managed records (SOA and root '@' NS)
// that GoDaddy forbids mutating via the DNS records API (returns HTTP 409 dns_record_not_mutable).
func isImmutableGoDaddyRecord(recType, hostName, domainName string) bool {
	rt := strings.ToUpper(strings.TrimSpace(recType))
	if rt == "SOA" {
		return true
	}
	if rt == "NS" {
		normHost := normalizeGoDaddyHostName(hostName, domainName)
		if normHost == "@" {
			return true
		}
	}
	return false
}

func normalizeGoDaddyHostName(hostName, domainName string) string {
	h := strings.TrimSpace(hostName)
	d := strings.ToLower(strings.TrimSpace(domainName))

	if h == "" || h == "@" || h == "@." {
		return "@"
	}
	lowerH := strings.ToLower(h)
	if lowerH == d || lowerH == d+"." {
		return "@"
	}
	if strings.HasSuffix(lowerH, "."+d) {
		h = h[:len(h)-len("."+d)]
	} else if strings.HasSuffix(lowerH, "."+d+".") {
		h = h[:len(h)-len("."+d+".")]
	}
	h = strings.TrimSuffix(h, ".")
	if h == "" {
		return "@"
	}
	return h
}

func normalizeDesiredRecordsForGoDaddy(domainName string, records []DNSRecord) []GoDaddyDNSRecord {
	out := make([]GoDaddyDNSRecord, 0, len(records))
	seen := make(map[string]bool)

	for _, r := range records {
		recType := strings.ToUpper(strings.TrimSpace(r.RecordType))
		if recType == "SPF" {
			recType = "TXT"
		}
		if recType == "" {
			continue
		}

		hostName := normalizeGoDaddyHostName(r.HostName, domainName)
		if isImmutableGoDaddyRecord(recType, hostName, domainName) {
			continue
		}

		data := strings.TrimSpace(r.RecordValue)
		if data == "" {
			continue
		}

		// GoDaddy requires TTL between 600 (10 minutes) and 86400 (24 hours)
		ttl := r.TTL
		if ttl < 600 {
			ttl = 600
		} else if ttl > 86400 {
			ttl = 86400
		}

		var priority *int
		if recType == "MX" {
			p := 10
			if r.MXPriority != nil && *r.MXPriority >= 0 {
				p = *r.MXPriority
			}
			priority = &p
		} else if recType == "SRV" && r.MXPriority != nil {
			p := *r.MXPriority
			priority = &p
		}

		dedupKey := fmt.Sprintf("%s|%s|%s", recType, strings.ToLower(hostName), data)
		if seen[dedupKey] {
			continue
		}
		seen[dedupKey] = true

		out = append(out, GoDaddyDNSRecord{
			Type:     recType,
			Name:     hostName,
			Data:     data,
			TTL:      ttl,
			Priority: priority,
		})
	}

	return out
}

// SyncDNSRecords synchronizes the desired local DNS records for a domain to GoDaddy.
// It safely preserves GoDaddy's immutable SOA and apex '@' NS records while updating, adding,
// and deleting mutable records (A, AAAA, CNAME, MX, TXT, SRV, CAA, and subdomain NS).
func (c *GoDaddyClient) SyncDNSRecords(ctx context.Context, domainName string, desiredRecords []DNSRecord) error {
	domainName = strings.ToLower(strings.TrimSpace(domainName))
	if domainName == "" {
		return fmt.Errorf("domain name is required")
	}

	normalizedDesired := normalizeDesiredRecordsForGoDaddy(domainName, desiredRecords)

	// Try v1 synchronization first
	status, err := c.syncDNSRecordsV1(ctx, domainName, normalizedDesired)
	if err == nil {
		return nil
	}

	// If using a v3-only PAT and v1 returned 401/403, synchronize via v3 zone records API
	if c.AuthMode() == "PAT" && (status == http.StatusUnauthorized || status == http.StatusForbidden) {
		if errV3 := c.syncDNSRecordsV3(ctx, domainName, normalizedDesired); errV3 == nil {
			return nil
		}
	}

	return err
}

func (c *GoDaddyClient) syncDNSRecordsV1(ctx context.Context, domainName string, desired []GoDaddyDNSRecord) (int, error) {
	// 1. Fetch existing records on GoDaddy so we know which record types or (type, name) pairs need removal
	existing, status, err := c.getDNSRecordsV1(ctx, domainName)
	if err != nil {
		return status, err
	}

	desiredByType := make(map[string][]GoDaddyDNSRecord)
	desiredSubdomainNS := make(map[string][]GoDaddyDNSRecord)
	for _, r := range desired {
		if r.Type == "NS" {
			desiredSubdomainNS[strings.ToLower(r.Name)] = append(desiredSubdomainNS[strings.ToLower(r.Name)], r)
			continue
		}
		desiredByType[r.Type] = append(desiredByType[r.Type], r)
	}

	existingNamesByType := make(map[string]map[string]bool)
	existingSubdomainNS := make(map[string]bool)
	for _, r := range existing {
		rt := strings.ToUpper(strings.TrimSpace(r.Type))
		hName := normalizeGoDaddyHostName(r.Name, domainName)
		if isImmutableGoDaddyRecord(rt, hName, domainName) {
			continue
		}
		if rt == "NS" {
			existingSubdomainNS[strings.ToLower(hName)] = true
			continue
		}
		if existingNamesByType[rt] == nil {
			existingNamesByType[rt] = make(map[string]bool)
		}
		existingNamesByType[rt][hName] = true
	}

	// 2. For each standard mutable type present in desired, replace all records of that type via PUT /v1/domains/{domain}/records/{type}
	for recType, recs := range desiredByType {
		path := fmt.Sprintf("/v1/domains/%s/records/%s", url.PathEscape(domainName), url.PathEscape(recType))
		if _, st, putErr := c.doRequest(ctx, http.MethodPut, path, nil, recs); putErr != nil {
			return st, fmt.Errorf("failed to update %s records on GoDaddy: %w", recType, putErr)
		}
	}

	// 3. For any existing mutable record type that now has 0 desired records, delete each existing (type, name)
	for recType, namesMap := range existingNamesByType {
		if len(desiredByType[recType]) > 0 {
			continue
		}
		for name := range namesMap {
			delPath := fmt.Sprintf("/v1/domains/%s/records/%s/%s",
				url.PathEscape(domainName),
				url.PathEscape(recType),
				url.PathEscape(name),
			)
			if _, st, delErr := c.doRequest(ctx, http.MethodDelete, delPath, nil, nil); delErr != nil && st != http.StatusNotFound {
				return st, fmt.Errorf("failed to delete %s (%s) record on GoDaddy: %w", recType, name, delErr)
			}
		}
	}

	// 4. Handle subdomain NS records per-name (never touching apex '@' NS)
	for lowerName, recs := range desiredSubdomainNS {
		actualName := recs[0].Name
		putPath := fmt.Sprintf("/v1/domains/%s/records/NS/%s", url.PathEscape(domainName), url.PathEscape(actualName))
		if _, st, putErr := c.doRequest(ctx, http.MethodPut, putPath, nil, recs); putErr != nil {
			return st, fmt.Errorf("failed to update subdomain NS (%s) on GoDaddy: %w", actualName, putErr)
		}
		delete(existingSubdomainNS, lowerName)
	}
	for removedSubNS := range existingSubdomainNS {
		delPath := fmt.Sprintf("/v1/domains/%s/records/NS/%s", url.PathEscape(domainName), url.PathEscape(removedSubNS))
		_, _, _ = c.doRequest(ctx, http.MethodDelete, delPath, nil, nil)
	}

	return http.StatusOK, nil
}

func (c *GoDaddyClient) syncDNSRecordsV3(ctx context.Context, domainName string, desired []GoDaddyDNSRecord) error {
	existing, err := c.getDNSRecordsV3(ctx, domainName)
	if err != nil {
		return err
	}

	recordKey := func(r GoDaddyDNSRecord) string {
		prio := 0
		if r.Priority != nil {
			prio = *r.Priority
		}
		return fmt.Sprintf("%s|%s|%s|%d|%d",
			strings.ToUpper(strings.TrimSpace(r.Type)),
			strings.ToLower(normalizeGoDaddyHostName(r.Name, domainName)),
			strings.TrimSpace(r.Data),
			r.TTL,
			prio,
		)
	}

	desiredMap := make(map[string]GoDaddyDNSRecord, len(desired))
	for _, d := range desired {
		desiredMap[recordKey(d)] = d
	}

	keptKeys := make(map[string]bool)
	zonePath := fmt.Sprintf("/v3/domains/zones/%s/dns-records", url.PathEscape(domainName))

	// Delete remote mutable records that are not in desiredMap
	for _, ex := range existing {
		if isImmutableGoDaddyRecord(ex.Type, ex.Name, domainName) {
			continue
		}
		k := recordKey(ex)
		if _, ok := desiredMap[k]; ok && !keptKeys[k] {
			keptKeys[k] = true
			continue
		}
		if ex.RecordID != "" {
			delPath := fmt.Sprintf("%s/%s", zonePath, url.PathEscape(ex.RecordID))
			if _, st, delErr := c.doRequest(ctx, http.MethodDelete, delPath, nil, nil); delErr != nil && st != http.StatusNotFound {
				return fmt.Errorf("failed to delete GoDaddy v3 DNS record %s: %w", ex.RecordID, delErr)
			}
		}
	}

	// Create desired records that were not already present on GoDaddy
	for k, d := range desiredMap {
		if keptKeys[k] {
			continue
		}
		if _, _, postErr := c.doRequest(ctx, http.MethodPost, zonePath, nil, d); postErr != nil {
			return fmt.Errorf("failed to create GoDaddy v3 DNS record (%s %s): %w", d.Type, d.Name, postErr)
		}
	}

	return nil
}
