/**
 * Platform 模块类型定义
 */

// ========== Zotero Host ==========

export interface ZoteroHostOptions {
  globalScope: typeof globalThis;
  rootURI?: string;
}

export interface HostWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string | null;
  source?: string | null;
}

export interface SurfaceEvidenceTarget {
  surfaceId: string | null;
  captureKind: string;
  label: string | null;
  scope: "surface-local";
  rect: HostWindowBounds | null;
  windowBounds: HostWindowBounds | null;
  details: Record<string, unknown>;
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
  listWindowsByType(windowType?: string | null): Window[];
  listPreferenceWindows(): Window[];
  getPreferenceWindow(): Window | null;
  getMainWindow(): Window | null;
  waitFor<T>(condition: () => Promise<T | null | false> | T | null | false, options?: {
    timeoutMs?: number;
    intervalMs?: number;
    message?: string;
  }): Promise<T>;
  getActiveTabID(window?: Window | null): string | null;
  getLibraryItemDetails(window?: Window | null): unknown | null;
  getContextPane(window?: Window | null): unknown | null;
  getContextItemDetails(window?: Window | null, options?: { tabID?: string | null }): unknown | null;
  getCurrentNotesContext(window?: Window | null): unknown | null;
  getWindowBounds(window: Window | null): HostWindowBounds | null;
  getElementScreenRect(element: Element | null): HostWindowBounds | null;
  buildSurfaceTarget(options: {
    surfaceId: string;
    captureKind: string;
    label: string;
    element?: Element | null;
    window?: Window | null;
    details?: Record<string, unknown>;
  }): SurfaceEvidenceTarget;
  resolveMenuPopup(target: string, options?: Record<string, unknown>): Promise<{
    popup: Element | null;
    open(): Promise<Element | null>;
    close(popup?: Element | null): Promise<void>;
  }>;
  simulatePopupOpen(popup: Element | null): Promise<Element | null>;
  simulatePopupClose(popup: Element | null): Promise<void>;
  openPreferences(paneID?: string | null, options?: Record<string, unknown>): Promise<Window | null>;
  preparePreferencePane(options?: {
    paneID?: string | null;
    scrollTo?: string;
    timeoutMs?: number;
  }): Promise<{
    window: Window | null;
    preferences: unknown;
    paneID: string | null;
    pane: unknown;
    paneElement: Element | null;
    selectedPaneID: string | null;
  }>;
  getContextPaneState(window?: Window | null): Record<string, unknown>;
  setContextPaneOpen(open: boolean, options?: { window?: Window | null; timeoutMs?: number }): Promise<Record<string, unknown>>;
  selectItemPane(paneID: string, options?: { window?: Window | null; behavior?: string; timeoutMs?: number }): Promise<{
    container: unknown;
    pane: Element | null;
    visible: boolean;
  }>;
  selectContextPane(paneID: string, options?: {
    window?: Window | null;
    tabID?: string | null;
    behavior?: string;
    timeoutMs?: number;
  }): Promise<{
    container: unknown;
    pane: Element | null;
    visible: boolean;
    tabID: string | null;
  }>;
}

export function createZoteroHost(options: ZoteroHostOptions): ZoteroHost;
