/**
 * Utilities to sanitize error messages and technical payloads,
 * ensuring no API keys, secrets, tokens, or private keys leak to UI or logs.
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /api[_-]?key/i,
  /token/i,
  /bearer/i,
  /authorization/i,
  /private[_-]?key/i,
  /credentials/i,
  /session/i,
];

const SECRET_VALUE_PATTERNS = [
  // Bearer tokens
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // Hex encryption keys (32+ chars)
  /\b[0-9a-fA-F]{32,64}\b/g,
  // SSH Private Key markers
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
  // Generic ApiKey URL params: ApiKey=xxxxx
  /ApiKey=[^&\s]+/gi,
  // Password URL params: password=xxxxx
  /password=[^&\s]+/gi,
];

/**
 * Redacts secrets from string messages or URLs.
 */
export function sanitizeString(input: string): string {
  if (!input) return "";

  let result = input;

  // Redact known pattern values
  result = result.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]");
  result = result.replace(/ApiKey=[^&\s]+/gi, "ApiKey=[REDACTED]");
  result = result.replace(/password=[^&\s]+/gi, "password=[REDACTED]");
  result = result.replace(
    /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
    "[PRIVATE KEY REDACTED]"
  );

  return result;
}

/**
 * Deeply sanitizes an object or array by redacting sensitive keys.
 */
export function sanitizeObject<T>(obj: T): T {
  if (!obj || typeof obj !== "object") {
    if (typeof obj === "string") {
      return sanitizeString(obj) as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitiveKey) {
      clean[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      clean[key] = sanitizeString(value);
    } else if (typeof value === "object" && value !== null) {
      clean[key] = sanitizeObject(value);
    } else {
      clean[key] = value;
    }
  }

  return clean as T;
}
