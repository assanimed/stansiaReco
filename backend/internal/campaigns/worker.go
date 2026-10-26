package campaigns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ClaimNextCampaign claims a queued or due scheduled campaign for processing
func ClaimNextCampaign(ctx context.Context, db *pgxpool.Pool) (*Campaign, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Claim either 'queued' or due 'scheduled' campaign
	query := `
		SELECT 
			c.id, c.name, c.subject, c.from_name, c.from_email, COALESCE(c.reply_to, ''),
			c.mail_list_id, COALESCE(ml.name, ''), COALESCE(ml.code, ''),
			c.audience_filter, c.routing_type,
			c.sending_ip_pool_id, COALESCE(sip.name, ''),
			c.sending_esp_id, COALESCE(se.name, ''),
			COALESCE(c.custom_vmta, ''),
			c.html_content, c.plain_content, c.custom_headers,
			c.track_opens, c.track_clicks, c.list_unsubscribe_header,
			c.scheduled_at, c.hourly_limit, c.batch_size,
			c.status, c.total_recipients, c.processed_count, c.sent_count, c.suppressed_count, c.failed_count,
			COALESCE(c.spool_path, ''), COALESCE(c.error_message, ''),
			c.started_at, c.completed_at,
			c.created_by, COALESCE(u.full_name, ''),
			c.created_at, c.updated_at
		FROM campaigns c
		LEFT JOIN mail_lists ml ON c.mail_list_id = ml.id
		LEFT JOIN sending_ip_pools sip ON c.sending_ip_pool_id = sip.id
		LEFT JOIN sending_esps se ON c.sending_esp_id = se.id
		LEFT JOIN users u ON c.created_by = u.id
		WHERE (
			c.status = 'queued' 
			OR (c.status = 'scheduled' AND c.scheduled_at <= NOW())
			OR (c.status = 'processing' AND c.updated_at < NOW() - INTERVAL '10 minutes')
		)
		ORDER BY c.created_at ASC
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`

	var c Campaign
	var audBytes, headerBytes []byte

	err = tx.QueryRow(ctx, query).Scan(
		&c.ID, &c.Name, &c.Subject, &c.FromName, &c.FromEmail, &c.ReplyTo,
		&c.MailListID, &c.MailListName, &c.MailListCode,
		&audBytes, &c.RoutingType,
		&c.SendingIPPoolID, &c.SendingIPPoolName,
		&c.SendingESPID, &c.SendingESPName,
		&c.CustomVMTA,
		&c.HTMLContent, &c.PlainContent, &headerBytes,
		&c.TrackOpens, &c.TrackClicks, &c.ListUnsubscribeHeader,
		&c.ScheduledAt, &c.HourlyLimit, &c.BatchSize,
		&c.Status, &c.TotalRecipients, &c.ProcessedCount, &c.SentCount, &c.SuppressedCount, &c.FailedCount,
		&c.SpoolPath, &c.ErrorMessage,
		&c.StartedAt, &c.CompletedAt,
		&c.CreatedBy, &c.CreatedByName,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // No pending campaigns
		}
		return nil, fmt.Errorf("failed to query claimable campaign: %w", err)
	}

	if len(audBytes) > 0 {
		_ = json.Unmarshal(audBytes, &c.AudienceFilter)
	}
	if len(headerBytes) > 0 {
		_ = json.Unmarshal(headerBytes, &c.CustomHeaders)
	}

	// Update status to processing
	_, err = tx.Exec(ctx, `
		UPDATE campaigns 
		SET status = 'processing', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
		WHERE id = $1
	`, c.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to update campaign status to processing: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit campaign claim: %w", err)
	}

	c.Status = StatusProcessing
	return &c, nil
}

