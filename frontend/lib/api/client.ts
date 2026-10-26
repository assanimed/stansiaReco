export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiException extends Error {
  constructor(
    public status: number,
    public error: ApiError
  ) {
    super(error.message);
    this.name = "ApiException";
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  // Attach token from localStorage if present
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("sr_token");
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let errorData: ApiError;
    try {
      const json = await response.json();
      errorData = json.error || {
        code: `HTTP_${response.status}`,
        message: json.message || response.statusText,
      };
    } catch {
      errorData = {
        code: `HTTP_${response.status}`,
        message: response.statusText || "An unexpected error occurred",
      };
    }

    // Auto-handle 401 Unauthorized by clearing session and redirecting to /login
    if (response.status === 401 && typeof window !== "undefined") {
      if (!window.location.pathname.startsWith("/login")) {
        localStorage.removeItem("sr_token");
        localStorage.removeItem("sr_user");
        document.cookie = "sr_auth=; path=/; max-age=0; SameSite=Lax";
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = `/login?callbackUrl=${encodeURIComponent(currentPath)}`;
      }
    }

    throw new ApiException(response.status, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
