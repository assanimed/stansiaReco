"use client";

import React from "react";
import { ReduxProvider } from "@/lib/store/provider";
import { NotificationContainer } from "./notifications/NotificationContainer";
import { ErrorDialog } from "./dialogs/ErrorDialog";
import { ConfirmDialog } from "./dialogs/ConfirmDialog";
import { ErrorBoundary } from "./errors/ErrorBoundary";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ReduxProvider>
      <ErrorBoundary>
        {children}
        <NotificationContainer />
        <ErrorDialog />
        <ConfirmDialog />
      </ErrorBoundary>
    </ReduxProvider>
  );
}

