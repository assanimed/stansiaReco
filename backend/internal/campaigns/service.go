package campaigns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound       = errors.New("campaign not found")
	ErrInvalidStatus  = errors.New("invalid campaign status for this operation")
	ErrValidationFail = errors.New("validation failed")
)

type Service interface {
	List(ctx context.Context, filter CampaignFilter) ([]Campaign, int64, error)
	GetByID(ctx context.Context, id uuid.UUID) (*Campaign, error)
	Create(ctx context.Context, req CreateCampaignRequest, userID uuid.UUID) (*Campaign, error)
	Update(ctx context.Context, id uuid.UUID, req UpdateCampaignRequest) (*Campaign, error)
	Delete(ctx context.Context, id uuid.UUID) error
	Launch(ctx context.Context, id uuid.UUID) (*Campaign, error)
	Pause(ctx context.Context, id uuid.UUID) (*Campaign, error)
	Resume(ctx context.Context, id uuid.UUID) (*Campaign, error)
	Cancel(ctx context.Context, id uuid.UUID) (*Campaign, error)
	GetSummaryKPIs(ctx context.Context) (*CampaignSummaryKPIs, error)
	ListLogs(ctx context.Context, campaignID uuid.UUID, page, pageSize int) ([]CampaignLog, int64, error)
	Preview(ctx context.Context, req PreviewRequest) (*PreviewResponse, error)
	TestSend(ctx context.Context, campaignID uuid.UUID, req TestSendRequest) (*CampaignLog, error)
	EstimateAudience(ctx context.Context, listID uuid.UUID, filter AudienceFilter) (*AudienceEstimate, error)
	GetSpoolFiles(ctx context.Context, campaignID uuid.UUID) ([]SpoolFileInfo, error)
	ReadSpoolFile(ctx context.Context, campaignID uuid.UUID, fileName string) ([]byte, error)
	ArchiveSpool(ctx context.Context, campaignID uuid.UUID) (io.ReadCloser, int64, error)
}

type PostgresCampaignService struct {
	db      *pgxpool.Pool
	spooler DeliverySpooler
}

func NewPostgresCampaignService(db *pgxpool.Pool, spooler DeliverySpooler) *PostgresCampaignService {
	return &PostgresCampaignService{
		db:      db,
		spooler: spooler,
	}
}

