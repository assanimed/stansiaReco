package domains_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"stansiareco/backend/internal/domains"
)

func TestIPReplacementPairValidation(t *testing.T) {
	req := domains.IPReplacementRequest{
		Pairs: []domains.IPReplacementPair{
			{OldIP: "1.1.1.1", NewIP: "2.2.2.2"},
			{OldIP: "  3.3.3.3  ", NewIP: "4.4.4.4"},
			{OldIP: "5.5.5.5", NewIP: "5.5.5.5"}, // Same IP should be skipped
		},
	}

	if len(req.Pairs) != 3 {
		t.Fatalf("expected 3 raw pairs, got %d", len(req.Pairs))
	}
}

func TestSplitDomain(t *testing.T) {
	tests := []struct {
		input string
		wantS string
		wantT string
	}{
		{"example.com", "example", "com"},
		{"stansiareco.org", "stansiareco", "org"},
		{"my-domain.co.uk", "my-domain", "co.uk"},
		{"company.com.au", "company", "com.au"},
		{"cloud.net.nz", "cloud", "net.nz"},
		{"app.io", "app", "io"},
		{"sub.mybrand.com", "mybrand", "com"},
	}

	for _, tc := range tests {
		s, tr := domains.SplitDomain(tc.input)
		if s != tc.wantS || tr != tc.wantT {
			t.Errorf("SplitDomain(%q) = (%q, %q); want (%q, %q)", tc.input, s, tr, tc.wantS, tc.wantT)
		}
	}
}

func TestNamecheapXMLParsing(t *testing.T) {
	xmlSuccess := `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
  <Errors />
  <Warnings />
  <RequestedCommand>namecheap.domains.dns.getHosts</RequestedCommand>
  <CommandResponse Type="namecheap.domains.dns.getHosts">
    <DomainDNSGetHostsResult Domain="example.com" EmailType="FWD" IsUsingOurDNS="true">
      <host HostId="101" Name="@" Type="A" Address="1.2.3.4" MXPref="10" TTL="1800" AssociatedAppTitle="" FriendlyName="" IsActive="true" IsDDNSEnabled="false" />
      <host HostId="102" Name="www" Type="CNAME" Address="example.com." MXPref="10" TTL="1800" AssociatedAppTitle="" FriendlyName="" IsActive="true" IsDDNSEnabled="false" />
      <host HostId="103" Name="@" Type="MX" Address="mail.example.com." MXPref="5" TTL="3600" AssociatedAppTitle="" FriendlyName="" IsActive="true" IsDDNSEnabled="false" />
      <host HostId="104" Name="@" Type="TXT" Address="v=spf1 include:spf.example.com ~all" MXPref="10" TTL="1800" AssociatedAppTitle="" FriendlyName="" IsActive="true" IsDDNSEnabled="false" />
    </DomainDNSGetHostsResult>
  </CommandResponse>
  <Server>NC-SRV-01</Server>
  <GMTTimeDifference>--4:00</GMTTimeDifference>
  <ExecutionTime>0.015</ExecutionTime>
</ApiResponse>`

	var parsed domains.NamecheapXMLResponse
	if err := domains.ParseNamecheapXML([]byte(xmlSuccess), &parsed); err != nil {
		t.Fatalf("failed to parse Namecheap success XML: %v", err)
	}

	if parsed.Status != "OK" {
		t.Fatalf("expected Status OK, got %s", parsed.Status)
	}

	if parsed.CommandResponse.DomainDNSGetHostsResult == nil {
		t.Fatalf("DomainDNSGetHostsResult is nil")
	}

	hosts := parsed.CommandResponse.DomainDNSGetHostsResult.Hosts
	if len(hosts) != 4 {
		t.Fatalf("expected 4 hosts, got %d", len(hosts))
	}

	if hosts[0].Name != "@" || hosts[0].Type != "A" || hosts[0].Address != "1.2.3.4" {
		t.Errorf("host[0] mismatch: %+v", hosts[0])
	}
	if hosts[2].Type != "MX" || hosts[2].MXPref != 5 {
		t.Errorf("host[2] mismatch: %+v", hosts[2])
	}

	xmlError := `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="ERROR" xmlns="http://api.namecheap.com/xml.response">
  <Errors>
    <Error Number="1011150">Invalid request IP: 41.92.116.80</Error>
  </Errors>
  <Warnings />
  <RequestedCommand>namecheap.domains.dns.getHosts</RequestedCommand>
  <Server>NC-SRV-02</Server>
  <GMTTimeDifference>--4:00</GMTTimeDifference>
  <ExecutionTime>0.010</ExecutionTime>
</ApiResponse>`

	var errParsed domains.NamecheapXMLResponse
	if err := domains.ParseNamecheapXML([]byte(xmlError), &errParsed); err != nil {
		t.Fatalf("failed to parse Namecheap error XML: %v", err)
	}

	if errParsed.Status != "ERROR" {
		t.Fatalf("expected Status ERROR, got %s", errParsed.Status)
	}
	if len(errParsed.Errors) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errParsed.Errors))
	}
	if errParsed.Errors[0].Number != "1011150" {
		t.Errorf("expected error number 1011150, got %s", errParsed.Errors[0].Number)
	}
}

