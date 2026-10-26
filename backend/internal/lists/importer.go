package lists

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AvailableContactFields defines the standard fields that CSV columns can map to.
var AvailableContactFields = []ContactFieldDef{
	{Key: "email", Label: "Email Address", Required: true, Description: "Primary email address (validated and normalized)"},
	{Key: "first_name", Label: "First Name", Required: false, Description: "Recipient's first name"},
	{Key: "last_name", Label: "Last Name", Required: false, Description: "Recipient's surname or family name"},
	{Key: "verticals", Label: "Verticals", Required: false, Description: "Comma-separated business categories or tags"},
	{Key: "ip", Label: "Recipient IP", Required: false, Description: "Observed recipient IP address"},
	{Key: "country_code", Label: "Country Code", Required: false, Description: "ISO 3166-1 alpha-2 two-letter country code"},
	{Key: "country", Label: "Country Name", Required: false, Description: "Full country name"},
	{Key: "region", Label: "Region / State", Required: false, Description: "State, province, or region name"},
	{Key: "city", Label: "City", Required: false, Description: "City name"},
	{Key: "language", Label: "Language", Required: false, Description: "Language code (e.g. en, fr, de, es)"},
	{Key: "device_type", Label: "Device Type", Required: false, Description: "Device category (mobile, desktop, tablet)"},
	{Key: "device_name", Label: "Device Name", Required: false, Description: "Hardware device model"},
	{Key: "os", Label: "Operating System", Required: false, Description: "OS name (Windows, macOS, iOS, Android, Linux)"},
	{Key: "browser_name", Label: "Browser Name", Required: false, Description: "Web browser or email client name"},
	{Key: "browser_version", Label: "Browser Version", Required: false, Description: "Browser application version"},
}

// ExtractLocalPart returns the username portion of an email address preceding the '@'.
// Example: "abc@gmail.com" -> "abc".
func ExtractLocalPart(email string) string {
	email = strings.TrimSpace(email)
	if atIdx := strings.Index(email, "@"); atIdx != -1 {
		local := email[:atIdx]
		if len(local) > 128 {
			local = local[:128]
		}
		return local
	}
	if len(email) > 128 {
		return email[:128]
	}
	return email
}

// IsHeaderRow checks if the given CSV row is likely a header row rather than a data record.
// If any column in the row is a valid email address, it is definitely a data row, not a header row.
func IsHeaderRow(record []string) bool {
	if len(record) == 0 {
		return false
	}
	// If any column is a valid email, it's definitely a data row
	for _, col := range record {
		trimmed := strings.TrimSpace(col)
		if strings.Contains(trimmed, "@") && ValidateEmail(NormalizeEmail(trimmed)) {
			return false
		}
	}

	// Check if any column contains typical header keywords
	for _, col := range record {
		cleaned := strings.ToLower(strings.TrimSpace(col))
		cleaned = strings.ReplaceAll(cleaned, "_", "")
		cleaned = strings.ReplaceAll(cleaned, "-", "")
		cleaned = strings.ReplaceAll(cleaned, " ", "")

		switch cleaned {
		case "email", "mail", "e-mail", "emailaddress", "emails",
			"firstname", "fname", "first",
			"lastname", "lname", "last", "surname",
			"ip", "ipaddress", "clientip",
			"country", "countrycode", "countryiso", "iso", "countryname",
			"region", "state", "province",
			"city",
			"language", "lang",
			"device", "devicetype", "devicename",
			"os", "operatingsystem",
			"browser", "browsername", "browserversion",
			"vertical", "verticals":
			return true
		}
	}

	return false
}