func (s *PostgresCampaignService) List(ctx context.Context, filter CampaignFilter) ([]Campaign, int64, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	whereClauses := []string{"1=1"}
	args := []any{}
	argIdx := 1

	if strings.TrimSpace(filter.Search) != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("(c.name ILIKE $%d OR c.subject ILIKE $%d OR c.from_email ILIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, "%"+filter.Search+"%")
		argIdx++
	}

	if filter.Status != "" && filter.Status != "all" {
		whereClauses = append(whereClauses, fmt.Sprintf("c.status = $%d", argIdx))
		args = append(args, filter.Status)
		argIdx++
	}

	if filter.MailListID != nil {
		whereClauses = append(whereClauses, fmt.Sprintf("c.mail_list_id = $%d", argIdx))
		args = append(args, *filter.MailListID)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	var total int64
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM campaigns c WHERE %s", whereSQL)
	if err := s.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count campaigns: %w", err)
	}

	offset := (filter.Page - 1) * filter.PageSize
	query := fmt.Sprintf(`
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
		WHERE %s
		ORDER BY c.created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)

	args = append(args, filter.PageSize, offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query campaigns: %w", err)
	}
	defer rows.Close()

	var campaigns []Campaign
	for rows.Next() {
		var c Campaign
		var audBytes, headerBytes []byte

		err := rows.Scan(
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
			return nil, 0, fmt.Errorf("failed to scan campaign row: %w", err)
		}

		if len(audBytes) > 0 {
			_ = json.Unmarshal(audBytes, &c.AudienceFilter)
		}
		if len(headerBytes) > 0 {
			_ = json.Unmarshal(headerBytes, &c.CustomHeaders)
		}

		campaigns = append(campaigns, c)
	}

	return campaigns, total, nil
}

func (s *PostgresCampaignService) GetByID(ctx context.Context, id uuid.UUID) (*Campaign, error) {
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
		WHERE c.id = $1
	`
	var c Campaign
	var audBytes, headerBytes []byte

	err := s.db.QueryRow(ctx, query, id).Scan(
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
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to fetch campaign: %w", err)
	}

	if len(audBytes) > 0 {
		_ = json.Unmarshal(audBytes, &c.AudienceFilter)
	}
	if len(headerBytes) > 0 {
		_ = json.Unmarshal(headerBytes, &c.CustomHeaders)
	}

	return &c, nil
}

func (s *PostgresCampaignService) Create(ctx context.Context, req CreateCampaignRequest, userID uuid.UUID) (*Campaign, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, fmt.Errorf("%w: campaign name is required", ErrValidationFail)
	}
	if strings.TrimSpace(req.Subject) == "" {
		return nil, fmt.Errorf("%w: subject is required", ErrValidationFail)
	}
	if strings.TrimSpace(req.FromEmail) == "" {
		return nil, fmt.Errorf("%w: from email is required", ErrValidationFail)
	}
	if req.MailListID == uuid.Nil {
		return nil, fmt.Errorf("%w: mail list is required", ErrValidationFail)
	}
	if req.BatchSize <= 0 {
		req.BatchSize = 500
	}
	if req.RoutingType == "" {
		req.RoutingType = RoutingFileSpool
	}

	audBytes, err := json.Marshal(req.AudienceFilter)
	if err != nil {
		audBytes = []byte("{}")
	}

	headersBytes, err := json.Marshal(req.CustomHeaders)
	if err != nil {
		headersBytes = []byte("{}")
	}

	status := StatusDraft
	if req.ScheduledAt != nil && req.ScheduledAt.After(time.Now()) {
		status = StatusScheduled
	}

	query := `
		INSERT INTO campaigns (
			name, subject, from_name, from_email, reply_to,
			mail_list_id, audience_filter, routing_type,
			sending_ip_pool_id, sending_esp_id, custom_vmta,
			html_content, plain_content, custom_headers,
			track_opens, track_clicks, list_unsubscribe_header,
			scheduled_at, hourly_limit, batch_size,
			status, created_by, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8,
			$9, $10, $11,
			$12, $13, $14,
			$15, $16, $17,
			$18, $19, $20,
			$21, $22, NOW(), NOW()
		)
		RETURNING id
	`

	var newID uuid.UUID
	err = s.db.QueryRow(ctx, query,
		req.Name, req.Subject, req.FromName, req.FromEmail, req.ReplyTo,
		req.MailListID, audBytes, req.RoutingType,
		req.SendingIPPoolID, req.SendingESPID, req.CustomVMTA,
		req.HTMLContent, req.PlainContent, headersBytes,
		req.TrackOpens, req.TrackClicks, req.ListUnsubscribeHeader,
		req.ScheduledAt, req.HourlyLimit, req.BatchSize,
		status, userID,
	).Scan(&newID)
	if err != nil {
		return nil, fmt.Errorf("failed to create campaign: %w", err)
	}

	return s.GetByID(ctx, newID)
}

func (s *PostgresCampaignService) Update(ctx context.Context, id uuid.UUID, req UpdateCampaignRequest) (*Campaign, error) {
	current, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if current.Status != StatusDraft && current.Status != StatusScheduled && current.Status != StatusPaused {
		return nil, fmt.Errorf("%w: cannot edit campaign in %s status", ErrInvalidStatus, current.Status)
	}

	audBytes, err := json.Marshal(req.AudienceFilter)
	if err != nil {
		audBytes = []byte("{}")
	}

	headersBytes, err := json.Marshal(req.CustomHeaders)
	if err != nil {
		headersBytes = []byte("{}")
	}

	if req.BatchSize <= 0 {
		req.BatchSize = 500
	}
	if req.RoutingType == "" {
		req.RoutingType = RoutingFileSpool
	}

	query := `
		UPDATE campaigns SET
			name = $1, subject = $2, from_name = $3, from_email = $4, reply_to = $5,
			mail_list_id = $6, audience_filter = $7, routing_type = $8,
			sending_ip_pool_id = $9, sending_esp_id = $10, custom_vmta = $11,
			html_content = $12, plain_content = $13, custom_headers = $14,
			track_opens = $15, track_clicks = $16, list_unsubscribe_header = $17,
			scheduled_at = $18, hourly_limit = $19, batch_size = $20,
			updated_at = NOW()
		WHERE id = $21
	`
	_, err = s.db.Exec(ctx, query,
		req.Name, req.Subject, req.FromName, req.FromEmail, req.ReplyTo,
		req.MailListID, audBytes, req.RoutingType,
		req.SendingIPPoolID, req.SendingESPID, req.CustomVMTA,
		req.HTMLContent, req.PlainContent, headersBytes,
		req.TrackOpens, req.TrackClicks, req.ListUnsubscribeHeader,
		req.ScheduledAt, req.HourlyLimit, req.BatchSize,
		id,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update campaign: %w", err)
	}

	return s.GetByID(ctx, id)
}

