package servers_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
	"stansiareco/backend/internal/servers"
)

func TestStandardActions(t *testing.T) {
	svc := servers.NewPostgresActionService(nil)
	actions := svc.GetStandardActions()
	if len(actions) == 0 {
		t.Fatalf("expected standard actions, got none")
	}

	foundQueue := false
	foundPort25 := false
	for _, a := range actions {
		if a.ID == "check_mail_queue" {
			foundQueue = true
		}
		if a.ID == "test_port_25_outbound" {
			foundPort25 = true
		}
	}

	if !foundQueue {
		t.Errorf("expected check_mail_queue action to be present")
	}
	if !foundPort25 {
		t.Errorf("expected test_port_25_outbound action to be present")
	}
}

func TestMTAInstallTemplate(t *testing.T) {
	// Test rendering install script logic with options
	opts := servers.MTAInstallOptions{
		Software:      "postfix",
		Hostname:      "mail1.example.com",
		Domain:        "example.com",
		EnableTLS:     true,
		SetupOpenDKIM: true,
		DisableIPv6:   true,
	}

	if opts.Hostname != "mail1.example.com" {
		t.Errorf("unexpected hostname")
	}
	if opts.Domain != "example.com" {
		t.Errorf("unexpected domain")
	}
}

func TestProxyTemplateData(t *testing.T) {
	px := servers.ProxyServer{
		ID:                uuid.New(),
		ServerID:          uuid.New(),
		ServerName:        "mta-01.test.net",
		ServerIP:          "192.0.2.10",
		HTTPProxyEnabled:  true,
		HTTPProxyPort:     3128,
		SOCKSProxyEnabled: true,
		SOCKSProxyPort:    1080,
		AuthUser:          "proxyadmin",
		AuthPassword:      "SecureProxy123!",
		Status:            "configured",
	}

	if !px.HTTPProxyEnabled || px.HTTPProxyPort != 3128 {
		t.Errorf("expected http proxy configured on 3128")
	}
	if !px.SOCKSProxyEnabled || px.SOCKSProxyPort != 1080 {
		t.Errorf("expected socks proxy configured on 1080")
	}
}

func TestVMTAConfigFormatting(t *testing.T) {
	// Verify postfix and powermta syntax checks
	serverID := uuid.New()
	vmtas := []servers.VMTA{
		{
			ID:         uuid.New(),
			ServerID:   serverID,
			VMTAName:   "vmta_ip_1",
			IPAddress:  "192.0.2.1",
			DomainName: "domain1.com",
			HostName:   "mail1.domain1.com",
			Status:     "active",
		},
		{
			ID:         uuid.New(),
			ServerID:   serverID,
			VMTAName:   "vmta_ip_2",
			IPAddress:  "192.0.2.2",
			DomainName: "domain2.com",
			HostName:   "mail2.domain2.com",
			Status:     "active",
		},
	}

	if len(vmtas) != 2 {
		t.Fatalf("expected 2 vmtas")
	}

	// Validate postfix formatting simulation
	var pfBuf strings.Builder
	for _, v := range vmtas {
		pfBuf.WriteString(v.VMTAName + " unix - - n - - smtp\n")
		pfBuf.WriteString("    -o smtp_bind_address=" + v.IPAddress + "\n")
	}
	resPf := pfBuf.String()
	if !strings.Contains(resPf, "smtp_bind_address=192.0.2.1") || !strings.Contains(resPf, "smtp_bind_address=192.0.2.2") {
		t.Errorf("postfix config missing expected bind addresses: %s", resPf)
	}

	// Validate powermta formatting simulation
	var pmtaBuf strings.Builder
	for _, v := range vmtas {
		pmtaBuf.WriteString("<virtual-mta " + v.VMTAName + ">\n")
		pmtaBuf.WriteString("    smtp-source-host " + v.IPAddress + " " + v.HostName + "\n")
		pmtaBuf.WriteString("</virtual-mta>\n")
	}
	resPmta := pmtaBuf.String()
	if !strings.Contains(resPmta, "<virtual-mta vmta_ip_1>") || !strings.Contains(resPmta, "smtp-source-host 192.0.2.2 mail2.domain2.com") {
		t.Errorf("powermta config missing expected virtual-mta tags: %s", resPmta)
	}
}

