package domains

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	NamecheapProdURL    = "https://api.namecheap.com/xml.response"
	NamecheapSandboxURL = "https://api.sandbox.namecheap.com/xml.response"
)

// Known multi-part public suffixes to properly distinguish SLD and TLD.
var multiPartTLDs = map[string]bool{
	"co.uk": true, "org.uk": true, "me.uk": true, "ltd.uk": true, "plc.uk": true, "net.uk": true,
	"com.au": true, "net.au": true, "org.au": true, "edu.au": true, "asn.au": true, "id.au": true,
	"co.nz": true, "net.nz": true, "org.nz": true, "gen.nz": true, "geek.nz": true,
	"co.za": true, "org.za": true, "web.za": true, "net.za": true,
	"com.br": true, "net.br": true, "org.br": true, "adv.br": true, "blog.br": true,
	"co.jp": true, "ne.jp": true, "or.jp": true, "ac.jp": true, "ad.jp": true,
	"com.sg": true, "net.sg": true, "org.sg": true, "edu.sg": true, "per.sg": true,
	"co.in": true, "net.in": true, "org.in": true, "gen.in": true, "firm.in": true, "ind.in": true,
	"com.mx": true, "net.mx": true, "org.mx": true, "edu.mx": true,
	"com.tr": true, "org.tr": true, "net.tr": true, "biz.tr": true,
	"com.ar": true, "net.ar": true, "org.ar": true,
	"co.il": true, "org.il": true, "net.il": true,
}

// SplitDomain extracts the SLD (second-level domain) and TLD (top-level domain).
// e.g. "example.com" -> ("example", "com")
// e.g. "my-brand.co.uk" -> ("my-brand", "co.uk")
// e.g. "sub.example.com" -> ("example", "com")
func SplitDomain(domain string) (sld string, tld string) {
	domain = strings.TrimSpace(strings.ToLower(domain))
	parts := strings.Split(domain, ".")
	if len(parts) <= 1 {
		return domain, ""
	}

	// Check if the last two parts form a known multi-part TLD (e.g. co.uk)
	if len(parts) >= 3 {
		lastTwo := parts[len(parts)-2] + "." + parts[len(parts)-1]
		if multiPartTLDs[lastTwo] {
			tld = lastTwo
			sld = parts[len(parts)-3]
			return sld, tld
		}
	}

	// Standard single-part TLD (e.g. com, net, org, io, app)
	tld = parts[len(parts)-1]
	sld = parts[len(parts)-2]
	return sld, tld
}

// NamecheapClient handles communication with Namecheap's XML API.
type NamecheapClient struct {
	ApiUser     string
	ApiKey      string
	UserName    string
	ClientIP    string
	Environment string
	httpClient  *http.Client
}

