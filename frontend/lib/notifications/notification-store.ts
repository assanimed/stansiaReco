import {
  CreateNotificationOptions,
  NotificationItem,
  NotificationOptions,
} from "./notification-types";
import { AppError } from "../errors/error-types";
import { normalizeError } from "../errors/normalize-error";
import { errorReporter } from "../errors/error-reporter";
import { showErrorDialog } from "../dialogs/error-dialog-service";

type Listener = () => void;

class NotificationStore {
  private notifications: NotificationItem[] = [];
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private maxVisible = 6;

  /**
   * Subscribe to notification changes (for React useSyncExternalStore).
   */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Snapshot getter for useSyncExternalStore.
   */
  getSnapshot = (): NotificationItem[] => {
    return this.notifications;
  };

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Base notification dispatcher.
   */
  notify(options: CreateNotificationOptions): string {
    let id = options.id || options.key || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const createdAt = Date.now();

    // Default durations:
    // Success / Info: 4000ms
    // Warning: 6000ms
    // Error: 9000ms (or 0 if critical)
    // Loading: 0 (persistent until updated/dismissed)
    let duration = options.duration;
    if (duration === undefined) {
      switch (options.type) {
        case "success":
        case "info":
          duration = 4000;
          break;
        case "warning":
          duration = 6000;
          break;
        case "error":
          duration = 9000;
          break;
        case "loading":
          duration = 0; // persistent
          break;
      }
    }

    const dedupKey = options.key || (options.deduplicate ? `${options.type}:${options.message}` : undefined);

    const item: NotificationItem = {
      ...options,
      id,
      key: dedupKey,
      duration,
      dismissible: options.dismissible !== undefined ? options.dismissible : true,
      createdAt,
    };

    // If an existing item with the same key/id exists, update it in place (deduplication)
    const existingIndex = this.notifications.findIndex(
      (n) => n.id === id || (dedupKey && (n.key === dedupKey || (options.deduplicate && n.type === options.type && n.message === options.message)))
    );

    if (existingIndex >= 0) {
      const existingId = this.notifications[existingIndex].id;
      // Clear previous timer if any
      this.clearTimer(existingId);
      item.id = existingId;
      this.notifications[existingIndex] = item;
      id = existingId;
    } else {
      // Prepend or append to stack
      this.notifications = [item, ...this.notifications].slice(0, this.maxVisible);
    }

    this.notifyListeners();

    // Start auto-dismiss timer if duration > 0
    if (duration && duration > 0) {
      this.startTimer(id, duration);
    }

    return id;
  }

  success(message: string, options?: NotificationOptions): string {
    return this.notify({
      ...options,
      type: "success",
      message,
    });
  }

  warning(message: string, options?: NotificationOptions): string {
    return this.notify({
      ...options,
      type: "warning",
      message,
    });
  }

  info(message: string, options?: NotificationOptions): string {
    return this.notify({
      ...options,
      type: "info",
      message,
    });
  }

  /**
   * Dispatches an error notification. If the error is high-severity or Namecheap IP rejection,
   * it offers an actionable "View Details" button that opens the ErrorDialog.
   */
  error(err: unknown, options?: NotificationOptions & { openDialog?: boolean }): string {
    let appError: AppError;
    if (err && typeof err === "object" && "category" in err && "userMessage" in err) {
      appError = err as AppError;
    } else {
      appError = normalizeError(err, {
        fallbackTitle: options?.title,
        fallbackMessage: options?.fallbackMessage || (typeof err === "string" ? err : undefined),
      });
    }

    // Report error to telemetry
    errorReporter.report(appError);

    // If caller specifically requested modal or if it's a provider IP whitelist block:
    if (options?.openDialog || appError.code === "NAMECHEAP_IP_NOT_WHITELISTED") {
      showErrorDialog(appError);
    }

    return this.notify({
      ...options,
      type: "error",
      title: options?.title || appError.title,
      message: appError.userMessage,
      suggestedAction: appError.suggestedAction,
      duration: options?.duration ?? (appError.category === "externalProvider" ? 10000 : 8000),
      action: options?.action || {
        label: "View details",
        onClick: () => {
          showErrorDialog(appError);
        },
      },
    });
  }

  loading(message: string, options?: NotificationOptions): string {
    return this.notify({
      ...options,
      type: "loading",
      message,
      duration: 0, // Loading is persistent until updated or dismissed
    });
  }

  /**
   * Programmatically update an active notification (e.g. from loading to success or error).
   */
  update(id: string, updates: Partial<NotificationItem>): void {
    const index = this.notifications.findIndex((n) => n.id === id);
    if (index === -1) return;

    this.clearTimer(id);

    const existing = this.notifications[index];
    const updated: NotificationItem = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: Date.now(),
    };

    // If updated to success/info/error and no duration set, apply defaults
    let duration = updates.duration;
    if (duration === undefined) {
      if (updated.type === "success" || updated.type === "info") {
        duration = 4000;
      } else if (updated.type === "warning") {
        duration = 6000;
      } else if (updated.type === "error") {
        duration = 8000;
      }
    }
    updated.duration = duration;

    this.notifications[index] = updated;
    this.notifyListeners();

    if (duration && duration > 0) {
      this.startTimer(id, duration);
    }
  }

  dismiss(id: string): void {
    this.clearTimer(id);
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notifyListeners();
  }

  clearAll(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.notifications = [];
    this.notifyListeners();
  }

  // Timer helpers for hover pause / resume
  pause(id: string): void {
    this.clearTimer(id);
  }

  resume(id: string): void {
    const item = this.notifications.find((n) => n.id === id);
    if (item && item.duration && item.duration > 0) {
      this.startTimer(id, Math.min(item.duration, 4000));
    }
  }

  private startTimer(id: string, ms: number) {
    this.clearTimer(id);
    const timer = setTimeout(() => {
      this.dismiss(id);
    }, ms);
    this.timers.set(id, timer);
  }

  private clearTimer(id: string) {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}

export const notificationStore = new NotificationStore();

/**
 * Convenient global notify API matching developer ergonomic guidelines:
 * notify.success(...), notify.error(...), notify.warning(...), notify.info(...), notify.loading(...)
 */
export const notify = {
  success: (msg: string, opts?: NotificationOptions) => notificationStore.success(msg, opts),
  warning: (msg: string, opts?: NotificationOptions) => notificationStore.warning(msg, opts),
  info: (msg: string, opts?: NotificationOptions) => notificationStore.info(msg, opts),
  error: (err: unknown, opts?: NotificationOptions & { openDialog?: boolean }) =>
    notificationStore.error(err, opts),
  loading: (msg: string, opts?: NotificationOptions) => notificationStore.loading(msg, opts),
  update: (id: string, updates: Partial<NotificationItem>) => notificationStore.update(id, updates),
  dismiss: (id: string) => notificationStore.dismiss(id),
  clearAll: () => notificationStore.clearAll(),
};
