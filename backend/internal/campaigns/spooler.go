package campaigns

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/google/uuid"
)

var safeEmailRegex = regexp.MustCompile(`[^a-zA-Z0-9_\-\.]`)

// DeliverySpooler defines how generated emails are dispatched or persisted
type DeliverySpooler interface {
	Spool(ctx context.Context, campaign *Campaign, contact *ContactData, rawMIME []byte) (filePath string, err error)
	GetCampaignSpoolFiles(ctx context.Context, campaignID uuid.UUID) ([]SpoolFileInfo, error)
	ReadSpoolFile(ctx context.Context, campaignID uuid.UUID, fileName string) ([]byte, error)
	ArchiveSpool(ctx context.Context, campaignID uuid.UUID) (io.ReadCloser, int64, error)
}

// FileDeliverySpooler writes generated RFC 5322 .eml files to disk for inspection and future PMTA pickup
type FileDeliverySpooler struct {
	baseDir string
}

// NewFileDeliverySpooler constructs a local filesystem spooler
func NewFileDeliverySpooler(baseDir string) *FileDeliverySpooler {
	if baseDir == "" {
		baseDir = "./spool"
	}
	return &FileDeliverySpooler{baseDir: baseDir}
}

// Spool writes the raw MIME message to a campaign-scoped directory
func (s *FileDeliverySpooler) Spool(
	ctx context.Context,
	campaign *Campaign,
	contact *ContactData,
	rawMIME []byte,
) (string, error) {
	campaignDir := filepath.Join(s.baseDir, "campaigns", campaign.ID.String())
	if err := os.MkdirAll(campaignDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create campaign spool directory: %w", err)
	}

	cleanEmail := safeEmailRegex.ReplaceAllString(contact.Email, "_")
	fileName := fmt.Sprintf("%s_%s.eml", contact.ID.String(), cleanEmail)
	fullPath := filepath.Join(campaignDir, fileName)

	if err := os.WriteFile(fullPath, rawMIME, 0644); err != nil {
		return "", fmt.Errorf("failed to write spool file %s: %w", fullPath, err)
	}

	return fullPath, nil
}

// GetCampaignSpoolFiles retrieves a list of generated .eml files
func (s *FileDeliverySpooler) GetCampaignSpoolFiles(ctx context.Context, campaignID uuid.UUID) ([]SpoolFileInfo, error) {
	campaignDir := filepath.Join(s.baseDir, "campaigns", campaignID.String())
	entries, err := os.ReadDir(campaignDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []SpoolFileInfo{}, nil
		}
		return nil, fmt.Errorf("failed to read campaign spool directory: %w", err)
	}

	var results []SpoolFileInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".eml") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}

		// Parse recipient from filename "{uuid}_{recipient}.eml"
		parts := strings.SplitN(strings.TrimSuffix(entry.Name(), ".eml"), "_", 2)
		recipient := ""
		if len(parts) == 2 {
			recipient = parts[1]
		}

		results = append(results, SpoolFileInfo{
			FileName:    entry.Name(),
			FilePath:    filepath.Join(campaignDir, entry.Name()),
			SizeBytes:   info.Size(),
			Recipient:   recipient,
			GeneratedAt: info.ModTime(),
		})
	}

	// Sort descending by generation time
	sort.Slice(results, func(i, j int) bool {
		return results[i].GeneratedAt.After(results[j].GeneratedAt)
	})

	return results, nil
}

// ReadSpoolFile reads the full raw MIME content of a specific .eml file
func (s *FileDeliverySpooler) ReadSpoolFile(ctx context.Context, campaignID uuid.UUID, fileName string) ([]byte, error) {
	cleanName := filepath.Base(fileName)
	if !strings.HasSuffix(cleanName, ".eml") {
		return nil, fmt.Errorf("invalid spool file extension")
	}

	fullPath := filepath.Join(s.baseDir, "campaigns", campaignID.String(), cleanName)
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read spool file: %w", err)
	}

	return data, nil
}

// ArchiveSpool bundles all generated .eml files into an in-memory zip archive
func (s *FileDeliverySpooler) ArchiveSpool(ctx context.Context, campaignID uuid.UUID) (io.ReadCloser, int64, error) {
	campaignDir := filepath.Join(s.baseDir, "campaigns", campaignID.String())
	entries, err := os.ReadDir(campaignDir)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read campaign directory: %w", err)
	}

	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)

	count := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".eml") {
			continue
		}

		fileData, err := os.ReadFile(filepath.Join(campaignDir, entry.Name()))
		if err != nil {
			continue
		}

		w, err := zipWriter.Create(entry.Name())
		if err != nil {
			continue
		}
		if _, err := w.Write(fileData); err != nil {
			continue
		}
		count++
	}

	if err := zipWriter.Close(); err != nil {
		return nil, 0, fmt.Errorf("failed to close zip archive: %w", err)
	}

	return io.NopCloser(bytes.NewReader(buf.Bytes())), int64(buf.Len()), nil
}
