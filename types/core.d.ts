/**
 * Core 模块类型定义
 */

// ========== Logger ==========

export interface LoggerOptions {
  hostLog: (message: string, details?: Record<string, unknown>) => void;
  level: LogLevel;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  setLevel(level: LogLevel): boolean;
  getLevel(): LogLevel;
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

export function createLogger(options: LoggerOptions): Logger;

// ========== Preferences ==========

export interface PreferenceStoreOptions {
  prefBranch: string;
  defaults: Record<string, boolean | number | string>;
}

export interface PreferenceStore {
  ensureDefaults(): void;
  get(key: string): boolean | number | string;
  set(key: string, value: boolean | number | string): void;
  clear(key: string): void;
  onChange(handler: (key: string) => void): () => void;
}

export function createPreferenceStore(options: PreferenceStoreOptions): PreferenceStore;

// ========== Lifecycle ==========

export interface LifecycleManager {
  trackCleanup(fn: () => void): void;
  reset(): void;
}

export function createLifecycleManager(options: { logger: Logger }): LifecycleManager;

// ========== I18N ==========

export interface I18nOptions {
  locale?: string;
  strings?: Record<string, Record<string, string>>;
}

export interface I18n {
  readonly locale: string;
  t(key: string, argsOrFallback?: Record<string, unknown> | string, fallback?: string): string;
  has(key: string): boolean;
  raw(key: string, fallback?: string): string;
  tn(key: string, count: number, args?: Record<string, unknown>): string;
  keys(): string[];
  getBundle(): Record<string, string>;
  interpolate(template: string, args?: Record<string, unknown>): string;
  plural(count: number, forms: { one?: string; other?: string }): string;
}

export function createI18n(options?: I18nOptions): I18n;
export function interpolate(template: string, args?: Record<string, unknown>): string;
export function plural(count: number, forms: { one?: string; other?: string }): string;

// ========== UI Factory ==========

export interface ElementOptions {
  namespace?: "xul" | "html";
  attributes?: Record<string, string | number | boolean>;
  styles?: Record<string, string>;
  listeners?: Array<{
    type: string;
    listener: EventListener;
    options?: boolean | AddEventListenerOptions;
  }>;
  children?: Array<Element | ElementOptions | string>;
  text?: string;
  html?: string;
  id?: string;
  className?: string;
  properties?: Record<string, unknown>;
}

export interface UIFactory {
  createElement(
    doc: Document,
    tag: string,
    options?: ElementOptions
  ): { element: Element | null; cleanup: () => void };
  createXULElement(
    doc: Document,
    tag: string,
    options?: ElementOptions
  ): { element: Element | null; cleanup: () => void };
  createHTMLElement(
    doc: Document,
    tag: string,
    options?: ElementOptions
  ): { element: Element | null; cleanup: () => void };
  appendChildren(parent: Element, children: Array<Element | ElementOptions | string>, doc: Document): void;
  setAttributes(element: Element, attributes: Record<string, string | number | boolean>): void;
  addEventListeners(
    element: Element,
    listeners: Array<{ type: string; listener: EventListener; options?: boolean | AddEventListenerOptions }>
  ): () => void;
  setStyles(element: Element, styles: Record<string, string>): void;
}

export function createUIFactory(options?: { logger?: Logger }): UIFactory;

// ========== Notifier ==========

export interface NotifierOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  zotero?: unknown;
}

export interface NotifierSubscription {
  subscriptionId: string;
  types: string[];
}

export interface Notifier {
  subscribe(
    types: string | string[],
    handler: (event: string, type: string, ids: Array<string | number>, extraData: Record<string, unknown>) => void | Promise<void>,
    options?: { id?: string; priority?: number }
  ): string | null;
  unsubscribe(subscriptionId: string): boolean;
  unsubscribeAll(): void;
  once(
    types: string | string[],
    handler: (event: string, type: string, ids: Array<string | number>, extraData: Record<string, unknown>) => void | Promise<void>,
    options?: { id?: string; priority?: number }
  ): string | null;
  waitFor(eventType: string, objectType: string, timeout?: number): Promise<{
    ids: Array<string | number>;
    extraData: Record<string, unknown>;
    type: string;
    event: string;
  }>;
  getActiveCount(): number;
  has(subscriptionId: string): boolean;
  readonly EVENT_TYPES: typeof EVENT_TYPES;
  readonly EVENTS: typeof EVENTS;
}

export const EVENT_TYPES: {
  ITEM: "item";
  COLLECTION: "collection";
  COLLECTION_ITEM: "collection-item";
  SEARCH: "search";
  TAG: "tag";
  ITEM_TAG: "item-tag";
  GROUP: "group";
  SETTING: "setting";
  TAB: "tab";
  FILE: "file";
};

export const EVENTS: {
  ADD: "add";
  MODIFY: "modify";
  DELETE: "delete";
  TRASH: "trash";
  REMOVE: "remove";
  MOVE: "move";
  REFRESH: "refresh";
  REDRAW: "redraw";
};