func (s *PostgresCampaignService) Delete(ctx context.Context, id uuid.UUID) error {
	current, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if current.Status == StatusProcessing {
		return fmt.Errorf("%w: cannot delete an actively processing campaign; pause or cancel it first", ErrInvalidStatus)
	}

	_, err = s.db.Exec(ctx, "DELETE FROM campaigns WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete campaign: %w", err)
	}
	return nil
}

func (s *PostgresCampaignService) Launch(ctx context.Context, id uuid.UUID) (*Campaign, error) {
	current, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if current.Status != StatusDraft && current.Status != StatusScheduled && current.Status != StatusPaused {
		return nil, fmt.Errorf("%w: campaign cannot be launched from status %s", ErrInvalidStatus, current.Status)
	}

	// Calculate eligible recipient count
	est, err := s.EstimateAudience(ctx, current.MailListID, current.AudienceFilter)
	if err != nil {
		return nil, fmt.Errorf("failed to estimate audience: %w", err)
	}

	now := time.Now()
	query := `
		UPDATE campaigns SET
			status = 'queued',
			total_recipients = $1,
			started_at = COALESCE(started_at, $2),
			error_message = NULL,
			updated_at = NOW()
		WHERE id = $3
	`
	_, err = s.db.Exec(ctx, query, est.EligibleToSend, now, id)
	if err != nil {
		return nil, fmt.Errorf("failed to queue campaign: %w", err)
	}

	return s.GetByID(ctx, id)
}

func (s *PostgresCampaignService) Pause(ctx context.Context, id uuid.UUID) (*Campaign, error) {
	current, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if current.Status != StatusQueued && current.Status != StatusProcessing {
		return nil, fmt.Errorf("%w: cannot pause campaign in %s status", ErrInvalidStatus, current.Status)
	}

	_, err = s.db.Exec(ctx, "UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1", id)
	if err != nil {
		return nil, fmt.Errorf("failed to pause campaign: %w", err)
	}

	return s.GetByID(ctx, id)
}

func (s *PostgresCampaignService) Resume(ctx context.Context, id uuid.UUID) (*Campaign, error) {
	current, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if current.Status != StatusPaused {
		return nil, fmt.Errorf("%w: only paused campaigns can be resumed", ErrInvalidStatus)
	}

	_, err = s.db.Exec(ctx, "UPDATE campaigns SET status = 'queued', updated_at = NOW() WHERE id = $1", id)
	if err != nil {
		return nil, fmt.Errorf("failed to resume campaign: %w", err)
	}

	return s.GetByID(ctx, id)
}

func (s *PostgresCampaignService) Cancel(ctx context.Context, id uuid.UUID) (*Campaign, error) {
	current, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if current.Status == StatusCompleted || current.Status == StatusCancelled {
		return nil, fmt.Errorf("%w: campaign already finished or cancelled", ErrInvalidStatus)
	}

	_, err = s.db.Exec(ctx, "UPDATE campaigns SET status = 'cancelled', updated_at = NOW() WHERE id = $1", id)
	if err != nil {
		return nil, fmt.Errorf("failed to cancel campaign: %w", err)
	}

	return s.GetByID(ctx, id)
}

