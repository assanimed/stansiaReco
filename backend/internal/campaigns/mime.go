package campaigns

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"mime"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
)

// RenderMergeTags substitutes {{merge_tags}} with recipient-specific values
func RenderMergeTags(content string, contact *ContactData, trackingDomain string) string {
	if content == "" {
		return ""
	}

	result := content

	// Standard tags
	replacements := map[string]string{
		"{{first_name}}":   contact.FirstName,
		"{{firstname}}":    contact.FirstName,
		"{{First_Name}}":   contact.FirstName,
		"{{last_name}}":    contact.LastName,
		"{{lastname}}":     contact.LastName,
		"{{Last_Name}}":    contact.LastName,
		"{{email}}":        contact.Email,
		"{{Email}}":        contact.Email,
		"{{city}}":         contact.City,
		"{{City}}":         contact.City,
		"{{region}}":       contact.Region,
		"{{country}}":      contact.Country,
		"{{country_code}}": contact.CountryCode,
		"{{date}}":         time.Now().Format("January 2, 2006"),
		"{{year}}":         fmt.Sprintf("%d", time.Now().Year()),
	}

	for tag, val := range replacements {
		result = strings.ReplaceAll(result, tag, val)
	}

	// Custom tags if present
	for k, v := range contact.CustomTags {
		result = strings.ReplaceAll(result, fmt.Sprintf("{{%s}}", k), v)
	}

	// Unsubscribe links
	unsubURL := fmt.Sprintf("https://%s/t/u/%s?email=%s", trackingDomain, contact.ID.String(), contact.Email)
	result = strings.ReplaceAll(result, "{{unsubscribe_url}}", unsubURL)
	result = strings.ReplaceAll(result, "{{unsubscribe_link}}", unsubURL)

	return result
}

// BuildMIMEMessage generates a fully RFC 5322 & RFC 2045 compliant multi-part email
func BuildMIMEMessage(campaign *Campaign, contact *ContactData, trackingDomain string) ([]byte, string, error) {
	if trackingDomain == "" {
		trackingDomain = "track.stansiareco.local"
	}

	// Extract domain from FromEmail
	fromParts := strings.Split(campaign.FromEmail, "@")
	fromDomain := "stansiareco.local"
	if len(fromParts) == 2 && fromParts[1] != "" {
		fromDomain = fromParts[1]
	}

	// Generate unique Message-ID
	msgUUID := uuid.New().String()
	messageID := fmt.Sprintf("<%s@%s>", msgUUID, fromDomain)

	// Render personalized subject
	renderedSubject := RenderMergeTags(campaign.Subject, contact, trackingDomain)
	encodedSubject := mime.QEncoding.Encode("utf-8", renderedSubject)

	// Render HTML & Plain text
	renderedHTML := RenderMergeTags(campaign.HTMLContent, contact, trackingDomain)
	renderedPlain := RenderMergeTags(campaign.PlainContent, contact, trackingDomain)

	// If plaintext is empty but HTML exists, generate basic plaintext fallback
	if renderedPlain == "" && renderedHTML != "" {
		renderedPlain = stripBasicHTML(renderedHTML)
	}

	// Format From and To addresses
	fromAddr := mail.Address{
		Name:    campaign.FromName,
		Address: campaign.FromEmail,
	}

	toName := strings.TrimSpace(contact.FirstName + " " + contact.LastName)
	toAddr := mail.Address{
		Name:    toName,
		Address: contact.Email,
	}

	// Generate boundary identifier
	randBytes := make([]byte, 12)
	_, _ = rand.Read(randBytes)
	boundary := "=_part_" + hex.EncodeToString(randBytes)

	var buf bytes.Buffer

	// RFC 5322 Standard Headers
	fmt.Fprintf(&buf, "Message-ID: %s\r\n", messageID)
	fmt.Fprintf(&buf, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	fmt.Fprintf(&buf, "From: %s\r\n", fromAddr.String())
	fmt.Fprintf(&buf, "To: %s\r\n", toAddr.String())
	fmt.Fprintf(&buf, "Subject: %s\r\n", encodedSubject)

	if campaign.ReplyTo != "" {
		fmt.Fprintf(&buf, "Reply-To: %s\r\n", campaign.ReplyTo)
	}

	// Precedence & Mailer headers
	fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&buf, "Precedence: bulk\r\n")
	fmt.Fprintf(&buf, "X-Mailer: StansiaReco Dispatcher v1.0\r\n")
	fmt.Fprintf(&buf, "X-Campaign-ID: %s\r\n", campaign.ID.String())
	fmt.Fprintf(&buf, "X-Contact-ID: %s\r\n", contact.ID.String())

	if campaign.CustomVMTA != "" {
		fmt.Fprintf(&buf, "X-Virtual-MTA: %s\r\n", campaign.CustomVMTA)
	}

	// RFC 8058 compliant 1-Click List-Unsubscribe headers
	if campaign.ListUnsubscribeHeader {
		unsubURL := fmt.Sprintf("https://%s/t/u/%s?email=%s", trackingDomain, contact.ID.String(), contact.Email)
		mailtoUnsub := fmt.Sprintf("mailto:unsubscribe@%s?subject=unsub-%s", fromDomain, contact.ID.String())
		fmt.Fprintf(&buf, "List-Unsubscribe: <%s>, <%s>\r\n", unsubURL, mailtoUnsub)
		fmt.Fprintf(&buf, "List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n")
	}

	// Custom user headers
	for k, v := range campaign.CustomHeaders {
		cleanedKey := strings.TrimSpace(k)
		cleanedVal := strings.TrimSpace(v)
		if cleanedKey != "" && cleanedVal != "" {
			fmt.Fprintf(&buf, "%s: %s\r\n", cleanedKey, cleanedVal)
		}
	}

	// Content-Type multipart/alternative
	fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=\"%s\"\r\n", boundary)
	fmt.Fprintf(&buf, "\r\n") // End of top-level headers

	// Part 1: text/plain
	fmt.Fprintf(&buf, "--%s\r\n", boundary)
	fmt.Fprintf(&buf, "Content-Type: text/plain; charset=UTF-8\r\n")
	fmt.Fprintf(&buf, "Content-Transfer-Encoding: 8bit\r\n")
	fmt.Fprintf(&buf, "\r\n")
	buf.WriteString(renderedPlain)
	fmt.Fprintf(&buf, "\r\n\r\n")

	// Part 2: text/html
	fmt.Fprintf(&buf, "--%s\r\n", boundary)
	fmt.Fprintf(&buf, "Content-Type: text/html; charset=UTF-8\r\n")
	fmt.Fprintf(&buf, "Content-Transfer-Encoding: 8bit\r\n")
	fmt.Fprintf(&buf, "\r\n")
	buf.WriteString(renderedHTML)
	fmt.Fprintf(&buf, "\r\n\r\n")

	// End boundary
	fmt.Fprintf(&buf, "--%s--\r\n", boundary)

	return buf.Bytes(), messageID, nil
}

func stripBasicHTML(html string) string {
	var out strings.Builder
	inTag := false
	for _, r := range html {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			out.WriteRune(r)
		}
	}
	return strings.TrimSpace(out.String())
}