export function createNotifier(options?: NotifierOptions): Notifier;

// ========== Keyboard ==========

export interface KeyboardManagerOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  services?: unknown;
}

export interface ShortcutOptions {
  key?: string;
  modifiers?: string[];
  shortcut?: string;
  handler: (event: KeyboardEvent) => void;
  id?: string;
  description?: string;
  window?: Window;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export interface KeyboardManager {
  isMacOS(): boolean;
  registerShortcut(options: ShortcutOptions): string | null;
  unregister(shortcutId: string): boolean;
  unregisterAll(): void;
  getShortcutCount(): number;
  hasShortcut(shortcutId: string): boolean;
  getAllShortcuts(): Array<{ id: string; description: string; key?: string; modifiers?: Record<string, boolean> }>;
  parseShortcut(shortcut: string): { key: string; modifiers: Record<string, boolean> } | null;
  formatShortcut(key: string, modifiers: Record<string, boolean>): string;
  normalizeModifiers(modifiers: string[]): Record<string, boolean>;
  readonly MODIFIERS: typeof MODIFIERS;
}

export const MODIFIERS: {
  CTRL: "ctrl";
  ALT: "alt";
  SHIFT: "shift";
  META: "meta";
};

export function createKeyboardManager(options?: KeyboardManagerOptions): KeyboardManager;

// ========== HTTP ==========

export interface HTTPOptions {
  logger?: Logger;
  zotero?: unknown;
}

export const HTTP_METHODS: {
  GET: "GET";
  POST: "POST";
  PUT: "PUT";
  DELETE: "DELETE";
  PATCH: "PATCH";
  HEAD: "HEAD";
};

export const CONTENT_TYPES: {
  JSON: "application/json";
  FORM: "application/x-www-form-urlencoded";
  MULTIPART: "multipart/form-data";
  TEXT: "text/plain";
  HTML: "text/html";
  XML: "application/xml";
};

export interface RequestResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: string;
  json?: unknown;
  diagnostics: HTTPRequestDiagnostics;
  raw: unknown;
}

export interface HTTPRequestDiagnostics {
  durationMs: number;
  attemptCount: number;
  retryCount: number;
  retried: boolean;
  slow: boolean;
  slowThresholdMs: number;
  timeout: boolean;
  errorKind: string | null;
}

export interface HTTPDiagnosticsSummary {
  requestCount: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  retryCount: number;
  slowOperationCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  slowThresholdMs: number;
  lastRequest: {
    method: string;
    url: string | null;
    durationMs: number;
    attemptCount: number;
    retryCount: number;
    ok: boolean;
    slow: boolean;
    slowThresholdMs: number;
    timeout: boolean;
    status: number | null;
  } | null;
  lastError: {
    kind: string;
    message: string | null;
  } | null;
}

export interface LifecycleBoundaryEvent {
  event: string;
  count: number;
}

export interface AgentLifecycleDiagnostics {
  hostReadyDurationMs: number;
  startupDurationMs: number;
  shutdownDurationMs: number;
  lifecycleSlowOperationCount: number;
  lifecycleSlowThresholdMs: number;
  lifecycleLastSlowStage: string | null;
  lifecycleBoundaryEvents: LifecycleBoundaryEvent[];
}

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: string | object;
  timeout?: number;
  responseType?: string;
  successCodes?: number[];
  retryCount?: number;
  retryDelayMs?: number;
  signal?: AbortSignal | { aborted?: boolean } | null;
  slowThresholdMs?: number;
}

export interface HTTP {
  readonly HTTP_METHODS: typeof HTTP_METHODS;
  readonly CONTENT_TYPES: typeof CONTENT_TYPES;
  isAvailable(): boolean;
  request(method: string, url: string, options?: RequestOptions): Promise<RequestResponse>;
  get(url: string, options?: RequestOptions): Promise<RequestResponse>;
  post(url: string, body?: string | object, options?: RequestOptions): Promise<RequestResponse>;
  put(url: string, body?: string | object, options?: RequestOptions): Promise<RequestResponse>;
  del(url: string, options?: RequestOptions): Promise<RequestResponse>;
  patch(url: string, body?: string | object, options?: RequestOptions): Promise<RequestResponse>;
  head(url: string, options?: RequestOptions): Promise<RequestResponse>;
  json(method: string, url: string, data?: object, options?: RequestOptions): Promise<RequestResponse>;
  getJSON<T = unknown>(url: string, options?: RequestOptions): Promise<T>;
  postJSON<T = unknown>(url: string, data: object, options?: RequestOptions): Promise<T>;
  download(url: string, destPath: string, options?: unknown): Promise<boolean>;
  getDiagnostics(): HTTPDiagnosticsSummary;
  resetDiagnostics(): void;
  buildQueryString(params: Record<string, unknown>): string;
  parseQueryString(queryString: string): Record<string, string>;
  buildURL(baseUrl: string, path?: string, params?: Record<string, unknown>): string;
}

export function createHTTP(options?: HTTPOptions): HTTP;