func (s *PostgresCampaignService) GetSummaryKPIs(ctx context.Context) (*CampaignSummaryKPIs, error) {
	var kpis CampaignSummaryKPIs

	query := `
		SELECT 
			COUNT(*),
			COUNT(*) FILTER (WHERE status IN ('queued', 'processing')),
			COALESCE(SUM(sent_count), 0),
			COUNT(*) FILTER (WHERE status = 'completed')
		FROM campaigns
	`
	err := s.db.QueryRow(ctx, query).Scan(
		&kpis.TotalCampaigns,
		&kpis.ActiveSending,
		&kpis.TotalSpooled,
		&kpis.CompletedCount,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch campaign KPIs: %w", err)
	}

	// Estimate average spool rate in last 24h
	var avgRate float64
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*)::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 3600.0, 1.0), 0.0)
		FROM campaign_logs
		WHERE created_at >= NOW() - INTERVAL '24 hours' AND status = 'spooled'
	`).Scan(&avgRate)
	kpis.AverageHourlyRate = avgRate

	return &kpis, nil
}

func (s *PostgresCampaignService) ListLogs(ctx context.Context, campaignID uuid.UUID, page, pageSize int) ([]CampaignLog, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	var total int64
	err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM campaign_logs WHERE campaign_id = $1", campaignID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count campaign logs: %w", err)
	}

	offset := (page - 1) * pageSize
	query := `
		SELECT id, campaign_id, contact_id, email, status, COALESCE(message_id, ''), COALESCE(file_path, ''), COALESCE(details, ''), created_at
		FROM campaign_logs
		WHERE campaign_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := s.db.Query(ctx, query, campaignID, pageSize, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query campaign logs: %w", err)
	}
	defer rows.Close()

	var logs []CampaignLog
	for rows.Next() {
		var l CampaignLog
		if err := rows.Scan(&l.ID, &l.CampaignID, &l.ContactID, &l.Email, &l.Status, &l.MessageID, &l.FilePath, &l.Details, &l.CreatedAt); err != nil {
			return nil, 0, err
		}
		logs = append(logs, l)
	}

	return logs, total, nil
}

func (s *PostgresCampaignService) Preview(ctx context.Context, req PreviewRequest) (*PreviewResponse, error) {
	sample := req.SampleContact
	if sample.Email == "" {
		sample.Email = "john.doe@example.com"
		sample.FirstName = "John"
		sample.LastName = "Doe"
		sample.City = "New York"
		sample.Country = "United States"
		sample.CountryCode = "US"
		sample.ID = uuid.New()
	}

	dummyCampaign := &Campaign{
		ID:                    uuid.New(),
		Subject:               req.Subject,
		FromName:              "Sample Sender",
		FromEmail:             "newsletter@stansiareco.local",
		HTMLContent:           req.HTMLContent,
		PlainContent:          req.PlainContent,
		CustomHeaders:         req.CustomHeaders,
		ListUnsubscribeHeader: true,
	}

	rawMIME, _, err := BuildMIMEMessage(dummyCampaign, &sample, "track.stansiareco.local")
	if err != nil {
		return nil, fmt.Errorf("failed to build MIME sample: %w", err)
	}

	renderedSubject := RenderMergeTags(req.Subject, &sample, "track.stansiareco.local")
	renderedHTML := RenderMergeTags(req.HTMLContent, &sample, "track.stansiareco.local")
	renderedPlain := RenderMergeTags(req.PlainContent, &sample, "track.stansiareco.local")

	renderedHeaders := make(map[string]string)
	for k, v := range req.CustomHeaders {
		renderedHeaders[k] = RenderMergeTags(v, &sample, "track.stansiareco.local")
	}

	return &PreviewResponse{
		RenderedSubject: renderedSubject,
		RenderedHTML:    renderedHTML,
		RenderedPlain:   renderedPlain,
		RenderedHeaders: renderedHeaders,
		RawMIMESample:   string(rawMIME),
	}, nil
}

