import { AppError, ErrorCategory, RawApiErrorResponse } from "./error-types";
import { adaptExternalProviderError } from "./provider-error-adapters";
import { sanitizeObject, sanitizeString } from "./sanitize";

export interface NormalizeErrorOptions {
  fallbackTitle?: string;
  fallbackMessage?: string;
  category?: ErrorCategory;
  retryAction?: () => void | Promise<void>;
  context?: string;
}

/**
 * Centrally normalizes any caught error into a structured, production-quality AppError.
 */
export function normalizeError(err: unknown, options?: NormalizeErrorOptions): AppError {
  const timestamp = new Date().toISOString();
  const id = `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Default values
  let code = "UNKNOWN_ERROR";
  let category: ErrorCategory = options?.category || "unknown";
  let title = options?.fallbackTitle || "An unexpected error occurred";
  let userMessage = options?.fallbackMessage || "An unexpected error occurred. Please try again.";
  let suggestedAction: string | undefined = "If the problem persists, contact your system administrator.";
  let statusCode: number | undefined;
  let requestId: string | undefined;
  let rawResponse: string | undefined;
  let retryable = false;

  // 1. Handle RTK Query / FetchBaseQueryError or Axios-style error
  if (err && typeof err === "object") {
    const errorObj = err as Record<string, unknown>;

    // RTK Query: status can be number or "FETCH_ERROR" / "PARSING_ERROR" / "TIMEOUT_ERROR"
    if ("status" in errorObj) {
      if (typeof errorObj.status === "number") {
        statusCode = errorObj.status;
      } else if (typeof errorObj.status === "string") {
        if (errorObj.status === "FETCH_ERROR" || errorObj.status === "TIMEOUT_ERROR") {
          category = "network";
          code = "NETWORK_ERROR";
          title = "Network Connection Failed";
          userMessage = "Could not connect to the StansiaReco backend API server.";
          suggestedAction = "Check your internet connection and ensure the backend server is running.";
          retryable = true;
        }
      }
    }

    // Extract raw payload data
    const data = errorObj.data as RawApiErrorResponse | undefined;
    if (data && typeof data === "object") {
      // Backend standard response: { error: { code: string, message: string } }
      if (data.error && typeof data.error === "object") {
        code = data.error.code || code;
        if (data.error.message) {
          rawResponse = String(data.error.message);
        }
      } else if (data.message && typeof data.message === "string") {
        rawResponse = data.message;
      }

      // Check for request ID if backend attached it
      if (data.request_id && typeof data.request_id === "string") {
        requestId = data.request_id;
      }
    } else if (typeof errorObj.data === "string") {
      rawResponse = errorObj.data;
    } else if (errorObj.error && typeof errorObj.error === "object") {
      const innerErr = errorObj.error as Record<string, unknown>;
      if (typeof innerErr.code === "string") {
        code = innerErr.code;
      }
      if (typeof innerErr.message === "string") {
        rawResponse = innerErr.message;
      }
    } else if (errorObj.message && typeof errorObj.message === "string") {
      rawResponse = errorObj.message;
    }
  } else if (typeof err === "string") {
    rawResponse = err;
  } else if (err instanceof Error) {
    rawResponse = err.message;
  }

  // Sanitize raw message and guard against stringified object representations
  if (rawResponse) {
    if (rawResponse === "[object Object]" || rawResponse.startsWith("[object Object]") || rawResponse === "Error: [object Object]") {
      rawResponse = options?.fallbackMessage || "An unexpected error occurred during execution.";
    } else {
      rawResponse = sanitizeString(rawResponse);
    }
  }

  // 2. Check Provider Adapters (e.g. Namecheap XML API)
  if (rawResponse) {
    const providerMatch = adaptExternalProviderError(rawResponse, statusCode, requestId);
    if (providerMatch.isProviderError && providerMatch.adaptedError) {
      const adapted = providerMatch.adaptedError;
      adapted.retryAction = options?.retryAction;
      return adapted;
    }
  }

  // 3. Map HTTP Status Codes
  if (statusCode) {
    switch (statusCode) {
      case 400:
        category = "validation";
        code = code === "UNKNOWN_ERROR" ? "BAD_REQUEST" : code;
        title = "Invalid Request";
        userMessage = rawResponse || "The requested operation could not be processed due to invalid parameters.";
        suggestedAction = "Please verify your input values and try again.";
        retryable = false;
        break;

      case 401:
        category = "authentication";
        code = "UNAUTHORIZED";
        title = "Authentication Required";
        userMessage = "Your session has expired or you are not authenticated.";
        suggestedAction = "Please sign in again to continue.";
        retryable = false;
        break;

      case 403:
        category = "authorization";
        code = "FORBIDDEN";
        title = "Access Denied";
        userMessage = rawResponse || "You do not have permission to perform this action.";
        suggestedAction = "Contact your administrator if you believe you should have access.";
        retryable = false;
        break;

      case 404:
        category = "notFound";
        code = "NOT_FOUND";
        title = "Resource Not Found";
        userMessage = rawResponse || "The requested resource could not be found.";
        suggestedAction = "The item may have been deleted or moved. Refresh the page to update your view.";
        retryable = false;
        break;

      case 409:
        category = "conflict";
        code = "RESOURCE_CONFLICT";
        title = "Resource Conflict";
        userMessage = rawResponse || "The action conflicts with an existing resource.";
        suggestedAction = "Ensure the name, IP, or identifier is unique before trying again.";
        retryable = false;
        break;

      case 422:
        category = "validation";
        code = "UNPROCESSABLE_ENTITY";
        title = "Validation Failed";
        userMessage = rawResponse || "The submitted information is invalid.";
        suggestedAction = "Review highlighted fields and correct formatting errors.";
        retryable = false;
        break;

      case 429:
        category = "rateLimit";
        code = "RATE_LIMITED";
        title = "Too Many Requests";
        userMessage = "You have exceeded the request rate limit.";
        suggestedAction = "Please wait a moment before trying again.";
        retryable = true;
        break;

      case 500:
      case 502:
      case 503:
      case 504:
        category = "server";
        code = code === "UNKNOWN_ERROR" ? "INTERNAL_SERVER_ERROR" : code;
        title = "Server Error";
        userMessage = rawResponse && !rawResponse.includes("SQL")
          ? rawResponse
          : "An unexpected server error occurred while processing your request.";
        suggestedAction = "Wait a few seconds and try again. If the issue persists, review server logs.";
        retryable = true;
        break;
    }
  } else if (rawResponse && category === "unknown") {
    // If not matching a status code, inspect message content
    if (/network|fetch|timeout|econnrefused/i.test(rawResponse)) {
      category = "network";
      code = "NETWORK_ERROR";
      title = "Connection Error";
      userMessage = "Unable to communicate with the server.";
      suggestedAction = "Check your network connection and verify the backend is running.";
      retryable = true;
    } else {
      userMessage = rawResponse;
    }
  }

  // Construct final AppError
  const appError: AppError = {
    id,
    code,
    category,
    title,
    userMessage,
    suggestedAction,
    technicalDetails: sanitizeObject({
      statusCode,
      requestId,
      rawResponse,
      endpoint: options?.context,
      timestamp,
    }),
    retryable,
    retryAction: options?.retryAction,
    timestamp,
  };

  return appError;
}
