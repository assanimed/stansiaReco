import { AppError } from "./error-types";
import { sanitizeObject } from "./sanitize";

export interface ErrorReportContext {
  route?: string;
  operation?: string;
  userId?: string;
  additionalInfo?: Record<string, unknown>;
}

class ErrorReporter {
  private recentErrorFingerprints = new Map<string, number>();
  private readonly deduplicationWindowMs = 3000;

  /**
   * Generates a fingerprint to prevent spamming duplicate errors within a short window.
   */
  private getFingerprint(error: AppError, context?: ErrorReportContext): string {
    return `${error.code}:${error.userMessage}:${context?.operation || ""}:${context?.route || ""}`;
  }

  /**
   * Reports an application error safely to console and external providers.
   */
  report(error: AppError, context?: ErrorReportContext): void {
    const fingerprint = this.getFingerprint(error, context);
    const now = Date.now();
    const lastReported = this.recentErrorFingerprints.get(fingerprint);

    if (lastReported && now - lastReported < this.deduplicationWindowMs) {
      // Deduplicate - skip spam
      return;
    }
    this.recentErrorFingerprints.set(fingerprint, now);

    // Clean up old fingerprints
    if (this.recentErrorFingerprints.size > 100) {
      for (const [k, v] of this.recentErrorFingerprints.entries()) {
        if (now - v > this.deduplicationWindowMs) {
          this.recentErrorFingerprints.delete(k);
        }
      }
    }

    const payload = sanitizeObject({
      id: error.id,
      code: error.code,
      category: error.category,
      title: error.title,
      userMessage: error.userMessage,
      technicalDetails: error.technicalDetails,
      context: {
        route: context?.route || (typeof window !== "undefined" ? window.location.pathname : undefined),
        operation: context?.operation,
        userId: context?.userId,
        timestamp: error.timestamp,
        ...context?.additionalInfo,
      },
    });

    // In development or test, log structured error to console
    if (process.env.NODE_ENV !== "production") {
      console.error("[StansiaReco ErrorReporter]", payload);
    }

    // Extension point: Forward to Sentry, Datadog, or external webhook in production
    // e.g.:
    // if (typeof window !== 'undefined' && (window as any).Sentry) {
    //   (window as any).Sentry.captureException(new Error(error.userMessage), { extra: payload });
    // }
  }
}

export const errorReporter = new ErrorReporter();
