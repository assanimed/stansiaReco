export type NotificationType = "success" | "error" | "warning" | "info" | "loading";

export interface NotificationAction {
  label: string;
  onClick: (id: string) => void | Promise<void>;
  variant?: "primary" | "secondary" | "outline";
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title?: string;
  message: string;
  suggestedAction?: string;
  technicalDetails?: string;
  duration?: number; // In milliseconds. 0 or undefined for persistent / manual dismiss
  dismissible?: boolean;
  action?: NotificationAction;
  progress?: number; // 0 to 100 for loading progress
  key?: string; // Optional deduplication / update key
  createdAt: number;
}

export type CreateNotificationOptions = Omit<NotificationItem, "id" | "createdAt"> & {
  id?: string;
  deduplicate?: boolean;
};

export type NotificationOptions = Omit<CreateNotificationOptions, "type" | "message"> & {
  fallbackMessage?: string;
};
