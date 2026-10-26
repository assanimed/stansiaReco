package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stansiareco/backend/internal/campaigns"
	"stansiareco/backend/internal/config"
	"stansiareco/backend/internal/database"
	"stansiareco/backend/internal/lists"
	"stansiareco/backend/internal/observability"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	logger := observability.SetupLogger(cfg.LogLevel)
	logger.Info("Starting StansiaReco Background Worker", "env", cfg.Environment)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dbPool, err := database.NewPool(ctx, cfg)
	if err != nil {
		logger.Error("Worker failed to connect to PostgreSQL", "error", err)
		os.Exit(1)
	}
	defer dbPool.Close()

	listService := lists.NewPostgresListService(dbPool)
	campaignSpooler := campaigns.NewFileDeliverySpooler(cfg.SpoolDir)
	logger.Info("Worker connected to database, ready to claim jobs and campaigns")

	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// 1. Process any claimable import jobs
			for {
				job, err := listService.GetClaimableImportJob(ctx)
				if err != nil {
					logger.Error("Error checking for claimable import jobs", "error", err)
					break
				}
				if job == nil {
					break // Queue is clear
				}

				logger.Info("Claimed CSV import job",
					"job_id", job.ID,
					"list_id", job.ListID,
					"file", job.Filename,
					"strategy", job.DuplicateStrategy,
				)

				processErr := lists.ProcessCSVImportJob(ctx, dbPool, job)
				if processErr != nil {
					logger.Error("Failed to process CSV import job", "job_id", job.ID, "error", processErr)
				} else {
					logger.Info("Finished processing CSV import job",
						"job_id", job.ID,
						"processed", job.ProcessedRows,
						"inserted", job.InsertedRows,
						"updated", job.UpdatedRows,
						"duplicates", job.DuplicateRows,
						"invalid", job.InvalidRows,
						"suppressed", job.SuppressedRows,
					)
				}

				if err := listService.SaveImportJobResults(ctx, job); err != nil {
					logger.Error("Failed to save import job results", "job_id", job.ID, "error", err)
				}
			}

			// 2. Process any claimable campaigns
			for {
				campaign, err := campaigns.ClaimNextCampaign(ctx, dbPool)
				if err != nil {
					logger.Error("Error checking for claimable campaigns", "error", err)
					break
				}
				if campaign == nil {
					break // No pending campaigns
				}

				logger.Info("Claimed campaign for message dispatching",
					"campaign_id", campaign.ID,
					"name", campaign.Name,
					"mail_list_id", campaign.MailListID,
					"routing", campaign.RoutingType,
				)

				// Dispatch batches until finished or paused
				for {
					finished, batchErr := campaigns.ProcessCampaignBatch(ctx, dbPool, campaignSpooler, campaign, logger)
					if batchErr != nil {
						logger.Error("Error dispatching campaign batch", "campaign_id", campaign.ID, "error", batchErr)
						break
					}
					if finished {
						break
					}
				}
			}
		case sig := <-shutdownChan:
			logger.Info("Worker received shutdown signal", "signal", sig.String())
			return
		case <-ctx.Done():
			return
		}
	}
}
