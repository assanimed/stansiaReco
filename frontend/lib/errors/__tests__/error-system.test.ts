import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sanitizeString, sanitizeObject } from "../sanitize";
import { adaptExternalProviderError, adaptNamecheapError } from "../provider-error-adapters";
import { normalizeError } from "../normalize-error";
import { notificationStore, notify } from "../../notifications/notification-store";
import { confirmDialogService, confirmAction } from "../../dialogs/confirm-dialog-service";

describe("Sanitization Service", () => {
  it("redacts sensitive bearer tokens and api keys from strings", () => {
    const raw = "Request failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret and ApiKey=56b4c87ef4fd49cb96d915c0db68194";
    const cleaned = sanitizeString(raw);
    assert.doesNotMatch(cleaned, /56b4c87ef4fd49cb96d915c0db68194/);
    assert.match(cleaned, /\[REDACTED\]/);
  });

  it("redacts SSH private keys", () => {
    const rawKey = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0m...\n-----END RSA PRIVATE KEY-----";
    const cleaned = sanitizeString(rawKey);
    assert.strictEqual(cleaned, "[PRIVATE KEY REDACTED]");
  });

  it("redacts sensitive fields in payload objects", () => {
    const payload = {
      user: "admin@example.com",
      password: "SuperSecretPassword123!",
      api_key: "nc_key_99887766",
      nested: {
        token: "tok_secret_12345",
        normalField: "visible",
      },
    };
    const sanitized = sanitizeObject(payload) as any;
    assert.strictEqual(sanitized.user, "admin@example.com");
    assert.strictEqual(sanitized.password, "[REDACTED]");
    assert.strictEqual(sanitized.api_key, "[REDACTED]");
    assert.strictEqual(sanitized.nested.token, "[REDACTED]");
    assert.strictEqual(sanitized.nested.normalField, "visible");
  });
});

describe("Namecheap Provider Error Adapter", () => {
  it("correctly identifies and adapts Namecheap IP Whitelist Error 1011150", () => {
    const rawMsg = "Namecheap API error: [1011150] Invalid request IP: 41.92.118.244 — Please add this IP address to your Whitelisted IPs in Namecheap.";
    const result = adaptNamecheapError(rawMsg);

    assert.strictEqual(result.isProviderError, true);
    assert.ok(result.adaptedError);
    assert.strictEqual(result.adaptedError.category, "externalProvider");
    assert.strictEqual(result.adaptedError.code, "NAMECHEAP_IP_NOT_WHITELISTED");
    assert.strictEqual(result.adaptedError.technicalDetails?.rejectedIP, "41.92.118.244");
    assert.ok(result.adaptedError.suggestedAction?.includes("41.92.118.244"));
  });

  it("adapts Namecheap authentication failure 2011166", () => {
    const rawMsg = "Namecheap API error: [2011166] User is not authorized";
    const result = adaptNamecheapError(rawMsg);

    assert.strictEqual(result.isProviderError, true);
    assert.ok(result.adaptedError);
    assert.strictEqual(result.adaptedError.category, "authentication");
    assert.strictEqual(result.adaptedError.code, "NAMECHEAP_AUTH_FAILED");
  });

  it("falls back to generic external service error for unknown codes", () => {
    const rawMsg = "Namecheap API error: [9999999] An unexpected vendor problem occurred";
    const result = adaptExternalProviderError(rawMsg);

    assert.strictEqual(result.isProviderError, true);
    assert.ok(result.adaptedError);
    assert.strictEqual(result.adaptedError.category, "externalProvider");
    assert.strictEqual(result.adaptedError.code, "NAMECHEAP_ERR_9999999");
  });
});

