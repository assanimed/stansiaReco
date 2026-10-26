package lists

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractLocalPart(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"abc@gmail.com", "abc"},
		{"john.doe@company.org", "john.doe"},
		{"user+tag@domain.com", "user+tag"},
		{"  spaced@domain.com  ", "spaced"},
		{"noatsign", "noatsign"},
		{"", ""},
		{"a@b.com", "a"},
	}

	for _, tt := range tests {
		got := ExtractLocalPart(tt.input)
		if got != tt.expected {
			t.Errorf("ExtractLocalPart(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}

func TestIsHeaderRow(t *testing.T) {
	tests := []struct {
		name     string
		record   []string
		expected bool
	}{
		{
			name:     "Single header 'email'",
			record:   []string{"email"},
			expected: true,
		},
		{
			name:     "Single header 'Email Address'",
			record:   []string{"Email Address"},
			expected: true,
		},
		{
			name:     "Multi-column headers",
			record:   []string{"First Name", "Last Name", "Email Address"},
			expected: true,
		},
		{
			name:     "Single data row with raw email",
			record:   []string{"abc@gmail.com"},
			expected: false,
		},
		{
			name:     "Data row with raw email and name",
			record:   []string{"John", "Doe", "john.doe@example.com"},
			expected: false,
		},
		{
			name:     "Empty record",
			record:   []string{},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsHeaderRow(tt.record)
			if got != tt.expected {
				t.Errorf("IsHeaderRow(%v) = %v; want %v", tt.record, got, tt.expected)
			}
		})
	}
}

func TestPreviewCSV_SingleColumnHeaderless(t *testing.T) {
	tmpDir := t.TempDir()
	csvPath := filepath.Join(tmpDir, "headerless.csv")

	content := "abc@gmail.com\nxyz@yahoo.com\njohn.doe@outlook.com\n"
	if err := os.WriteFile(csvPath, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write test CSV: %v", err)
	}

	preview, err := PreviewCSV(csvPath, 5)
	if err != nil {
		t.Fatalf("PreviewCSV failed: %v", err)
	}

	if len(preview.Headers) != 1 || preview.Headers[0] != "Email Address" {
		t.Errorf("Expected synthetic header ['Email Address'], got %v", preview.Headers)
	}

	if preview.TotalRowsEst != 3 {
		t.Errorf("Expected total count 3, got %d", preview.TotalRowsEst)
	}

	if len(preview.SampleRows) != 3 {
		t.Errorf("Expected 3 sample rows including first line, got %d", len(preview.SampleRows))
	} else if preview.SampleRows[0][0] != "abc@gmail.com" {
		t.Errorf("Expected first sample row to be 'abc@gmail.com', got %v", preview.SampleRows[0])
	}

	if emailIdx, ok := preview.SuggestedMaps["email"]; !ok || emailIdx != 0 {
		t.Errorf("Expected suggestedMaps['email'] == 0, got %v", preview.SuggestedMaps)
	}
}

func TestPreviewCSV_SingleColumnWithHeader(t *testing.T) {
	tmpDir := t.TempDir()
	csvPath := filepath.Join(tmpDir, "with_header.csv")

	content := "email\nabc@gmail.com\nxyz@yahoo.com\n"
	if err := os.WriteFile(csvPath, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write test CSV: %v", err)
	}

	preview, err := PreviewCSV(csvPath, 5)
	if err != nil {
		t.Fatalf("PreviewCSV failed: %v", err)
	}

	if len(preview.Headers) != 1 || preview.Headers[0] != "email" {
		t.Errorf("Expected header ['email'], got %v", preview.Headers)
	}

	if preview.TotalRowsEst != 2 {
		t.Errorf("Expected total count 2, got %d", preview.TotalRowsEst)
	}

	if len(preview.SampleRows) != 2 {
		t.Errorf("Expected 2 sample rows, got %d", len(preview.SampleRows))
	} else if preview.SampleRows[0][0] != "abc@gmail.com" {
		t.Errorf("Expected first sample row to be 'abc@gmail.com', got %v", preview.SampleRows[0])
	}

	if emailIdx, ok := preview.SuggestedMaps["email"]; !ok || emailIdx != 0 {
		t.Errorf("Expected suggestedMaps['email'] == 0, got %v", preview.SuggestedMaps)
	}
}
