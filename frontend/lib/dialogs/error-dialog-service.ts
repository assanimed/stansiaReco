import { AppError } from "../errors/error-types";
import { normalizeError } from "../errors/normalize-error";

export interface ErrorDialogOptions {
  onRetry?: () => void | Promise<void>;
  onClose?: () => void;
}

export interface ErrorDialogState {
  isOpen: boolean;
  error: AppError | null;
  onRetry?: () => void | Promise<void>;
  onClose?: () => void;
}

type Listener = () => void;

class ErrorDialogService {
  private state: ErrorDialogState = {
    isOpen: false,
    error: null,
  };
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ErrorDialogState => {
    return this.state;
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  show(err: unknown, options?: ErrorDialogOptions): void {
    let appError: AppError;
    if (err && typeof err === "object" && "category" in err && "userMessage" in err) {
      appError = err as AppError;
    } else {
      appError = normalizeError(err, { retryAction: options?.onRetry });
    }

    this.state = {
      isOpen: true,
      error: appError,
      onRetry: options?.onRetry || appError.retryAction,
      onClose: options?.onClose,
    };
    this.notify();
  }

  close(): void {
    const prevClose = this.state.onClose;
    this.state = {
      isOpen: false,
      error: null,
    };
    this.notify();
    if (prevClose) {
      prevClose();
    }
  }
}

export const errorDialogService = new ErrorDialogService();

export function showErrorDialog(err: unknown, options?: ErrorDialogOptions): void {
  errorDialogService.show(err, options);
}

export function closeErrorDialog(): void {
  errorDialogService.close();
}