func NewNamecheapClient(apiUser, apiKey, userName, clientIP, env string) *NamecheapClient {
	if userName == "" {
		userName = apiUser
	}
	if env == "" {
		env = "production"
	}
	return &NamecheapClient{
		ApiUser:     apiUser,
		ApiKey:      apiKey,
		UserName:    userName,
		ClientIP:    clientIP,
		Environment: env,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *NamecheapClient) apiEndpoint() string {
	if strings.EqualFold(c.Environment, "sandbox") || strings.EqualFold(c.Environment, "ote") {
		return NamecheapSandboxURL
	}
	return NamecheapProdURL
}

var (
	cachedPublicIP   string
	cachedPublicIPAt time.Time
)

// DetectOutboundIP fetches the server's public IPv4 address using external IP services.
func DetectOutboundIP() string {
	if cachedPublicIP != "" && time.Since(cachedPublicIPAt) < 1*time.Minute {
		return cachedPublicIP
	}

	client := &http.Client{Timeout: 3 * time.Second}
	endpoints := []string{
		"https://api.ipify.org",
		"https://checkip.amazonaws.com",
		"https://ifconfig.me/ip",
	}

	for _, ep := range endpoints {
		resp, err := client.Get(ep)
		if err == nil {
			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err == nil {
				ip := strings.TrimSpace(string(body))
				if ip != "" && !strings.Contains(ip, "<") && !strings.Contains(ip, " ") {
					cachedPublicIP = ip
					cachedPublicIPAt = time.Now()
					return ip
				}
			}
		}
	}

	return ""
}

func (c *NamecheapClient) getClientIP() string {
	ip := strings.TrimSpace(c.ClientIP)
	if ip != "" && ip != "127.0.0.1" && ip != "::1" && !strings.EqualFold(ip, "auto") && !strings.EqualFold(ip, "localhost") {
		return ip
	}

	if detected := DetectOutboundIP(); detected != "" {
		return detected
	}

	if ip != "" {
		return ip
	}
	return "127.0.0.1"
}

// XML Data Models for Namecheap Responses

type NamecheapXMLResponse struct {
	XMLName         xml.Name                  `xml:"ApiResponse"`
	Status          string                    `xml:"Status,attr"`
	Errors          []NamecheapXMLError       `xml:"Errors>Error"`
	Warnings        []NamecheapXMLWarning     `xml:"Warnings>Warning"`
	CommandResponse NamecheapCommandResponse  `xml:"CommandResponse"`
}

type NamecheapXMLError struct {
	Number      string `xml:"Number,attr"`
	Description string `xml:",chardata"`
}

type NamecheapXMLWarning struct {
	Number      string `xml:"Number,attr"`
	Description string `xml:",chardata"`
}

type NamecheapCommandResponse struct {
	Type                    string                    `xml:"Type,attr"`
	DomainDNSGetHostsResult *DomainDNSGetHostsResult  `xml:"DomainDNSGetHostsResult"`
	DomainDNSSetHostsResult *DomainDNSSetHostsResult  `xml:"DomainDNSSetHostsResult"`
	DomainGetListResult     *DomainGetListResult      `xml:"DomainGetListResult"`
}

type DomainDNSGetHostsResult struct {
	Domain        string          `xml:"Domain,attr"`
	EmailType     string          `xml:"EmailType,attr"`
	IsUsingOurDNS bool            `xml:"IsUsingOurDNS,attr"`
	Hosts         []NamecheapHost `xml:"host"`
}

type NamecheapHost struct {
	HostID   string `xml:"HostId,attr"`
	Name     string `xml:"Name,attr"`
	Type     string `xml:"Type,attr"`
	Address  string `xml:"Address,attr"`
	MXPref   int    `xml:"MXPref,attr"`
	TTL      int    `xml:"TTL,attr"`
	IsActive string `xml:"IsActive,attr"`
}

type DomainDNSSetHostsResult struct {
	Domain    string `xml:"Domain,attr"`
	IsSuccess bool   `xml:"IsSuccess,attr"`
}

type DomainGetListResult struct {
	Domains []NamecheapDomainItem `xml:"Domain"`
}

type NamecheapDomainItem struct {
	ID        string `xml:"ID,attr"`
	Name      string `xml:"Name,attr"`
	User      string `xml:"User,attr"`
	Created   string `xml:"Created,attr"`
	Expires   string `xml:"Expires,attr"`
	IsExpired bool   `xml:"IsExpired,attr"`
	IsLocked  bool   `xml:"IsLocked,attr"`
	AutoRenew bool   `xml:"AutoRenew,attr"`
	IsOurDNS  bool   `xml:"IsOurDNS,attr"`
}

// ParseNamecheapXML unmarshals raw XML bytes from Namecheap into NamecheapXMLResponse.
func ParseNamecheapXML(data []byte, target *NamecheapXMLResponse) error {
	return xml.Unmarshal(data, target)
}

// executeCommand runs a command against Namecheap API and decodes the XML response.
func (c *NamecheapClient) executeCommand(ctx context.Context, command string, params url.Values) (*NamecheapXMLResponse, error) {
	if params == nil {
		params = url.Values{}
	}

	resolvedIP := c.getClientIP()
	params.Set("ApiUser", c.ApiUser)
	params.Set("ApiKey", c.ApiKey)
	params.Set("UserName", c.UserName)
	params.Set("ClientIp", resolvedIP)
	params.Set("Command", command)

	var req *http.Request
	var err error

	// Use GET for queries like getHosts and getList (matches official examples & user script)
	// Use POST for mutations with many record fields like setHosts
	if strings.EqualFold(command, "namecheap.domains.dns.setHosts") {
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, c.apiEndpoint(), strings.NewReader(params.Encode()))
		if err != nil {
			return nil, fmt.Errorf("failed to create Namecheap request: %w", err)
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	} else {
		reqURL := c.apiEndpoint() + "?" + params.Encode()
		req, err = http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to create Namecheap request: %w", err)
		}
	}
	req.Header.Set("User-Agent", "StansiaReco-ControlPlane/1.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request to Namecheap failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read Namecheap response body: %w", err)
	}

	var parsed NamecheapXMLResponse
	if err := ParseNamecheapXML(bodyBytes, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse Namecheap XML response: %w (raw response: %s)", err, string(bodyBytes))
	}

	if parsed.Status != "OK" {
		var errMsgs []string
		for _, e := range parsed.Errors {
			desc := strings.TrimSpace(e.Description)
			if e.Number == "1011150" {
				var rejectedIP string
				if strings.Contains(desc, "Invalid request IP:") {
					parts := strings.Split(desc, "Invalid request IP:")
					if len(parts) > 1 {
						rejectedIP = strings.TrimSpace(parts[1])
					}
				}
				if rejectedIP == "" {
					rejectedIP = resolvedIP
				}
				desc = fmt.Sprintf("Invalid request IP: %s — Please add this IP address (%s) to your Whitelisted IPs in Namecheap (Profile > Tools > Namecheap API Access > Whitelisted IPs)", rejectedIP, rejectedIP)
			}
			errMsgs = append(errMsgs, fmt.Sprintf("[%s] %s", e.Number, desc))
		}
		if len(errMsgs) > 0 {
			return &parsed, errors.New(strings.Join(errMsgs, "; "))
		}
		return &parsed, errors.New("Namecheap API returned status ERROR with no details")
	}

	return &parsed, nil
}

