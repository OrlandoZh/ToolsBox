/**
 * Utils 模块类型定义
 */

import { Logger, I18n, UIFactory } from "./core";

// ========== Dialog ==========

export interface DialogBuilderOptions {
  logger?: Logger;
  uiFactory?: UIFactory;
  i18n?: I18n;
  services?: unknown;
}

export interface CustomDialogOptions {
  title?: string;
  content?: string;
  buttons?: Array<{
    label: string;
    type: string;
    onClick?: () => void;
  }>;
  width?: number;
  height?: number;
  onLoad?: (dialogWindow: Window) => void;
  onClose?: (dialogWindow: Window) => void;
}

export interface DialogResult {
  confirmed: boolean;
  value: string;
}

export interface SelectResult {
  selected: number;
  confirmed: boolean;
}

export interface DialogBuilder {
  alert(window: Window, title: string, message: string): void;
  confirm(window: Window, title: string, message: string): boolean;
  prompt(window: Window, title: string, message: string, defaultValue?: string): DialogResult;
  confirmEx(
    window: Window,
    title: string,
    message: string,
    button0Label?: string,
    button1Label?: string,
    button2Label?: string
  ): number;
  askSave(window: Window, title: string, message: string): "save" | "dontsave" | "cancel";
  select(
    window: Window,
    title: string,
    message: string,
    options: string[],
    defaultIndex?: number
  ): SelectResult;
  showMessage(window: Window, title: string, message: string, type?: string): void;
  custom(window: Window, options: CustomDialogOptions): {
    window: Window | null;
    close: () => void;
  };
  readonly BUTTON_TYPES: typeof BUTTON_TYPES;
}

export const BUTTON_TYPES: {
  ACCEPT: "accept";
  CANCEL: "cancel";
  EXTRA1: "extra1";
  EXTRA2: "extra2";
  HELP: "help";
  DISCARD: "discard";
};

export function createDialogBuilder(options?: DialogBuilderOptions): DialogBuilder;

// ========== Progress Window ==========

export interface ProgressNotifierOptions {
  logger?: Logger;
  i18n?: I18n;
  zotero?: unknown;
}

export interface ProgressOptions {
  title: string;
  message?: string;
  progress?: number;
  determinate?: boolean;
  closeOnClick?: boolean;
  closeTime?: number;
  icon?: string;
  onCancel?: () => void;
}

export interface ToastOptions {
  title?: string;
  icon?: string;
}

export interface ProgressNotifier {
  showProgress(options: ProgressOptions): string;
  updateProgress(progressId: string, progress: number, message?: string): boolean;
  closeProgress(progressId: string): boolean;
  closeAll(): void;
  showToast(
    message: string,
    type?: "success" | "warning" | "error" | "info",
    duration?: number,
    options?: ToastOptions
  ): string;
  showSuccess(message: string, duration?: number): void;
  showWarning(message: string, duration?: number): void;
  showError(message: string, duration?: number): void;
  showInfo(message: string, duration?: number): void;
  createProgressLine(options: {
    text: string;
    type?: string;
    progress?: number;
    icon?: string;
  }): { text: string; type: string; progress: number; icon?: string };
  isProgressWindowAvailable(): boolean;
  readonly NOTIFICATION_TYPES: typeof NOTIFICATION_TYPES;
}

export const NOTIFICATION_TYPES: {
  SUCCESS: "success";
  WARNING: "warning";
  ERROR: "error";
  INFO: "info";
  DEFAULT: "default";
};

export function createProgressNotifier(options?: ProgressNotifierOptions): ProgressNotifier;
