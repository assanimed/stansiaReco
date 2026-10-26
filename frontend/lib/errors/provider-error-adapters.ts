import { AppError } from "./error-types";
import { sanitizeString } from "./sanitize";

export interface ProviderErrorMatch {
  isProviderError: boolean;
  adaptedError?: AppError;
}

/**
 * Adapter specifically for Namecheap XML API responses.
 * Detects patterns like [1011150], [1011105], etc.
 */
export function adaptNamecheapError(
  rawMessage: string,
  statusCode?: number,
  requestId?: string
): ProviderErrorMatch {
  const sanitized = sanitizeString(rawMessage);

  // Check if this error originated from Namecheap
  const hasNamecheapMarker =
    sanitized.toLowerCase().includes("namecheap") ||
    /\[\d{7}\]/.test(sanitized);

  if (!hasNamecheapMarker) {
    return { isProviderError: false };
  }

  const timestamp = new Date().toISOString();
  const baseId = `namecheap-${Date.now()}`;

  // 1. IP Whitelist Failure: Error 1011150
  if (sanitized.includes("1011150") || sanitized.toLowerCase().includes("invalid request ip")) {
    // Extract rejected IP dynamically from message if present (e.g. "Invalid request IP: 41.92.118.244")
    let rejectedIP: string | undefined;
    const ipMatch = sanitized.match(/(?:Invalid request IP[:\s]+)([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i);
    if (ipMatch && ipMatch[1]) {
      rejectedIP = ipMatch[1];
    }

    return {
      isProviderError: true,
      adaptedError: {
        id: baseId,
        code: "NAMECHEAP_IP_NOT_WHITELISTED",
        category: "externalProvider",
        title: "Unable to synchronize registrar data",
        userMessage:
          "Namecheap rejected the API request because the server's public IP address is not authorized.",
        suggestedAction:
          "1. Verify the public outbound IP address of the backend server.\n" +
          "2. Log in to Namecheap -> Profile -> Tools -> Namecheap API Access -> Whitelisted IPs.\n" +
          "3. Add the server IP" + (rejectedIP ? ` (${rejectedIP})` : "") + " to your whitelist.\n" +
          "4. Allow up to 2 minutes for propagation, then retry synchronization.",
        technicalDetails: {
          provider: "Namecheap",
          providerErrorCode: "1011150",
          rejectedIP,
          requestId,
          statusCode,
          endpoint: "https://api.namecheap.com/xml.response",
          rawResponse: sanitized,
          timestamp,
        },
        retryable: true,
        timestamp,
      },
    };
  }

  // 2. ClientIp Parameter Malformed: Error 1011105
  if (sanitized.includes("1011105") || sanitized.toLowerCase().includes("parameter clientip is invalid")) {
    return {
      isProviderError: true,
      adaptedError: {
        id: baseId,
        code: "NAMECHEAP_INVALID_CLIENT_IP_PARAM",
        category: "externalProvider",
        title: "Invalid Client IP parameter for Namecheap",
        userMessage:
          "Namecheap rejected the client IP format specified in your provider settings.",
        suggestedAction:
          "Check the provider settings in Domains -> Domain Providers and ensure the whitelisted client IP is a valid IPv4 address.",
        technicalDetails: {
          provider: "Namecheap",
          providerErrorCode: "1011105",
          requestId,
          statusCode,
          rawResponse: sanitized,
          timestamp,
        },
        retryable: true,
        timestamp,
      },
    };
  }

  // 3. Authentication & Credential Failures: Codes 2011166, 2011280, 2011380
  if (
    sanitized.includes("2011166") ||
    sanitized.includes("2011280") ||
    sanitized.includes("2011380") ||
    sanitized.toLowerCase().includes("authentication failed") ||
    sanitized.toLowerCase().includes("api key")
  ) {
    return {
      isProviderError: true,
      adaptedError: {
        id: baseId,
        code: "NAMECHEAP_AUTH_FAILED",
        category: "authentication",
        title: "Namecheap authentication failed",
        userMessage:
          "Namecheap rejected the configured API User or API Key. Please verify your API credentials.",
        suggestedAction:
          "1. Go to Domains -> Domain Providers.\n" +
          "2. Edit your Namecheap configuration.\n" +
          "3. Verify your API Username, Account Username, and API Key from Namecheap Profile -> Tools -> API Access.\n" +
          "4. Run 'Test Connection' to verify credentials before syncing.",
        technicalDetails: {
          provider: "Namecheap",
          providerErrorCode: sanitized.match(/\[(\d{7})\]/)?.[1] || "AUTH_FAILED",
          requestId,
          statusCode,
          rawResponse: sanitized,
          timestamp,
        },
        retryable: false,
        timestamp,
      },
    };
  }

  // 4. Domain Not Found in Account: Error 2019166 / 2030166
  if (sanitized.includes("2019166") || sanitized.includes("2030166") || sanitized.toLowerCase().includes("domain not found")) {
    return {
      isProviderError: true,
      adaptedError: {
        id: baseId,
        code: "NAMECHEAP_DOMAIN_NOT_FOUND",
        category: "notFound",
        title: "Domain not associated with this Namecheap account",
        userMessage:
          "This domain was not found under the configured Namecheap account credentials.",
        suggestedAction:
          "Verify the spelling of the domain and confirm that it belongs to the Namecheap account configured under Domain Providers.",
        technicalDetails: {
          provider: "Namecheap",
          requestId,
          statusCode,
          rawResponse: sanitized,
          timestamp,
        },
        retryable: false,
        timestamp,
      },
    };
  }

  // 5. Generic Namecheap Error Fallback
  const codeMatch = sanitized.match(/\[(\d{7})\]/);
  const providerErrorCode = codeMatch ? codeMatch[1] : undefined;

  return {
    isProviderError: true,
    adaptedError: {
      id: baseId,
      code: providerErrorCode ? `NAMECHEAP_ERR_${providerErrorCode}` : "NAMECHEAP_API_ERROR",
      category: "externalProvider",
      title: "Namecheap registrar API error",
      userMessage: sanitized.replace(/^Namecheap API error:\s*/i, ""),
      suggestedAction:
        "Check your Namecheap provider configuration and network connectivity, then retry the operation.",
      technicalDetails: {
        provider: "Namecheap",
        providerErrorCode,
        requestId,
        statusCode,
        rawResponse: sanitized,
        timestamp,
      },
      retryable: true,
      timestamp,
    },
  };
}

/**
 * Adapter specifically for GoDaddy REST API responses (v1 & v3).
 * Detects GoDaddy error codes such as UNABLE_TO_AUTHENTICATE, ACCESS_DENIED,
 * NOT_FOUND, dns_record_not_mutable, INVALID_BODY, FAILED_RECORD_VALIDATION, TOO_MANY_REQUESTS.
 */
export function adaptGoDaddyError(
  rawMessage: string,
  statusCode?: number,
  requestId?: string
): ProviderErrorMatch {
  const sanitized = sanitizeString(rawMessage);
  const lower = sanitized.toLowerCase();

  const hasGoDaddyMarker =
    lower.includes("godaddy") ||
    sanitized.includes("UNABLE_TO_AUTHENTICATE") ||
    sanitized.includes("dns_record_not_mutable") ||
    sanitized.includes("FAILED_RECORD_VALIDATION");

  if (!hasGoDaddyMarker) {
    return { isProviderError: false };
  }

  const timestamp = new Date().toISOString();
  const baseId = `godaddy-${Date.now()}`;
  const codeMatch = sanitized.match(/\[([A-Za-z0-9_]+)\]/);
  const providerErrorCode = codeMatch ? codeMatch[1] : undefined;

  // 1. Authentication failure (401 UNABLE_TO_AUTHENTICATE /INVALID_TOKEN)
  if (
    providerErrorCode === "UNABLE_TO_AUTHENTICATE" ||
    lower.includes("unable to authenticate") ||
    lower.includes("authentication failed") ||
    statusCode === 401
  ) {
    return {
      isProviderError: true,
      adaptedError: {
        id: baseId,
        code: "GODADDY_AUTH_FAILED",
        category: "authentication",
        title: "GoDaddy API authentication failed",
        userMessage:
          "GoDaddy rejected the configured Personal Access Token (PAT) or API Key & Secret.",
        suggestedAction:
          "1. Go to Domains -> Domain Providers and edit your GoDaddy integration.\n" +
          "2. Ensure your Personal Access Token (PAT) or Classic API Key + Secret matches the selected environment (Production vs OTE Sandbox).\n" +
          "3. If using a PAT, verify it has not expired at https://developer.godaddy.com.\n" +
          "4. Click 'Test Connection' to verify your credentials.",
        technicalDetails: {
          provider: "GoDaddy",
          providerErrorCode: providerErrorCode || "UNABLE_TO_AUTHENTICATE",
          requestId,
          statusCode: statusCode || 401,
          endpoint: "https://api.godaddy.com",
          rawResponse: sanitized,
          timestamp,
        },
        retryable: false,
        timestamp,
      },
    };
  }

  // 2. Access Denied / Scope / Account Eligibility (403 ACCESS_DENIED / INSUFFICIENT_PERMISSIONS)
  if (
    providerErrorCode === "ACCESS_DENIED" ||
    providerErrorCode === "INSUFFICIENT_PERMISSIONS" ||
    lower.includes("access_denied") ||
    lower.includes("not authorized") ||
    statusCode === 403
  ) {
    return {
      isProviderError: true,
      adaptedError: {
        id: baseId,
        code: "GODADDY_ACCESS_DENIED",
        category: "externalProvider",
        title: "GoDaddy API access denied (permissions or account eligibility)",
        userMessage:
          "GoDaddy authenticated your credentials, but denied access to the Domains/DNS API.",
        suggestedAction:
          "1. If using a Personal Access Token (PAT), ensure it includes the scopes: 'domains.domain:read' and 'domains.dns:update'.\n" +
          "2. Note that GoDaddy requires accounts to meet API eligibility requirements (e.g., 10+ active domains or a Domain Discount Club plan) for production Domains/DNS API access.\n" +
          "3. If testing with OTE credentials, switch the provider Environment to 'OTE / Sandbox'.",
        technicalDetails: {
          provider: "GoDaddy",
          providerErrorCode: providerErrorCode || "ACCESS_DENIED",
          requestId,
          statusCode: statusCode || 403,
          endpoint: "https://api.godaddy.com",
          rawResponse: sanitized,
          timestamp,
        },
        retryable: false,
        timestamp,
      },
    };
  }

  // 3. Domain Not Found (404 NOT_FOUND / UNKNOWN_DOMAIN)
  if (
    providerErrorCode === "NOT_FOUND" ||
    providerErrorCode === "UNKNOWN_DOMAIN" ||
    lower.includes("domain not found") ||
    statusCode === 404
  ) {
    return {
      isProviderError: true,
      adaptedError: {
        id: baseId,
        code: "GODADDY_DOMAIN_NOT_FOUND",
        category: "notFound",
        title: "Domain not found in this GoDaddy account",
        userMessage:
          "This domain was not found in the configured GoDaddy account or DNS zone.",
        suggestedAction:
          "Verify that the domain is active under the same GoDaddy shopper account as your API credentials and that its DNS zone is hosted on GoDaddy.",
        technicalDetails: {
          provider: "GoDaddy",
          providerErrorCode: providerErrorCode || "NOT_FOUND",
          requestId,
          statusCode: statusCode || 404,
          rawResponse: sanitized,
          timestamp,
        },
        retryable: false,
        timestamp,
      },
    };
  }

  // 4. Rate Limit Exceeded (429 TOO_MANY_REQUESTS)
  if (providerErrorCode === "TOO_MANY_REQUESTS" || statusCode === 429) {
    return {
      isProviderError: true,
      adaptedError: {
        id: baseId,
        code: "GODADDY_RATE_LIMITED",
        category: "externalProvider",
        title: "GoDaddy API rate limit reached",
        userMessage:
          "GoDaddy limits API requests to 60 requests per minute per endpoint.",
        suggestedAction:
          "Wait 30–60 seconds and retry the synchronization.",
        technicalDetails: {
          provider: "GoDaddy",
          providerErrorCode: "TOO_MANY_REQUESTS",
          requestId,
          statusCode: 429,
          rawResponse: sanitized,
          timestamp,
        },
        retryable: true,
        timestamp,
      },
    };
  }

  // 5. Generic GoDaddy API Error Fallback
  return {
    isProviderError: true,
    adaptedError: {
      id: baseId,
      code: providerErrorCode ? `GODADDY_ERR_${providerErrorCode}` : "GODADDY_API_ERROR",
      category: "externalProvider",
      title: "GoDaddy registrar API error",
      userMessage: sanitized.replace(/^GoDaddy API error:\s*/i, ""),
      suggestedAction:
        "Review the GoDaddy error details, verify your DNS record values (TTL must be 600–86400s), and retry.",
      technicalDetails: {
        provider: "GoDaddy",
        providerErrorCode,
        requestId,
        statusCode,
        rawResponse: sanitized,
        timestamp,
      },
      retryable: true,
      timestamp,
    },
  };
}

/**
 * Main registry that delegates to provider adapters.
 */
export function adaptExternalProviderError(
  rawMessage: string,
  statusCode?: number,
  requestId?: string
): ProviderErrorMatch {
  // Check Namecheap
  const nc = adaptNamecheapError(rawMessage, statusCode, requestId);
  if (nc.isProviderError) {
    return nc;
  }

  // Check GoDaddy
  const gd = adaptGoDaddyError(rawMessage, statusCode, requestId);
  if (gd.isProviderError) {
    return gd;
  }

  return { isProviderError: false };
}
