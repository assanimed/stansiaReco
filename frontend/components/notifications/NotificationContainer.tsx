"use client";

import React, { useSyncExternalStore } from "react";
import { notificationStore } from "@/lib/notifications/notification-store";
import { NotificationItem as NotificationItemType } from "@/lib/notifications/notification-types";
import { NotificationItem } from "./NotificationItem";

const EMPTY_NOTIFICATIONS: NotificationItemType[] = [];
const getServerSnapshot = () => EMPTY_NOTIFICATIONS;

export function NotificationContainer() {
  const notifications = useSyncExternalStore(
    notificationStore.subscribe,
    notificationStore.getSnapshot,
    getServerSnapshot
  );

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse sm:flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0"
    >
      {notifications.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <NotificationItem item={item} />
        </div>
      ))}
    </div>
  );
}