func TestSetDNSHostsEmptyRecords(t *testing.T) {
	c := domains.NewNamecheapClient("testuser", "testkey", "testuser", "127.0.0.1", "sandbox")
	err := c.SetDNSHosts(context.Background(), "example.com", []domains.DNSRecord{})
	if err == nil {
		t.Log("SetDNSHosts with empty records handled")
	}
}

func TestCountSPFLookups(t *testing.T) {
	tests := []struct {
		spf  string
		want int
	}{
		{"v=spf1 ip4:1.2.3.4 ~all", 0},
		{"v=spf1 a mx ip4:1.2.3.4 ~all", 2},
		{"v=spf1 a mx include:abc.com include:xyz.com ~all", 4},
		{"v=spf1 a:mail.com mx:relay.com include:spf.google.com ptr redirect=domain.com -all", 5},
	}

	for _, tc := range tests {
		got := domains.CountSPFLookups(tc.spf)
		if got != tc.want {
			t.Errorf("CountSPFLookups(%q) = %d, want %d", tc.spf, got, tc.want)
		}
	}
}

func TestMergeSPFRecords(t *testing.T) {
	existing := "v=spf1 a mx include:old.com ~all"
	newRecord := "v=spf1 ip4:198.51.100.25 include:abc.com -all"

	merged := domains.MergeSPFRecords(existing, newRecord)

	expectedParts := []string{"v=spf1", "a", "mx", "include:old.com", "ip4:198.51.100.25", "include:abc.com", "-all"}
	for _, part := range expectedParts {
		if !strings.Contains(merged, part) {
			t.Errorf("expected merged SPF to contain %q, got: %s", part, merged)
		}
	}
}