func (s *PostgresCampaignService) TestSend(ctx context.Context, campaignID uuid.UUID, req TestSendRequest) (*CampaignLog, error) {
	campaign, err := s.GetByID(ctx, campaignID)
	if err != nil {
		return nil, err
	}

	recipient := strings.TrimSpace(req.RecipientEmail)
	if recipient == "" {
		recipient = "test@example.com"
	}

	testContact := req.SampleContact
	testContact.Email = recipient
	if testContact.ID == uuid.Nil {
		testContact.ID = uuid.New()
	}

	rawMIME, msgID, err := BuildMIMEMessage(campaign, &testContact, "track.stansiareco.local")
	if err != nil {
		return nil, fmt.Errorf("failed to build test MIME message: %w", err)
	}

	spoolPath, err := s.spooler.Spool(ctx, campaign, &testContact, rawMIME)
	if err != nil {
		return nil, fmt.Errorf("failed to spool test message: %w", err)
	}

	log := &CampaignLog{
		ID:         uuid.New(),
		CampaignID: campaign.ID,
		Email:      recipient,
		Status:     "spooled",
		MessageID:  msgID,
		FilePath:   spoolPath,
		Details:    "Immediate test send generated",
		CreatedAt:  time.Now(),
	}

	_, _ = s.db.Exec(ctx, `
		INSERT INTO campaign_logs (id, campaign_id, email, status, message_id, file_path, details, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
	`, log.ID, log.CampaignID, log.Email, log.Status, log.MessageID, log.FilePath, log.Details)

	return log, nil
}

func (s *PostgresCampaignService) EstimateAudience(ctx context.Context, listID uuid.UUID, filter AudienceFilter) (*AudienceEstimate, error) {
	var totalInList int64
	err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM contacts WHERE list_id = $1", listID).Scan(&totalInList)
	if err != nil {
		return nil, fmt.Errorf("failed to count contacts in list: %w", err)
	}

	whereClauses := []string{"c.list_id = $1"}
	args := []any{listID}
	argIdx := 2

	if filter.OnlyClean {
		whereClauses = append(whereClauses, "c.is_clean = true")
	}
	if filter.OnlyOpeners {
		whereClauses = append(whereClauses, "c.is_opener = true")
	}
	if filter.OnlyClickers {
		whereClauses = append(whereClauses, "c.is_clicker = true")
	}
	if filter.OnlySeeds {
		whereClauses = append(whereClauses, "c.is_seed = true")
	}
	if filter.ExcludeUnsubs {
		whereClauses = append(whereClauses, "c.is_unsub = false AND c.is_optout = false AND c.is_blacklisted = false AND c.is_hard_bounced = false")
	}
	if len(filter.CountryCodes) > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("c.country_code = ANY($%d)", argIdx))
		args = append(args, filter.CountryCodes)
		argIdx++
	}
	if len(filter.Verticals) > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("c.verticals && $%d", argIdx))
		args = append(args, filter.Verticals)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	var matchingCount int64
	matchingQuery := fmt.Sprintf("SELECT COUNT(*) FROM contacts c WHERE %s", whereSQL)
	if err := s.db.QueryRow(ctx, matchingQuery, args...).Scan(&matchingCount); err != nil {
		return nil, fmt.Errorf("failed to count matching contacts: %w", err)
	}

	// Calculate how many of those matching contacts are suppressed (global OR list-scoped)
	eligibleQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM contacts c
		WHERE %s
		AND NOT EXISTS (
			SELECT 1 FROM suppressions s
			WHERE s.email = c.email
			AND (s.list_id IS NULL OR s.list_id = c.list_id)
		)
	`, whereSQL)

	var eligibleCount int64
	if err := s.db.QueryRow(ctx, eligibleQuery, args...).Scan(&eligibleCount); err != nil {
		return nil, fmt.Errorf("failed to calculate eligible audience: %w", err)
	}

	suppressedCount := matchingCount - eligibleCount

	return &AudienceEstimate{
		TotalInList:     totalInList,
		MatchingFilter:  matchingCount,
		SuppressedCount: suppressedCount,
		EligibleToSend:  eligibleCount,
	}, nil
}

func (s *PostgresCampaignService) GetSpoolFiles(ctx context.Context, campaignID uuid.UUID) ([]SpoolFileInfo, error) {
	return s.spooler.GetCampaignSpoolFiles(ctx, campaignID)
}

func (s *PostgresCampaignService) ReadSpoolFile(ctx context.Context, campaignID uuid.UUID, fileName string) ([]byte, error) {
	return s.spooler.ReadSpoolFile(ctx, campaignID, fileName)
}

func (s *PostgresCampaignService) ArchiveSpool(ctx context.Context, campaignID uuid.UUID) (io.ReadCloser, int64, error) {
	return s.spooler.ArchiveSpool(ctx, campaignID)
}