// PreviewCSV reads headers and sample rows from an uploaded CSV file.
func PreviewCSV(filePath string, maxSampleRows int) (*CSVPreviewResponse, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file for preview: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true
	reader.LazyQuotes = true

	firstRow, err := reader.Read()
	if err != nil {
		if errors.Is(err, io.EOF) {
			return nil, errors.New("CSV file is completely empty")
		}
		return nil, fmt.Errorf("failed to read CSV headers: %w", err)
	}

	isHeader := IsHeaderRow(firstRow)
	var headers []string
	var sampleRows [][]string
	totalCount := 0

	if isHeader {
		headers = firstRow
	} else {
		// First row is actual data! Synthesize headers and include first row in sample
		if len(firstRow) == 1 {
			headers = []string{"Email Address"}
		} else {
			headers = make([]string, len(firstRow))
			for i := range firstRow {
				headers[i] = fmt.Sprintf("Column %d", i+1)
			}
		}
		sampleRows = append(sampleRows, firstRow)
		totalCount++
	}

	for {
		row, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			continue // Skip malformed preview rows
		}
		totalCount++
		if len(sampleRows) < maxSampleRows {
			sampleRows = append(sampleRows, row)
		}
	}

	// Suggest intelligent column mappings
	suggestedMaps := make(map[string]int)

	if len(headers) == 1 {
		// Single column file: automatically map column 0 to email
		suggestedMaps["email"] = 0
	} else if isHeader {
		for idx, h := range headers {
			cleaned := strings.ToLower(strings.TrimSpace(h))
			cleaned = strings.ReplaceAll(cleaned, "_", "")
			cleaned = strings.ReplaceAll(cleaned, "-", "")
			cleaned = strings.ReplaceAll(cleaned, " ", "")

			switch {
			case strings.Contains(cleaned, "email") || cleaned == "mail" || cleaned == "e-mail":
				if _, exists := suggestedMaps["email"]; !exists {
					suggestedMaps["email"] = idx
				}
			case cleaned == "firstname" || cleaned == "fname" || cleaned == "first":
				suggestedMaps["first_name"] = idx
			case cleaned == "lastname" || cleaned == "lname" || cleaned == "last" || cleaned == "surname":
				suggestedMaps["last_name"] = idx
			case cleaned == "ip" || cleaned == "ipaddress" || cleaned == "clientip":
				suggestedMaps["ip"] = idx
			case cleaned == "countrycode" || cleaned == "countryiso" || cleaned == "iso":
				suggestedMaps["country_code"] = idx
			case cleaned == "country" || cleaned == "countryname":
				suggestedMaps["country"] = idx
			case cleaned == "region" || cleaned == "state" || cleaned == "province":
				suggestedMaps["region"] = idx
			case cleaned == "city":
				suggestedMaps["city"] = idx
			case cleaned == "language" || cleaned == "lang":
				suggestedMaps["language"] = idx
			case cleaned == "devicetype" || cleaned == "device":
				suggestedMaps["device_type"] = idx
			case cleaned == "os" || cleaned == "operatingsystem":
				suggestedMaps["os"] = idx
			case cleaned == "browser" || cleaned == "browsername":
				suggestedMaps["browser_name"] = idx
			}
		}
	} else {
		// Headerless multi-column: detect which column contains valid email
		for idx, val := range firstRow {
			if strings.Contains(val, "@") && ValidateEmail(NormalizeEmail(val)) {
				suggestedMaps["email"] = idx
				break
			}
		}
	}

	return &CSVPreviewResponse{
		Filename:       filePath,
		TotalRowsEst:   totalCount,
		Headers:        headers,
		SampleRows:     sampleRows,
		SuggestedMaps:  suggestedMaps,
		AvailableSlots: AvailableContactFields,
	}, nil
}