describe("Unified Error Normalization", () => {
  it("normalizes HTTP 401 to authentication AppError", () => {
    const rtkError = {
      status: 401,
      data: { error: { message: "Invalid session or expired credentials" } },
    };
    const appError = normalizeError(rtkError);

    assert.strictEqual(appError.category, "authentication");
    assert.strictEqual(appError.code, "UNAUTHORIZED");
  });

  it("normalizes HTTP 404 to notFound AppError", () => {
    const rtkError = {
      status: 404,
      data: { error: { message: "DNS Zone not found" } },
    };
    const appError = normalizeError(rtkError);

    assert.strictEqual(appError.category, "notFound");
    assert.strictEqual(appError.code, "NOT_FOUND");
  });

  it("normalizes HTTP 429 to rateLimit AppError", () => {
    const rtkError = {
      status: 429,
      data: { message: "Too many requests" },
    };
    const appError = normalizeError(rtkError);

    assert.strictEqual(appError.category, "rateLimit");
    assert.strictEqual(appError.code, "RATE_LIMITED");
    assert.strictEqual(appError.retryable, true);
  });

  it("normalizes Namecheap error inside API payload", () => {
    const rtkError = {
      status: 502,
      data: {
        error: {
          message: "Namecheap API error: [1011150] Invalid request IP: 41.92.118.244 — Please add this IP address to your Whitelisted IPs in Namecheap.",
        },
      },
    };
    const appError = normalizeError(rtkError);

    assert.strictEqual(appError.category, "externalProvider");
    assert.strictEqual(appError.code, "NAMECHEAP_IP_NOT_WHITELISTED");
    assert.strictEqual(appError.technicalDetails?.rejectedIP, "41.92.118.244");
  });

  it("safely normalizes direct error objects without [object Object]", () => {
    const rawObj = {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    };
    const appError = normalizeError(rawObj);

    assert.strictEqual(appError.code, "UNAUTHORIZED");
    assert.strictEqual(appError.userMessage, "Authentication required");
    assert.notStrictEqual(appError.userMessage, "[object Object]");
  });

  it("replaces [object Object] string with clean fallback message", () => {
    const badError = new Error("[object Object]");
    const appError = normalizeError(badError, {
      fallbackMessage: "Script execution failed.",
    });

    assert.strictEqual(appError.userMessage, "Script execution failed.");
    assert.notStrictEqual(appError.userMessage, "[object Object]");
  });
});

describe("Notification Store", () => {
  it("adds and dismisses notifications", () => {
    const id = notify.success("Test success message");
    const snapshot1 = notificationStore.getSnapshot();
    const found = snapshot1.find((n) => n.id === id);
    assert.ok(found);
    assert.strictEqual(found.type, "success");
    assert.strictEqual(found.message, "Test success message");

    notify.dismiss(id);
    const snapshot2 = notificationStore.getSnapshot();
    assert.strictEqual(snapshot2.find((n) => n.id === id), undefined);
  });

  it("supports loading state and programmatic updates", () => {
    const loadId = notify.loading("Syncing DNS records...");
    let snapshot = notificationStore.getSnapshot();
    let item = snapshot.find((n) => n.id === loadId);
    assert.ok(item);
    assert.strictEqual(item.type, "loading");

    notify.update(loadId, {
      type: "success",
      title: "DNS Synced",
      message: "Records successfully updated.",
    });

    snapshot = notificationStore.getSnapshot();
    item = snapshot.find((n) => n.id === loadId);
    assert.ok(item);
    assert.strictEqual(item.type, "success");
    assert.strictEqual(item.title, "DNS Synced");

    notify.dismiss(loadId);
  });

  it("deduplicates identical error messages when deduplicate option is provided", () => {
    notificationStore.clearAll();
    const id1 = notify.error("Duplicate failure test", { deduplicate: true });
    const id2 = notify.error("Duplicate failure test", { deduplicate: true });

    const snapshot = notificationStore.getSnapshot();
    assert.strictEqual(id1, id2);
    assert.strictEqual(snapshot.length, 1);
    notificationStore.clearAll();
  });
});

describe("Confirm Dialog Service", () => {
  it("resolves true when confirmed", async () => {
    const promise = confirmAction({
      title: "Delete Item",
      message: "Are you sure you want to delete this?",
      confirmText: "Delete",
    });

    const state = confirmDialogService.getSnapshot();
    assert.strictEqual(state.isOpen, true);
    assert.strictEqual(state.title, "Delete Item");

    confirmDialogService.resolve(true);
    const result = await promise;
    assert.strictEqual(result, true);
    assert.strictEqual(confirmDialogService.getSnapshot().isOpen, false);
  });

  it("resolves false when cancelled", async () => {
    const promise = confirmAction({
      title: "Cancel Operation",
      message: "Cancel this action?",
    });

    confirmDialogService.resolve(false);
    const result = await promise;
    assert.strictEqual(result, false);
  });
});