// GetDNSHosts retrieves all DNS host records for a domain from Namecheap.
func (c *NamecheapClient) GetDNSHosts(ctx context.Context, domainName string) ([]NamecheapHost, bool, error) {
	sld, tld := SplitDomain(domainName)
	if sld == "" || tld == "" {
		return nil, false, fmt.Errorf("invalid domain name: cannot determine SLD and TLD for %s", domainName)
	}

	params := url.Values{}
	params.Set("SLD", sld)
	params.Set("TLD", tld)

	resp, err := c.executeCommand(ctx, "namecheap.domains.dns.getHosts", params)
	if err != nil {
		return nil, false, err
	}

	if resp.CommandResponse.DomainDNSGetHostsResult == nil {
		return []NamecheapHost{}, false, nil
	}

	result := resp.CommandResponse.DomainDNSGetHostsResult
	return result.Hosts, result.IsUsingOurDNS, nil
}

// SetDNSHosts pushes host records to Namecheap DNS.
func (c *NamecheapClient) SetDNSHosts(ctx context.Context, domainName string, records []DNSRecord) error {
	sld, tld := SplitDomain(domainName)
	if sld == "" || tld == "" {
		return fmt.Errorf("invalid domain name for SetDNSHosts: %s", domainName)
	}

	params := url.Values{}
	params.Set("SLD", sld)
	params.Set("TLD", tld)

	if len(records) == 0 {
		params.Set("HostName1", "@")
		params.Set("RecordType1", "URL")
		params.Set("Address1", "http://parkingpage.namecheap.com")
		params.Set("TTL1", "1800")
	} else {
		for i, r := range records {
			idx := strconv.Itoa(i + 1)
			hostName := r.HostName
			if hostName == "" {
				hostName = "@"
			}
		recType := strings.ToUpper(r.RecordType)
		// Namecheap maps standard types
		if recType == "SPF" {
			recType = "TXT"
		}

		params.Set("HostName"+idx, hostName)
		params.Set("RecordType"+idx, recType)
		params.Set("Address"+idx, r.RecordValue)
		if r.MXPriority != nil {
			params.Set("MXPref"+idx, strconv.Itoa(*r.MXPriority))
		} else {
			params.Set("MXPref"+idx, "10")
		}
		ttl := r.TTL
		if ttl <= 0 {
			ttl = 1800
		}
		params.Set("TTL"+idx, strconv.Itoa(ttl))
		}
	}

	resp, err := c.executeCommand(ctx, "namecheap.domains.dns.setHosts", params)
	if err != nil {
		return err
	}

	if resp.CommandResponse.DomainDNSSetHostsResult != nil && !resp.CommandResponse.DomainDNSSetHostsResult.IsSuccess {
		return errors.New("Namecheap setHosts returned IsSuccess=false")
	}

	return nil
}

// GetDomainList fetches the list of domains in the Namecheap account.
func (c *NamecheapClient) GetDomainList(ctx context.Context, page, pageSize int) ([]NamecheapDomainItem, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize < 10 || pageSize > 100 {
		pageSize = 100
	}

	params := url.Values{}
	params.Set("Page", strconv.Itoa(page))
	params.Set("PageSize", strconv.Itoa(pageSize))
	params.Set("SortBy", "NAME")

	resp, err := c.executeCommand(ctx, "namecheap.domains.getList", params)
	if err != nil {
		return nil, err
	}

	if resp.CommandResponse.DomainGetListResult == nil {
		return []NamecheapDomainItem{}, nil
	}

	return resp.CommandResponse.DomainGetListResult.Domains, nil
}

// TestConnection verifies that the Namecheap API credentials and IP whitelist work.
func (c *NamecheapClient) TestConnection(ctx context.Context) (*TestConnectionResult, error) {
	start := time.Now()
	// Test using getList with PageSize=10 (Namecheap minimum allowed pageSize is 10)
	params := url.Values{}
	params.Set("Page", "1")
	params.Set("PageSize", "10")

	_, err := c.executeCommand(ctx, "namecheap.domains.getList", params)
	latency := time.Since(start)

	if err != nil {
		return &TestConnectionResult{
			Success: false,
			Message: fmt.Sprintf("Namecheap API authentication failed: %s", err.Error()),
			Latency: fmt.Sprintf("%dms", latency.Milliseconds()),
		}, nil
	}

	return &TestConnectionResult{
		Success: true,
		Message: fmt.Sprintf("Authenticated with Namecheap (%s) — IP %s authorized", c.Environment, c.getClientIP()),
		Latency: fmt.Sprintf("%dms", latency.Milliseconds()),
	}, nil
}