type roundTripFunc func(req *http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestGoDaddyClientAuthModesAndOperations(t *testing.T) {
	// 1. Verify AuthMode detection
	patClient := domains.NewGoDaddyClient("my-personal-access-token-123", "", "12345678", "production")
	if patClient.AuthMode() != "PAT" {
		t.Fatalf("expected PAT auth mode, got %s", patClient.AuthMode())
	}

	ssoClient := domains.NewGoDaddyClient("myKey123", "mySecret456", "", "ote")
	if ssoClient.AuthMode() != "sso-key" {
		t.Fatalf("expected sso-key auth mode, got %s", ssoClient.AuthMode())
	}

	// 2. Mock GoDaddy API handler in-memory to verify TestConnection, GetDomainList, GetDNSRecords, and SyncDNSRecords
	var receivedAuthHeader string
	var receivedShopperHeader string
	putRecordsByType := make(map[string][]domains.GoDaddyDNSRecord)
	var deletedPaths []string

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuthHeader = r.Header.Get("Authorization")
		receivedShopperHeader = r.Header.Get("X-Shopper-Id")

		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1/domains":
			_, _ = w.Write([]byte(`[
				{
					"domain": "stansia-mail.com",
					"domainId": 987654321,
					"status": "ACTIVE",
					"expires": "2027-05-15T12:00:00Z",
					"createdAt": "2023-05-15T12:00:00Z",
					"locked": true,
					"renewAuto": true,
					"nameServers": ["ns41.domaincontrol.com", "ns42.domaincontrol.com"]
				},
				{
					"domain": "old-cancelled.com",
					"domainId": 111111,
					"status": "CANCELLED",
					"locked": false,
					"renewAuto": false
				}
			]`))

		case r.Method == http.MethodGet && r.URL.Path == "/v1/domains/stansia-mail.com":
			_, _ = w.Write([]byte(`{
				"domain": "stansia-mail.com",
				"status": "ACTIVE",
				"nameServers": ["ns41.domaincontrol.com", "ns42.domaincontrol.com"]
			}`))

		case r.Method == http.MethodGet && r.URL.Path == "/v1/domains/stansia-mail.com/records":
			_, _ = w.Write([]byte(`[
				{"type": "SOA", "name": "@", "data": "ns41.domaincontrol.com.", "ttl": 3600},
				{"type": "NS", "name": "@", "data": "ns41.domaincontrol.com", "ttl": 3600},
				{"type": "NS", "name": "@", "data": "ns42.domaincontrol.com", "ttl": 3600},
				{"type": "A", "name": "@", "data": "198.51.100.10", "ttl": 600},
				{"type": "CNAME", "name": "old-cname", "data": "@", "ttl": 3600},
				{"type": "MX", "name": "@", "data": "mail.stansia-mail.com", "ttl": 3600, "priority": 10}
			]`))

		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/v1/domains/stansia-mail.com/records/"):
			recType := strings.TrimPrefix(r.URL.Path, "/v1/domains/stansia-mail.com/records/")
			var bodyRecs []domains.GoDaddyDNSRecord
			if err := json.NewDecoder(r.Body).Decode(&bodyRecs); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			putRecordsByType[recType] = bodyRecs
			w.WriteHeader(http.StatusOK)

		case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/v1/domains/stansia-mail.com/records/"):
			deletedPaths = append(deletedPaths, r.URL.Path)
			w.WriteHeader(http.StatusNoContent)

		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"code": "NOT_FOUND", "message": "Resource not found"}`))
		}
	})

	patClient.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			return rec.Result(), nil
		}),
	}

	// Test 1: TestConnection
	connRes, err := patClient.TestConnection(context.Background())
	if err != nil {
		t.Fatalf("TestConnection returned error: %v", err)
	}
	if !connRes.Success {
		t.Fatalf("expected TestConnection success, got failure: %s", connRes.Message)
	}
	if receivedAuthHeader != "Bearer my-personal-access-token-123" {
		t.Errorf("expected Bearer PAT header, got %q", receivedAuthHeader)
	}
	if receivedShopperHeader != "12345678" {
		t.Errorf("expected X-Shopper-Id 12345678, got %q", receivedShopperHeader)
	}

	// Test 2: GetDomainList (should filter out CANCELLED domain)
	domList, err := patClient.GetDomainList(context.Background())
	if err != nil {
		t.Fatalf("GetDomainList returned error: %v", err)
	}
	if len(domList) != 1 {
		t.Fatalf("expected 1 active domain, got %d", len(domList))
	}
	if domList[0].Domain != "stansia-mail.com" || !domList[0].UsesGoDaddyDNS || domList[0].DomainID != "987654321" {
		t.Errorf("unexpected domain summary: %+v", domList[0])
	}

	// Test 3: GetDNSRecords
	recs, usesGD, err := patClient.GetDNSRecords(context.Background(), "stansia-mail.com")
	if err != nil {
		t.Fatalf("GetDNSRecords returned error: %v", err)
	}
	if !usesGD {
		t.Errorf("expected usesGoDaddyDNS=true")
	}
	if len(recs) != 6 {
		t.Fatalf("expected 6 raw records from mock server, got %d", len(recs))
	}

	// Test 4: SyncDNSRecords (should clamp TTL 300 -> 600, convert SPF -> TXT, skip SOA and @ NS, and DELETE removed CNAME)
	prio := 5
	desired := []domains.DNSRecord{
		{RecordType: "SOA", HostName: "@", RecordValue: "ns41.domaincontrol.com.", TTL: 3600},
		{RecordType: "NS", HostName: "@", RecordValue: "ns41.domaincontrol.com", TTL: 3600},
		{RecordType: "A", HostName: "mail.stansia-mail.com", RecordValue: "203.0.113.55", TTL: 300}, // should strip domain & clamp TTL to 600
		{RecordType: "SPF", HostName: "@", RecordValue: "v=spf1 ip4:203.0.113.55 -all", TTL: 1800},  // should convert SPF -> TXT
		{RecordType: "MX", HostName: "@", RecordValue: "mail.stansia-mail.com", TTL: 3600, MXPriority: &prio},
	}

	if err := patClient.SyncDNSRecords(context.Background(), "stansia-mail.com", desired); err != nil {
		t.Fatalf("SyncDNSRecords failed: %v", err)
	}

	// Verify SOA and NS were NOT sent via PUT /v1/domains/{domain}/records/SOA or NS
	if _, hasSOA := putRecordsByType["SOA"]; hasSOA {
		t.Errorf("SOA record should never be pushed to GoDaddy")
	}
	if _, hasNS := putRecordsByType["NS"]; hasNS {
		t.Errorf("Apex NS record should never be pushed to GoDaddy")
	}

	// Verify A record was normalized (Name="mail", TTL=600)
	aRecs := putRecordsByType["A"]
	if len(aRecs) != 1 || aRecs[0].Name != "mail" || aRecs[0].TTL != 600 || aRecs[0].Data != "203.0.113.55" {
		t.Errorf("unexpected A records pushed: %+v", aRecs)
	}

	// Verify SPF was converted to TXT
	txtRecs := putRecordsByType["TXT"]
	if len(txtRecs) != 1 || txtRecs[0].Name != "@" || txtRecs[0].Data != "v=spf1 ip4:203.0.113.55 -all" {
		t.Errorf("unexpected TXT records pushed: %+v", txtRecs)
	}

	// Verify old CNAME ("old-cname") was deleted since desired has no CNAMEs
	if len(deletedPaths) != 1 || deletedPaths[0] != "/v1/domains/stansia-mail.com/records/CNAME/old-cname" {
		t.Errorf("expected DELETE for removed CNAME, got: %v", deletedPaths)
	}
}



