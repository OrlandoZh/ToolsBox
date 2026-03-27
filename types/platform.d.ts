/**
 * Platform 模块类型定义
 */

// ========== Zotero Host ==========

export interface ZoteroHostOptions {
  globalScope: typeof globalThis;
  rootURI?: string;
}

export interface ZoteroHost {
  hostLog(message: string, details?: Record<string, unknown>): void;
  showAlert(window: Window | null, title: string, body: string): void;
  addToolsMenuItem(
    window: Window,
    options: { id: string; label: string; onCommand: () => void }
  ): () => void;
  resolveContentUrl(relativePath: string): string;
  injectStyleSheet(
    window: Window,
    options: { id: string; href: string }
  ): () => void;
  insertFTLIfNeeded(window: Window, resourceId: string): boolean;
  listMainWindows(): Window[];
  getMainWindow(): Window | null;
}

export function createZoteroHost(options: ZoteroHostOptions): ZoteroHost;
