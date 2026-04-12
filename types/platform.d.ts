/**
 * Platform 模块类型定义
 */

import type {
  FileStateStore,
  FileStateStoreMigrationContext,
  FileStateStorePruneContext,
} from "./services";
import type { Logger } from "./core";

// ========== Zotero Text File Storage ==========

export interface ZoteroTextFileStorageOptions {
  globalScope: typeof globalThis;
  directorySegments?: string | string[];
  fileName: string;
  rootDir?: string | null;
}

export interface ZoteroTextFileStorage {
  resolveDirectoryPath(): string;
  resolveFilePath(): string;
  ensureDirectory(): Promise<string>;
  exists(): Promise<boolean>;
  readText(): Promise<string | null>;
  writeText(source: string): Promise<string>;
  removeText(): Promise<boolean>;
  getAdapter(): {
    readText(): Promise<string | null>;
    writeText(source: string): Promise<string>;
  };
}

export function createZoteroTextFileStorage(options: ZoteroTextFileStorageOptions): ZoteroTextFileStorage;

// ========== Zotero JSON State Store ==========

export interface ZoteroJSONStateStoreOptions<TState = unknown, TContext = unknown> {
  globalScope: typeof globalThis;
  directorySegments?: string | string[];
  fileName: string;
  rootDir?: string | null;
  id: string;
  label?: string;
  initialState?: TState | ((context?: TContext) => Promise<TState> | TState);
  logger?: Logger;
  debounceMs?: number;
  schemaVersion?: number;
  maxSerializedBytes?: number | null;
  serialize?: (value: {
    schemaVersion: number;
    savedAt: string;
    state: TState;
  }, context?: TContext) => Promise<string> | string;
  deserialize?: (source: string, context?: TContext) => Promise<unknown> | unknown;
  migrate?: (
    context: FileStateStoreMigrationContext<TState, TContext>
  ) => Promise<TState> | TState;
  prune?: (
    context: FileStateStorePruneContext<TState, TContext>
  ) => Promise<TState> | TState;
}

export interface ZoteroJSONStateStore<TState = unknown, TContext = unknown>
  extends FileStateStore<TState, TContext> {
  storage: ZoteroTextFileStorage;
  resolveDirectoryPath(): string;
  resolveFilePath(): string;
  ensureDirectory(): Promise<string>;
  exists(): Promise<boolean>;
}

export function createZoteroJSONStateStore<TState = unknown, TContext = unknown>(
  options: ZoteroJSONStateStoreOptions<TState, TContext>
): ZoteroJSONStateStore<TState, TContext>;

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

export interface PreferencePaneSurfaceSnapshot {
  rootTagName: string | null;
  rootNamespaceURI: string | null;
  childElementCount: number;
  groupboxCount: number;
  headingCount: number;
  descriptionCount: number;
  coreControlCount: number;
  preferenceBindingCount: number;
  preferenceDefinitionCount: number;
  localizationLinkCount: number;
  scriptTagCount: number;
  registeredScriptCount: number;
  registeredStylesheetCount: number;
  hasInlineLoadHook: boolean;
  hasLoadBridgeSignature: boolean;
  surfaceRootStrategy: string | null;
  surfaceRootTagName: string | null;
  surfaceRootID: string | null;
  layoutMode: string | null;
  widthBucket: string | null;
  rootClientWidth: number;
  rootScrollWidth: number;
  horizontalOverflowPx: number;
  hasHorizontalOverflow: boolean;
  hasInteractiveRoot: boolean;
  interactiveRootStrategy: string | null;
  interactiveRootTagName: string | null;
  interactiveRootID: string | null;
  tabCount: number;
  panelCount: number;
  activeTabID: string | null;
  activePanelID: string | null;
  visiblePanelCount: number;
  panelCoreControlCount: number;
}

export interface PreferencePaneSurfaceGeometrySettleSnapshot {
  stable: boolean;
  timedOut: boolean;
  observedMs: number;
  sampleCount: number;
  strategy: string | null;
  geometry: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
}

export interface PreferencePaneWindowResizeSnapshot {
  requestedWidth: number | null;
  requestedHeight: number | null;
  targetWidth: number | null;
  targetHeight: number | null;
  applied: boolean;
  strategy: string | null;
  beforeBounds: HostWindowBounds | null;
  afterBounds: HostWindowBounds | null;
  widthMatched: boolean;
  heightMatched: boolean;
  widthSatisfied: boolean;
  heightSatisfied: boolean;
  boundarySatisfied: boolean;
  settled: boolean;
  timedOut: boolean;
  observedMs: number;
  sampleCount: number;
  settleReason: string | null;
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
    windowWidth?: number;
    windowHeight?: number;
    timeoutMs?: number;
  }): Promise<{
    window: Window | null;
    preferences: unknown;
    paneID: string | null;
    pane: unknown;
    paneElement: Element | null;
    selectedPaneID: string | null;
    preferenceSurface: PreferencePaneSurfaceSnapshot;
    surfaceElement?: Element | null;
    surfaceElementStrategy?: string | null;
    surfaceGeometrySettle?: PreferencePaneSurfaceGeometrySettleSnapshot | null;
    windowResize?: PreferencePaneWindowResizeSnapshot | null;
  }>;
  getContextPaneState(window?: Window | null): Record<string, unknown>;
  setContextPaneOpen(open: boolean, options?: { window?: Window | null; timeoutMs?: number }): Promise<Record<string, unknown>>;
  selectItemPane(paneID: string, options?: {
    window?: Window | null;
    behavior?: string;
    activationPolicy?: "host-first" | "ui-required";
    timeoutMs?: number;
  }): Promise<{
    container: unknown;
    pane: Element | null;
    button?: Element | null;
    visible: boolean;
    activationPolicy?: "host-first" | "ui-required";
    activationStrategy?: string | null;
    actionElementObserved?: boolean;
    actionDispatched?: boolean;
  }>;
  selectContextPane(paneID: string, options?: {
    window?: Window | null;
    tabID?: string | null;
    behavior?: string;
    activationPolicy?: "host-first" | "ui-required";
    timeoutMs?: number;
  }): Promise<{
    container: unknown;
    pane: Element | null;
    button?: Element | null;
    visible: boolean;
    tabID: string | null;
    activationPolicy?: "host-first" | "ui-required";
    activationStrategy?: string | null;
    actionElementObserved?: boolean;
    actionDispatched?: boolean;
  }>;
}

export function createZoteroHost(options: ZoteroHostOptions): ZoteroHost;