// ProcessCampaignBatch fetches and spools a batch of unspooled eligible contacts
// Returns true when all recipients for this campaign have been processed
func ProcessCampaignBatch(
	ctx context.Context,
	db *pgxpool.Pool,
	spooler DeliverySpooler,
	campaign *Campaign,
	logger *slog.Logger,
) (isFinished bool, err error) {
	// 1. Verify campaign is still in processing status (not paused or cancelled)
	var currentStatus string
	err = db.QueryRow(ctx, "SELECT status FROM campaigns WHERE id = $1", campaign.ID).Scan(&currentStatus)
	if err != nil {
		return false, fmt.Errorf("failed to check current campaign status: %w", err)
	}
	if currentStatus != string(StatusProcessing) && currentStatus != string(StatusQueued) {
		logger.Info("Campaign execution interrupted by status change", "campaign_id", campaign.ID, "status", currentStatus)
		return true, nil // Stop execution loop for this campaign
	}

	// 2. Build where filter for eligible contacts
	whereClauses := []string{"c.list_id = $1"}
	args := []any{campaign.MailListID}
	argIdx := 2

	if campaign.AudienceFilter.OnlyClean {
		whereClauses = append(whereClauses, "c.is_clean = true")
	}
	if campaign.AudienceFilter.OnlyOpeners {
		whereClauses = append(whereClauses, "c.is_opener = true")
	}
	if campaign.AudienceFilter.OnlyClickers {
		whereClauses = append(whereClauses, "c.is_clicker = true")
	}
	if campaign.AudienceFilter.OnlySeeds {
		whereClauses = append(whereClauses, "c.is_seed = true")
	}
	if campaign.AudienceFilter.ExcludeUnsubs {
		whereClauses = append(whereClauses, "c.is_unsub = false AND c.is_optout = false AND c.is_blacklisted = false AND c.is_hard_bounced = false")
	}
	if len(campaign.AudienceFilter.CountryCodes) > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("c.country_code = ANY($%d)", argIdx))
		args = append(args, campaign.AudienceFilter.CountryCodes)
		argIdx++
	}
	if len(campaign.AudienceFilter.Verticals) > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("c.verticals && $%d", argIdx))
		args = append(args, campaign.AudienceFilter.Verticals)
		argIdx++
	}

	// Exclude already spooled/attempted contacts for this campaign
	whereClauses = append(whereClauses, fmt.Sprintf(`
		NOT EXISTS (
			SELECT 1 FROM campaign_logs cl
			WHERE cl.campaign_id = $%d AND cl.contact_id = c.id
		)
	`, argIdx))
	args = append(args, campaign.ID)
	argIdx++

	// Exclude suppressed emails
	whereClauses = append(whereClauses, `
		NOT EXISTS (
			SELECT 1 FROM suppressions s
			WHERE s.email = c.email
			AND (s.list_id IS NULL OR s.list_id = c.list_id)
		)
	`)

	batchSize := campaign.BatchSize
	if batchSize <= 0 || batchSize > 1000 {
		batchSize = 250
	}

	whereSQL := strings.Join(whereClauses, " AND ")
	query := fmt.Sprintf(`
		SELECT 
			c.id, c.email, c.email_md5, 
			COALESCE(c.first_name, ''), COALESCE(c.last_name, ''),
			COALESCE(c.city, ''), COALESCE(c.region, ''), 
			COALESCE(c.country, ''), COALESCE(c.country_code, '')
		FROM contacts c
		WHERE %s
		ORDER BY c.created_at ASC
		LIMIT $%d
	`, whereSQL, argIdx)

	args = append(args, batchSize)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return false, fmt.Errorf("failed to query next batch of contacts: %w", err)
	}
	defer rows.Close()

	var contacts []ContactData
	for rows.Next() {
		var cd ContactData
		if err := rows.Scan(
			&cd.ID, &cd.Email, &cd.EmailMD5,
			&cd.FirstName, &cd.LastName,
			&cd.City, &cd.Region,
			&cd.Country, &cd.CountryCode,
		); err != nil {
			return false, fmt.Errorf("failed to scan contact: %w", err)
		}
		contacts = append(contacts, cd)
	}

	// If no remaining contacts, mark campaign completed!
	if len(contacts) == 0 {
		_, err = db.Exec(ctx, `
			UPDATE campaigns 
			SET status = 'completed', completed_at = NOW(), updated_at = NOW()
			WHERE id = $1
		`, campaign.ID)
		if err != nil {
			return false, fmt.Errorf("failed to complete campaign: %w", err)
		}
		logger.Info("Campaign dispatch successfully completed", "campaign_id", campaign.ID)
		return true, nil
	}

	// 3. Process batch
	spooledCount := 0
	failedCount := 0

	for _, contact := range contacts {
		// Stop if context cancelled
		if ctx.Err() != nil {
			return false, ctx.Err()
		}

		rawMIME, msgID, err := BuildMIMEMessage(campaign, &contact, "track.stansiareco.local")
		if err != nil {
			failedCount++
			logCampaignDispatch(ctx, db, campaign.ID, contact.ID, contact.Email, "failed", "", "", err.Error())
			continue
		}

		spoolPath, err := spooler.Spool(ctx, campaign, &contact, rawMIME)
		if err != nil {
			failedCount++
			logCampaignDispatch(ctx, db, campaign.ID, contact.ID, contact.Email, "failed", msgID, "", err.Error())
			continue
		}

		spooledCount++
		logCampaignDispatch(ctx, db, campaign.ID, contact.ID, contact.Email, "spooled", msgID, spoolPath, "Message spooled to disk")

		// Throttling if hourly limit is defined
		if campaign.HourlyLimit > 0 {
			sleepDuration := time.Duration(3600*1000/campaign.HourlyLimit) * time.Millisecond
			if sleepDuration > 0 && sleepDuration < 5*time.Second {
				time.Sleep(sleepDuration)
			}
		}
	}

	// 4. Increment campaign counters
	_, err = db.Exec(ctx, `
		UPDATE campaigns
		SET 
			processed_count = processed_count + $1,
			sent_count = sent_count + $2,
			failed_count = failed_count + $3,
			updated_at = NOW()
		WHERE id = $4
	`, len(contacts), spooledCount, failedCount, campaign.ID)
	if err != nil {
		logger.Error("Failed to update campaign batch counters", "campaign_id", campaign.ID, "error", err)
	}

	logger.Info("Dispatched campaign batch",
		"campaign_id", campaign.ID,
		"batch_total", len(contacts),
		"spooled", spooledCount,
		"failed", failedCount,
	)

	return false, nil
}

func logCampaignDispatch(
	ctx context.Context,
	db *pgxpool.Pool,
	campaignID uuid.UUID,
	contactID uuid.UUID,
	email string,
	status string,
	messageID string,
	filePath string,
	details string,
) {
	_, _ = db.Exec(ctx, `
		INSERT INTO campaign_logs (id, campaign_id, contact_id, email, status, message_id, file_path, details, created_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
	`, campaignID, contactID, email, status, messageID, filePath, details)
}
