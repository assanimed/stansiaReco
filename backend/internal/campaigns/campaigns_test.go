package campaigns

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestRenderMergeTags(t *testing.T) {
	contact := &ContactData{
		ID:          uuid.New(),
		Email:       "sarah.connor@cyberdyne.org",
		FirstName:   "Sarah",
		LastName:    "Connor",
		City:        "Los Angeles",
		Country:     "United States",
		CountryCode: "US",
		CustomTags: map[string]string{
			"discount_code": "VIP50",
		},
	}

	template := "Hello {{first_name}} {{last_name}}, your email is {{email}} in {{city}}, {{country}}. Use code {{discount_code}}! Unsub: {{unsubscribe_url}}"
	rendered := RenderMergeTags(template, contact, "track.stansiareco.local")

	if !strings.Contains(rendered, "Hello Sarah Connor") {
		t.Errorf("Expected 'Hello Sarah Connor', got %s", rendered)
	}
	if !strings.Contains(rendered, "your email is sarah.connor@cyberdyne.org in Los Angeles, United States") {
		t.Errorf("Expected contact details replaced, got %s", rendered)
	}
	if !strings.Contains(rendered, "Use code VIP50!") {
		t.Errorf("Expected custom tag VIP50 replaced, got %s", rendered)
	}
	if !strings.Contains(rendered, "https://track.stansiareco.local/t/u/") {
		t.Errorf("Expected unsubscribe URL inserted, got %s", rendered)
	}
}

func TestBuildMIMEMessage(t *testing.T) {
	campaign := &Campaign{
		ID:                    uuid.New(),
		Subject:               "Exclusive Offer for {{first_name}}",
		FromName:              "Stansia Delivery",
		FromEmail:             "newsletter@deals.stansiareco.com",
		ReplyTo:               "support@deals.stansiareco.com",
		HTMLContent:           "<h1>Welcome {{first_name}}</h1><p>Check our deals at <a href=\"https://example.com\">Deals</a></p>",
		PlainContent:          "Welcome {{first_name}}! Check our deals at https://example.com",
		ListUnsubscribeHeader: true,
		CustomVMTA:            "vmta_pool_1_ip2",
		CustomHeaders: map[string]string{
			"X-Campaign-Tier": "Enterprise",
		},
	}

	contact := &ContactData{
		ID:        uuid.New(),
		Email:     "john.wick@continental.com",
		FirstName: "John",
		LastName:  "Wick",
	}

	rawMIME, msgID, err := BuildMIMEMessage(campaign, contact, "track.stansiareco.com")
	if err != nil {
		t.Fatalf("BuildMIMEMessage returned error: %v", err)
	}

	if msgID == "" || !strings.HasPrefix(msgID, "<") || !strings.HasSuffix(msgID, ">") {
		t.Errorf("Invalid Message-ID: %s", msgID)
	}

	mimeStr := string(rawMIME)

	expectedHeaders := []string{
		"Message-ID: " + msgID,
		"From: \"Stansia Delivery\" <newsletter@deals.stansiareco.com>",
		"To: \"John Wick\" <john.wick@continental.com>",
		"Reply-To: support@deals.stansiareco.com",
		"MIME-Version: 1.0",
		"X-Virtual-MTA: vmta_pool_1_ip2",
		"X-Campaign-Tier: Enterprise",
		"List-Unsubscribe: <https://track.stansiareco.com/t/u/",
		"List-Unsubscribe-Post: List-Unsubscribe=One-Click",
		"Content-Type: multipart/alternative; boundary=",
		"Content-Type: text/plain; charset=UTF-8",
		"Welcome John! Check our deals at https://example.com",
		"Content-Type: text/html; charset=UTF-8",
		"<h1>Welcome John</h1>",
	}

	for _, expected := range expectedHeaders {
		if !strings.Contains(mimeStr, expected) {
			t.Errorf("Expected MIME message to contain '%s', but was missing.\nMIME Dump:\n%s", expected, mimeStr)
		}
	}
}

func TestFileDeliverySpooler(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "stansia_spool_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	spooler := NewFileDeliverySpooler(tempDir)

	campaignID := uuid.New()
	campaign := &Campaign{
		ID: campaignID,
	}

	contact1 := &ContactData{
		ID:        uuid.New(),
		Email:     "test1@example.com",
		EmailMD5:  "md5_1",
		FirstName: "User1",
	}

	contact2 := &ContactData{
		ID:        uuid.New(),
		Email:     "test2@example.com",
		EmailMD5:  "md5_2",
		FirstName: "User2",
	}

	ctx := context.Background()

	// Spool 2 messages
	path1, err := spooler.Spool(ctx, campaign, contact1, []byte("From: sender@domain.com\r\nSubject: Test 1\r\n\r\nBody 1"))
	if err != nil {
		t.Fatalf("Failed to spool contact1: %v", err)
	}
	if !strings.HasSuffix(path1, ".eml") {
		t.Errorf("Expected .eml suffix, got %s", path1)
	}

	_, err = spooler.Spool(ctx, campaign, contact2, []byte("From: sender@domain.com\r\nSubject: Test 2\r\n\r\nBody 2"))
	if err != nil {
		t.Fatalf("Failed to spool contact2: %v", err)
	}

	// List spool files
	files, err := spooler.GetCampaignSpoolFiles(ctx, campaignID)
	if err != nil {
		t.Fatalf("GetCampaignSpoolFiles error: %v", err)
	}
	if len(files) != 2 {
		t.Errorf("Expected 2 spool files, got %d", len(files))
	}

	// Read content of file1
	content, err := spooler.ReadSpoolFile(ctx, campaignID, files[0].FileName)
	if err != nil {
		t.Fatalf("ReadSpoolFile error: %v", err)
	}
	if !strings.Contains(string(content), "From: sender@domain.com") {
		t.Errorf("Read content unexpected: %s", string(content))
	}

	// Archive spool to ZIP
	zipReader, size, err := spooler.ArchiveSpool(ctx, campaignID)
	if err != nil {
		t.Fatalf("ArchiveSpool error: %v", err)
	}
	defer zipReader.Close()
	if size <= 0 {
		t.Errorf("Expected non-zero zip size, got %d", size)
	}
}
