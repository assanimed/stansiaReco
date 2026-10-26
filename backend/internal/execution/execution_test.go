package execution

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestNormalizeSlug(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"  Check Port 25 & Postfix_Queue! ", "check-port-25-postfix-queue"},
		{"initCentos7Alma8", "initcentos7alma8"},
		{"My Script #1 (v2.0)", "my-script-1-v2-0"},
		{"---multiple---hyphens---", "multiple-hyphens"},
	}

	for _, tc := range tests {
		got := normalizeSlug(tc.input)
		if got != tc.expected {
			t.Errorf("normalizeSlug(%q) = %q, expected %q", tc.input, got, tc.expected)
		}
	}
}

func TestLocalTerminalSessionLifecycle(t *testing.T) {
	svc := NewPostgresExecutionService(nil, nil)

	info, err := svc.CreateTerminalSession(context.Background(), CreateTerminalSessionRequest{
		IsLocal: true,
		Cols:    100,
		Rows:    30,
	}, uuid.New())
	if err != nil {
		t.Fatalf("failed to create local terminal session: %v", err)
	}

	if info.SessionID == "" || !info.IsLocal {
		t.Fatalf("unexpected session info: %+v", info)
	}

	// Read initial welcome banner
	chunk, err := svc.ReadTerminalOutput(info.SessionID, 0)
	if err != nil {
		t.Fatalf("failed to read initial terminal output: %v", err)
	}
	if !strings.Contains(chunk.Data, "StansiaReco Live Interactive TTY") {
		t.Fatalf("expected welcome banner, got %q", chunk.Data)
	}

	// Write a command and verify output
	if err := svc.WriteTerminalInput(info.SessionID, "echo HELLO_TTY_TEST"); err != nil {
		t.Fatalf("failed to write terminal input: %v", err)
	}

	chunk2, err := svc.ReadTerminalOutput(info.SessionID, chunk.NextOffset)
	if err != nil {
		t.Fatalf("failed to read subsequent output: %v", err)
	}
	if !strings.Contains(chunk2.Data, "HELLO_TTY_TEST") {
		t.Fatalf("expected HELLO_TTY_TEST in output, got %q", chunk2.Data)
	}

	// Resize
	if err := svc.ResizeTerminal(info.SessionID, 140, 40); err != nil {
		t.Fatalf("failed to resize terminal: %v", err)
	}

	// Close
	if err := svc.CloseTerminalSession(info.SessionID); err != nil {
		t.Fatalf("failed to close terminal session: %v", err)
	}
}

func TestPrepareExecutionScript(t *testing.T) {
	rawScript := "#!/usr/bin/env bash\r\nset -e\r\necho \"hello world\"\r\n"
	prepared := prepareExecutionScript("script", rawScript)

	if strings.Contains(prepared, "\r") {
		t.Fatalf("expected all carriage returns to be removed, got: %q", prepared)
	}

	if strings.Contains(prepared, "#!/usr/bin/env bash") {
		t.Fatalf("expected shebang line to be stripped, got: %q", prepared)
	}

	if !strings.Contains(prepared, "export DEBIAN_FRONTEND=noninteractive") {
		t.Fatalf("expected noninteractive export, got: %q", prepared)
	}

	if !strings.Contains(prepared, "echo \"hello world\"") {
		t.Fatalf("expected script body preserved, got: %q", prepared)
	}
}

func TestStreamWriter(t *testing.T) {
	var buf strings.Builder
	var receivedChunks []string

	w := &streamWriter{
		buf:        new(bytes.Buffer),
		jobID:      uuid.New(),
		serverName: "Test Node",
		streamName: "stdout",
		callback: func(ev StreamLogEvent) {
			receivedChunks = append(receivedChunks, ev.Chunk)
		},
	}

	testData := []byte("Line 1 from process\nLine 2 from process\n")
	n, err := w.Write(testData)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != len(testData) {
		t.Fatalf("expected %d bytes written, got %d", len(testData), n)
	}

	if len(receivedChunks) != 1 || receivedChunks[0] != string(testData) {
		t.Fatalf("expected chunk %q, got %+v", string(testData), receivedChunks)
	}

	if w.buf.String() != string(testData) {
		t.Fatalf("expected buffer %q, got %q", string(testData), w.buf.String())
	}
	_ = buf
}

func TestIsUbuntu2204OrHigher(t *testing.T) {
	tests := []struct {
		osID      string
		versionID string
		want      bool
	}{
		{"ubuntu", "22.04", true},
		{"ubuntu", "22.10", true},
		{"ubuntu", "24.04", true},
		{"\"ubuntu\"", "\"24.04\"", true},
		{"ubuntu", "20.04", false},
		{"ubuntu", "18.04", false},
		{"debian", "12", false},
		{"almalinux", "9.3", false},
	}

	for _, tc := range tests {
		got := IsUbuntu2204OrHigher(tc.osID, tc.versionID)
		if got != tc.want {
			t.Errorf("IsUbuntu2204OrHigher(%q, %q) = %v, want %v", tc.osID, tc.versionID, got, tc.want)
		}
	}
}

func TestParseAmavisdShowKeys(t *testing.T) {
	sampleOutput := `; key#1 2048 bits, i=dkim, d=example.com, /var/lib/dkim/example.com.pem
dkim._domainkey.example.com.	3600 TXT (
  "v=DKIM1; p="
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv3mTestKeyPart1"
  "Part2OfTheKey9876543210ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  "FinalPartIDAQAB")`

	sel, host, val, err := ParseAmavisdShowKeys(sampleOutput, "example.com")
	if err != nil {
		t.Fatalf("ParseAmavisdShowKeys returned unexpected error: %v", err)
	}
	if sel != "dkim" {
		t.Errorf("expected selector 'dkim', got %q", sel)
	}
	if host != "dkim._domainkey" {
		t.Errorf("expected host 'dkim._domainkey', got %q", host)
	}
	expectedVal := "v=DKIM1; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv3mTestKeyPart1Part2OfTheKey9876543210ABCDEFGHIJKLMNOPQRSTUVWXYZFinalPartIDAQAB"
	if val != expectedVal {
		t.Errorf("expected value %q, got %q", expectedVal, val)
	}
}


