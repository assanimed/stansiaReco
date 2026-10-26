export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "notFound"
  | "conflict"
  | "rateLimit"
  | "server"
  | "network"
  | "externalProvider"
  | "unknown";

export interface TechnicalDetails {
  provider?: string;
  providerErrorCode?: string;
  rejectedIP?: string;
  requestId?: string;
  statusCode?: number;
  rawResponse?: string;
  endpoint?: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface AppError {
  id: string;
  code: string;
  category: ErrorCategory;
  title: string;
  userMessage: string;
  suggestedAction?: string;
  technicalDetails?: TechnicalDetails;
  retryable: boolean;
  retryAction?: () => void | Promise<void>;
  timestamp: string;
}

export interface RawApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
  status?: number;
  [key: string]: unknown;
}
