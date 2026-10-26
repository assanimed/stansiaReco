export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  cancelText?: string;
  variant?: "destructive" | "warning" | "default";
  isDestructive?: boolean;
  verificationText?: string; // Optional: user must type this exact string to confirm
  verificationPlaceholder?: string;
}

export interface ConfirmDialogState extends ConfirmOptions {
  isOpen: boolean;
  resolve?: (value: boolean) => void;
}

type Listener = () => void;

class ConfirmDialogService {
  private state: ConfirmDialogState = {
    isOpen: false,
    title: "",
    message: "",
  };
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ConfirmDialogState => {
    return this.state;
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  confirm(options: ConfirmOptions): Promise<boolean> {
    const isDestructive = options.isDestructive || options.variant === "destructive";
    const variant = options.variant || (isDestructive ? "destructive" : "default");
    const confirmLabel = options.confirmLabel || options.confirmText || (variant === "destructive" ? "Delete" : "Confirm");
    const cancelLabel = options.cancelLabel || options.cancelText || "Cancel";

    return new Promise<boolean>((resolve) => {
      this.state = {
        ...options,
        variant,
        confirmLabel,
        cancelLabel,
        isOpen: true,
        resolve,
      };
      this.notify();
    });
  }

  resolve(value: boolean) {
    if (value) {
      this.handleConfirm();
    } else {
      this.handleCancel();
    }
  }

  handleConfirm() {
    if (this.state.resolve) {
      this.state.resolve(true);
    }
    this.close();
  }

  handleCancel() {
    if (this.state.resolve) {
      this.state.resolve(false);
    }
    this.close();
  }

  private close() {
    this.state = {
      isOpen: false,
      title: "",
      message: "",
    };
    this.notify();
  }
}

export const confirmDialogService = new ConfirmDialogService();

/**
 * Global promise-based confirmation utility replacing native window.confirm()
 *
 * Example:
 * const ok = await confirmAction({
 *   title: "Remove Domain",
 *   message: `Are you sure you want to remove "${name}"?`,
 *   variant: "destructive"
 * });
 * if (!ok) return;
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return confirmDialogService.confirm(options);
}