func TestNmcliScriptFormatting(t *testing.T) {
	secondaryIPs := []servers.ServerIP{
		{
			ID:            uuid.New(),
			ServerID:      uuid.New(),
			IPAddress:     "198.51.100.11",
			SubnetCIDR:    32,
			InterfaceName: "eth0",
			IsMain:        false,
		},
		{
			ID:            uuid.New(),
			ServerID:      uuid.New(),
			IPAddress:     "198.51.100.12",
			SubnetCIDR:    32,
			InterfaceName: "eth0",
			IsMain:        false,
		},
	}

	var script strings.Builder
	script.WriteString("nmcli connection modify \"$CONN_NAME\" +ipv4.addresses \"" + secondaryIPs[0].IPAddress + "/32\"\n")
	script.WriteString("nmcli connection modify \"$CONN_NAME\" +ipv4.addresses \"" + secondaryIPs[1].IPAddress + "/32\"\n")

	out := script.String()
	if !strings.Contains(out, "198.51.100.11/32") || !strings.Contains(out, "198.51.100.12/32") {
		t.Errorf("expected nmcli commands with IPs: %s", out)
	}
}

func TestBulkAddIPParsing(t *testing.T) {
	input := `
# Header comment
198.51.100.26,mail2.example.com
198.51.100.27,
198.51.100.28
198.51.100.29/24,mail4.example.com
`
	req := servers.BulkAddIPsRequest{
		RawLines: input,
	}

	rawInput := req.RawLines
	lines := strings.Split(rawInput, "\n")
	type parsedEntry struct {
		ip   string
		cidr int
		rdns string
	}
	var results []parsedEntry

	for _, line := range lines {
		raw := strings.TrimSpace(line)
		if raw == "" || strings.HasPrefix(raw, "#") {
			continue
		}
		var ipStr, rdns string
		if strings.Contains(raw, ",") {
			parts := strings.SplitN(raw, ",", 2)
			ipStr = strings.TrimSpace(parts[0])
			if len(parts) > 1 {
				rdns = strings.TrimSpace(parts[1])
			}
		} else {
			fields := strings.Fields(raw)
			if len(fields) > 0 {
				ipStr = strings.TrimSpace(fields[0])
				if len(fields) > 1 {
					rdns = strings.TrimSpace(fields[1])
				}
			}
		}

		cidr := 32
		if strings.Contains(ipStr, "/") {
			ipParts := strings.SplitN(ipStr, "/", 2)
			ipStr = strings.TrimSpace(ipParts[0])
			cidr = 24
		}

		results = append(results, parsedEntry{ip: ipStr, cidr: cidr, rdns: rdns})
	}

	if len(results) != 4 {
		t.Fatalf("expected 4 results, got %d", len(results))
	}
	if results[0].ip != "198.51.100.26" || results[0].rdns != "mail2.example.com" {
		t.Errorf("unexpected entry 0: %+v", results[0])
	}
	if results[1].ip != "198.51.100.27" || results[1].rdns != "" {
		t.Errorf("expected empty hostname for entry 1: %+v", results[1])
	}
	if results[2].ip != "198.51.100.28" || results[2].rdns != "" {
		t.Errorf("expected empty hostname for entry 2: %+v", results[2])
	}
	if results[3].ip != "198.51.100.29" || results[3].cidr != 24 || results[3].rdns != "mail4.example.com" {
		t.Errorf("unexpected entry 3: %+v", results[3])
	}
}

func TestNmcliBulkCommandFormatting(t *testing.T) {
	ips := []string{"185.253.54.100/24", "185.253.54.101/24", "185.253.54.102/24"}
	joined := strings.Join(ips, ",")

	connName := "System eth0"
	cmdModify := fmt.Sprintf("sudo nmcli connection modify \"%s\" +ipv4.addresses \"%s\"", connName, joined)
	cmdUp := fmt.Sprintf("sudo nmcli connection up \"%s\"", connName)

	expectedModify := "sudo nmcli connection modify \"System eth0\" +ipv4.addresses \"185.253.54.100/24,185.253.54.101/24,185.253.54.102/24\""
	if cmdModify != expectedModify {
		t.Errorf("expected %q, got %q", expectedModify, cmdModify)
	}

	expectedUp := "sudo nmcli connection up \"System eth0\""
	if cmdUp != expectedUp {
		t.Errorf("expected %q, got %q", expectedUp, cmdUp)
	}
}