// ProcessCSVImportJob executes a streaming CSV import into the target mail list.
func ProcessCSVImportJob(ctx context.Context, db *pgxpool.Pool, job *ImportJob) error {
	file, err := os.Open(job.FilePath)
	if err != nil {
		job.Status = "failed"
		job.ErrorReport = append(job.ErrorReport, ImportError{
			RowIndex: 0,
			Reason:   fmt.Sprintf("Failed to open uploaded file: %v", err),
		})
		return err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true
	reader.LazyQuotes = true

	// Read first row to determine if headers are present
	firstRecord, err := reader.Read()
	if err != nil {
		if errors.Is(err, io.EOF) {
			job.Status = "completed"
			return nil
		}
		job.Status = "failed"
		job.ErrorReport = append(job.ErrorReport, ImportError{
			RowIndex: 0,
			Reason:   "CSV header could not be read or file is empty",
		})
		return err
	}

	hasHeader := IsHeaderRow(firstRecord)

	if job.ColumnMapping == nil {
		job.ColumnMapping = make(map[string]int)
	}

	emailColIdx, hasEmail := job.ColumnMapping["email"]
	if (!hasEmail || emailColIdx < 0) && len(firstRecord) == 1 {
		// Single-column email file default
		job.ColumnMapping["email"] = 0
		emailColIdx = 0
		hasEmail = true
	}

	if !hasEmail || emailColIdx < 0 {
		job.Status = "failed"
		job.ErrorReport = append(job.ErrorReport, ImportError{
			RowIndex: 0,
			Reason:   "Column mapping is missing a valid 'email' target column index",
		})
		return errors.New("missing email column mapping")
	}

	// Cache suppressions for this list and global suppressions
	suppressedSet := make(map[string]bool)
	supRows, err := db.Query(ctx, "SELECT email FROM suppressions WHERE list_id = $1 OR list_id IS NULL", job.ListID)
	if err == nil {
		defer supRows.Close()
		for supRows.Next() {
			var supEmail string
			if err := supRows.Scan(&supEmail); err == nil {
				suppressedSet[strings.ToLower(supEmail)] = true
			}
		}
	}

	const batchSize = 1000
	var batch []CreateContactRequest
	lastProgressTick := time.Now()

	saveProgress := func() {
		_, _ = db.Exec(ctx, `
			UPDATE import_jobs 
			SET processed_rows = $1, accepted_rows = $2, inserted_rows = $3,
			    updated_rows = $4, duplicate_rows = $5, invalid_rows = $6,
			    suppressed_rows = $7, error_count = $8, updated_at = NOW()
			WHERE id = $9
		`,
			job.ProcessedRows, job.AcceptedRows, job.InsertedRows,
			job.UpdatedRows, job.DuplicateRows, job.InvalidRows,
			job.SuppressedRows, job.ErrorCount, job.ID,
		)
	}

	processRow := func(record []string, rIndex int) {
		job.ProcessedRows++

		if emailColIdx >= len(record) {
			job.InvalidRows++
			job.ErrorCount++
			if len(job.ErrorReport) < 500 {
				job.ErrorReport = append(job.ErrorReport, ImportError{
					RowIndex: rIndex,
					Reason:   "Row has fewer columns than required for email",
				})
			}
			return
		}

		rawEmail := record[emailColIdx]
		normEmail := NormalizeEmail(rawEmail)
		if !ValidateEmail(normEmail) {
			job.InvalidRows++
			job.ErrorCount++
			if len(job.ErrorReport) < 500 {
				job.ErrorReport = append(job.ErrorReport, ImportError{
					RowIndex: rIndex,
					Email:    rawEmail,
					Reason:   "Invalid email address format",
				})
			}
			return
		}

		// Suppression check
		if suppressedSet[normEmail] {
			job.SuppressedRows++
			if len(job.ErrorReport) < 500 {
				job.ErrorReport = append(job.ErrorReport, ImportError{
					RowIndex: rIndex,
					Email:    normEmail,
					Reason:   "Address is on active suppression list",
				})
			}
			return
		}

		// Helper to extract mapped value
		getVal := func(key string) string {
			if idx, ok := job.ColumnMapping[key]; ok && idx >= 0 && idx < len(record) {
				return strings.TrimSpace(record[idx])
			}
			return ""
		}

		// If first_name or last_name are not mapped or are empty, default to email username prefix before '@'
		localPart := ExtractLocalPart(normEmail)
		firstName := getVal("first_name")
		if firstName == "" {
			firstName = localPart
		}
		lastName := getVal("last_name")
		if lastName == "" {
			lastName = localPart
		}

		contactReq := CreateContactRequest{
			ListID:         job.ListID,
			Email:          normEmail,
			FirstName:      firstName,
			LastName:       lastName,
			IP:             getVal("ip"),
			CountryCode:    strings.ToUpper(getVal("country_code")),
			Country:        getVal("country"),
			Region:         getVal("region"),
			City:           getVal("city"),
			Language:       getVal("language"),
			DeviceType:     getVal("device_type"),
			DeviceName:     getVal("device_name"),
			OS:             getVal("os"),
			BrowserName:    getVal("browser_name"),
			BrowserVersion: getVal("browser_version"),
			IsClean:        true,
			IsFresh:        true,
		}

		if verts := getVal("verticals"); verts != "" {
			parts := strings.Split(verts, ",")
			for _, p := range parts {
				if t := strings.TrimSpace(p); t != "" {
					contactReq.Verticals = append(contactReq.Verticals, t)
				}
			}
		}

		batch = append(batch, contactReq)

		// Execute batch when full
		if len(batch) >= batchSize {
			ins, upd, dup := executeBatchUpsert(ctx, db, job.ListID, batch, job.DuplicateStrategy)
			job.InsertedRows += ins
			job.UpdatedRows += upd
			job.DuplicateRows += dup
			job.AcceptedRows += (ins + upd)
			batch = batch[:0]

			// Periodic progress persistence (every 2 seconds)
			if time.Since(lastProgressTick) > 2*time.Second {
				saveProgress()
				lastProgressTick = time.Now()
			}
		}
	}

	rowIndex := 1
	// If firstRecord is data (no header row), process it immediately
	if !hasHeader {
		processRow(firstRecord, 1)
	}

	for {
		// Check for cancellation
		select {
		case <-ctx.Done():
			job.Status = "cancelled"
			return ctx.Err()
		default:
		}

		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		rowIndex++

		if err != nil {
			job.ProcessedRows++
			job.InvalidRows++
			job.ErrorCount++
			if len(job.ErrorReport) < 500 {
				job.ErrorReport = append(job.ErrorReport, ImportError{
					RowIndex: rowIndex,
					Reason:   fmt.Sprintf("Malformed CSV row: %v", err),
				})
			}
			continue
		}

		processRow(record, rowIndex)
	}

	// Flush remaining batch
	if len(batch) > 0 {
		ins, upd, dup := executeBatchUpsert(ctx, db, job.ListID, batch, job.DuplicateStrategy)
		job.InsertedRows += ins
		job.UpdatedRows += upd
		job.DuplicateRows += dup
		job.AcceptedRows += (ins + upd)
	}

	if job.ErrorCount > 0 && job.InsertedRows == 0 && job.UpdatedRows == 0 {
		job.Status = "failed"
	} else if job.ErrorCount > 0 {
		job.Status = "completed_with_errors"
	} else {
		job.Status = "completed"
	}

	return nil
}

// executeBatchUpsert performs a high-speed batch insert / upsert using unnested arrays.
func executeBatchUpsert(ctx context.Context, db *pgxpool.Pool, listID uuid.UUID, batch []CreateContactRequest, strategy string) (inserted, updated, duplicate int) {
	if len(batch) == 0 {
		return 0, 0, 0
	}

	emails := make([]string, len(batch))
	md5s := make([]string, len(batch))
	firstNames := make([]string, len(batch))
	lastNames := make([]string, len(batch))
	ips := make([]*string, len(batch))
	countries := make([]string, len(batch))
	countryCodes := make([]string, len(batch))
	regions := make([]string, len(batch))
	cities := make([]string, len(batch))
	languages := make([]string, len(batch))
	deviceTypes := make([]string, len(batch))
	deviceNames := make([]string, len(batch))
	oss := make([]string, len(batch))
	browserNames := make([]string, len(batch))
	browserVersions := make([]string, len(batch))

	for i, c := range batch {
		emails[i] = c.Email
		md5s[i] = HashEmailMD5(c.Email)
		firstNames[i] = c.FirstName
		lastNames[i] = c.LastName
		if c.IP != "" {
			if parsed := net.ParseIP(c.IP); parsed != nil {
				str := parsed.String()
				ips[i] = &str
			}
		}
		countries[i] = c.Country
		countryCodes[i] = c.CountryCode
		regions[i] = c.Region
		cities[i] = c.City
		languages[i] = c.Language
		deviceTypes[i] = c.DeviceType
		deviceNames[i] = c.DeviceName
		oss[i] = c.OS
		browserNames[i] = c.BrowserName
		browserVersions[i] = c.BrowserVersion
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, 0, 0
	}
	defer tx.Rollback(ctx)

	switch strategy {
	case "update":
		// Insert or update existing contact details
		cmd := `
			WITH batch_data AS (
				SELECT 
					$1::uuid AS list_id,
					unnest($2::text[]) AS email,
					unnest($3::text[]) AS email_md5,
					unnest($4::text[]) AS first_name,
					unnest($5::text[]) AS last_name,
					unnest($6::inet[]) AS ip,
					unnest($7::text[]) AS country,
					unnest($8::text[]) AS country_code,
					unnest($9::text[]) AS region,
					unnest($10::text[]) AS city,
					unnest($11::text[]) AS language,
					unnest($12::text[]) AS device_type,
					unnest($13::text[]) AS device_name,
					unnest($14::text[]) AS os,
					unnest($15::text[]) AS browser_name,
					unnest($16::text[]) AS browser_version
			),
			ins AS (
				INSERT INTO contacts (
					list_id, email, email_md5, first_name, last_name,
					ip, country, country_code, region, city, language,
					device_type, device_name, os, browser_name, browser_version,
					is_clean, is_fresh, created_at, updated_at
				)
				SELECT 
					list_id, email, email_md5, first_name, last_name,
					ip,
					NULLIF(country, ''),
					NULLIF(country_code, ''),
					NULLIF(region, ''),
					NULLIF(city, ''),
					NULLIF(language, ''),
					NULLIF(device_type, ''),
					NULLIF(device_name, ''),
					NULLIF(os, ''),
					NULLIF(browser_name, ''),
					NULLIF(browser_version, ''),
					true, true, NOW(), NOW()
				FROM batch_data
				ON CONFLICT (list_id, email) DO UPDATE SET
					first_name = EXCLUDED.first_name,
					last_name = EXCLUDED.last_name,
					ip = COALESCE(EXCLUDED.ip, contacts.ip),
					country = COALESCE(NULLIF(EXCLUDED.country, ''), contacts.country),
					country_code = COALESCE(NULLIF(EXCLUDED.country_code, ''), contacts.country_code),
					region = COALESCE(NULLIF(EXCLUDED.region, ''), contacts.region),
					city = COALESCE(NULLIF(EXCLUDED.city, ''), contacts.city),
					language = COALESCE(NULLIF(EXCLUDED.language, ''), contacts.language),
					device_type = COALESCE(NULLIF(EXCLUDED.device_type, ''), contacts.device_type),
					device_name = COALESCE(NULLIF(EXCLUDED.device_name, ''), contacts.device_name),
					os = COALESCE(NULLIF(EXCLUDED.os, ''), contacts.os),
					browser_name = COALESCE(NULLIF(EXCLUDED.browser_name, ''), contacts.browser_name),
					browser_version = COALESCE(NULLIF(EXCLUDED.browser_version, ''), contacts.browser_version),
					updated_at = NOW()
				RETURNING (xmax = 0) AS is_insert
			)
			SELECT 
				COUNT(*) FILTER (WHERE is_insert = true),
				COUNT(*) FILTER (WHERE is_insert = false)
			FROM ins
		`
		var insCount, updCount int64
		err = tx.QueryRow(ctx, cmd,
			listID, emails, md5s, firstNames, lastNames, ips,
			countries, countryCodes, regions, cities, languages,
			deviceTypes, deviceNames, oss, browserNames, browserVersions,
		).Scan(&insCount, &updCount)
		if err == nil {
			_ = tx.Commit(ctx)
			return int(insCount), int(updCount), int(updCount)
		}

	default: // "skip" strategy: ignore conflicts
		cmd := `
			WITH batch_data AS (
				SELECT 
					$1::uuid AS list_id,
					unnest($2::text[]) AS email,
					unnest($3::text[]) AS email_md5,
					unnest($4::text[]) AS first_name,
					unnest($5::text[]) AS last_name,
					unnest($6::inet[]) AS ip,
					unnest($7::text[]) AS country,
					unnest($8::text[]) AS country_code,
					unnest($9::text[]) AS region,
					unnest($10::text[]) AS city,
					unnest($11::text[]) AS language,
					unnest($12::text[]) AS device_type,
					unnest($13::text[]) AS device_name,
					unnest($14::text[]) AS os,
					unnest($15::text[]) AS browser_name,
					unnest($16::text[]) AS browser_version
			),
			ins AS (
				INSERT INTO contacts (
					list_id, email, email_md5, first_name, last_name,
					ip, country, country_code, region, city, language,
					device_type, device_name, os, browser_name, browser_version,
					is_clean, is_fresh, created_at, updated_at
				)
				SELECT 
					list_id, email, email_md5, first_name, last_name,
					ip,
					NULLIF(country, ''),
					NULLIF(country_code, ''),
					NULLIF(region, ''),
					NULLIF(city, ''),
					NULLIF(language, ''),
					NULLIF(device_type, ''),
					NULLIF(device_name, ''),
					NULLIF(os, ''),
					NULLIF(browser_name, ''),
					NULLIF(browser_version, ''),
					true, true, NOW(), NOW()
				FROM batch_data
				ON CONFLICT (list_id, email) DO NOTHING
				RETURNING id
			)
			SELECT COUNT(*) FROM ins
		`
		var insCount int64
		err = tx.QueryRow(ctx, cmd,
			listID, emails, md5s, firstNames, lastNames, ips,
			countries, countryCodes, regions, cities, languages,
			deviceTypes, deviceNames, oss, browserNames, browserVersions,
		).Scan(&insCount)
		if err == nil {
			_ = tx.Commit(ctx)
			ins := int(insCount)
			dup := len(batch) - ins
			return ins, 0, dup
		}
	}

	return 0, 0, 0
}
