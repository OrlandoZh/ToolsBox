/**
 * Features 模块类型定义
 */

import { Logger, LifecycleManager, I18n, UIFactory } from "./core";

// ========== Window Manager ==========

export interface WindowManagerOptions {
  logger: Logger;
  mountWindowFeature: (window: Window) => () => void;
}

export interface WindowManager {
  onLoad(window: Window): void;
  onUnload(window: Window): void;
  remount(window: Window): void;
  remountAll(): void;
  loadAll(windows?: Window[]): void;
  reset(): void;
}

export function createWindowManager(options: WindowManagerOptions): WindowManager;

// ========== Menu Command ==========

export interface MenuCommandOptions {
  host: {
    showAlert: (window: Window | null, title: string, body: string) => void;
    addToolsMenuItem: (
      window: Window,
      options: { id: string; label: string; onCommand: () => void }
    ) => () => void;
  };
  logger: Logger;
  prefs: {
    get: (key: string) => boolean | number | string;
  };
  i18n: I18n;
}

export interface MenuCommand {
  mount(window: Window): () => void;
  execute(window?: Window | null): void;
}

export function createMenuCommand(options: MenuCommandOptions): MenuCommand;

// ========== Menu Manager ==========

export interface MenuManagerOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  i18n?: I18n;
  pluginID: string;
  zotero?: unknown;
}

export interface MenuRegistrationSnapshot {
  id: string;
  registeredMenuID: string;
  target: string;
  useOfficialAPI: boolean;
  menuPaths: string[];
  menus: MenuData[];
}

export interface LiveMenuState {
  menuId: string;
  menuPath: string;
  menuElem: Element | null;
  popupElem: Element | null;
  itemCount: number | null;
  tabID: string | null;
  tabType: string | null;
  tabSubType: string | null;
  editable: boolean | null;
  fieldName: string | null;
  collectionTreeRowID: unknown;
  collectionTreeRowType: unknown;
  resolvedState?: Record<string, unknown> | null;
  resolvedMenu?: Partial<MenuData> | null;
  phase: string | null;
  observedAt: string | null;
}

export interface MenuResolvedState extends Record<string, unknown> {
  itemCount: number;
  hasItems: boolean;
  selectedType: string | null;
  selectedTypes: string[];
  editable: boolean | null;
  tabID: string | null;
  tabType: string | null;
  tabSubType: string | null;
  fieldName: string | null;
  libraryType: string | null;
  hasCollectionSelection: boolean;
  hasSavedSearchSelection: boolean;
  collectionTreeRowID: unknown;
  collectionTreeRowType: string | null;
  preferenceFlags: Record<string, unknown>;
  itemKinds: {
    noteCount: number;
    attachmentCount: number;
    regularCount: number;
    hasNotes: boolean;
    hasAttachments: boolean;
    hasRegularItems: boolean;
    mixed: boolean;
  };
}

/**
 * 菜单目标类型（与 Zotero 官方 VALID_TARGETS 对齐）
 */
export const MENU_TARGETS: {
  // 主窗口菜单栏
  MAIN_MENU_FILE: "main/menubar/file";
  MAIN_MENU_EDIT: "main/menubar/edit";
  MAIN_MENU_VIEW: "main/menubar/view";
  MAIN_MENU_GO: "main/menubar/go";
  MAIN_MENU_TOOLS: "main/menubar/tools";
  MAIN_MENU_HELP: "main/menubar/help";
  // 主窗口库上下文菜单
  LIBRARY_ITEM: "main/library/item";
  LIBRARY_COLLECTION: "main/library/collection";
  // 主窗口工具栏子菜单
  LIBRARY_ADD_ATTACHMENT: "main/library/addAttachment";
  LIBRARY_ADD_NOTE: "main/library/addNote";
  // 标签页上下文菜单
  MAIN_TAB: "main/tab";
  // 阅读器窗口菜单栏
  READER_MENU_FILE: "reader/menubar/file";
  READER_MENU_EDIT: "reader/menubar/edit";
  READER_MENU_VIEW: "reader/menubar/view";
  READER_MENU_GO: "reader/menubar/go";
  READER_MENU_WINDOW: "reader/menubar/window";
  // 条目窗格上下文菜单
  ITEM_PANE_INFO_ROW: "itemPane/info/row";
  // 笔记面板按钮
  NOTES_PANE_ITEM_NOTE: "notesPane/addItemNote";
  NOTES_PANE_STANDALONE_NOTE: "notesPane/addStandaloneNote";
  // 侧边导航按钮
  SIDENAV_LOCATE: "sidenav/locate";
};

/**
 * 菜单项类型
 */
export const MENU_TYPES: {
  MENUITEM: "menuitem";
  SEPARATOR: "separator";
  SUBMENU: "submenu";
};

/**
 * 标签页类型（用于 enableForTabTypes）
 */
export const TAB_TYPES: {
  LIBRARY: "library";
  READER_ALL: "reader/*";
  READER_PDF: "reader/pdf";
  READER_EPUB: "reader/epub";
  READER_SNAPSHOT: "reader/snapshot";
};

/**
 * 菜单上下文对象
 */
export interface MenuContext {
  menuElem?: Element;
  items?: unknown[];
  window?: Window;
  tabID?: string;
  tabType?: string;
  tabSubType?: string;
  editable?: boolean;
  fieldName?: string;
  collectionTreeRow?: unknown;
  libraryType?: string;
  setL10nArgs: (args: unknown) => void;
  setEnabled: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
  setIcon: (icon: string, darkIcon?: string) => void;
}

/**
 * 菜单项数据
 */
export interface MenuData {
  menuType: "menuitem" | "separator" | "submenu";
  l10nID?: string;
  l10nArgs?: unknown;
  label?: string;
  icon?: string;
  darkIcon?: string;
  enableForTabTypes?: string[];
  visible?: boolean;
  disabled?: boolean;
  enabled?: boolean;
  onShowing?: (event: Event, context: MenuContext) => void;
  onShown?: (event: Event, context: MenuContext) => void;
  onHiding?: (event: Event, context: MenuContext) => void;
  onHidden?: (event: Event, context: MenuContext) => void;
  onCommand?: (event: Event, context: MenuContext) => void;
  menus?: MenuData[];
}

export interface MenuStateResolverOptions {
  prefs?: {
    get: (key: string) => unknown;
  };
  preferenceKeys?: string[];
  extraResolvers?: Array<(context: MenuContext, state: MenuResolvedState) => Record<string, unknown>>;
}

export interface StateDrivenMenuOptions {
  id?: string;
  target: string;
  baseMenu: MenuData;
  resolveState?: (context: MenuContext) => MenuResolvedState | Record<string, unknown>;
  buildMenu?: (payload: {
    state: MenuResolvedState | Record<string, unknown>;
    context: MenuContext;
    baseMenu: MenuData;
    menuId: string;
  }) => Partial<MenuData> | MenuData;
}

/**
 * 菜单注册配置
 */
export interface MenuRegisterOptions {
  id?: string;
  target: string;
  menus: MenuData[];
}

/**
 * 便捷菜单项配置
 */
export interface MenuItemOptions {
  id?: string;
  l10nID?: string;
  l10nArgs?: unknown;
  label?: string;
  icon?: string;
  enableForTabTypes?: string[];
  onCommand?: (event: Event, context: MenuContext) => void;
  onShowing?: (event: Event, context: MenuContext) => void;
}

export interface SubmenuOptions {
  id?: string;
  target: string;
  l10nID?: string;
  l10nArgs?: unknown;
  label?: string;
  icon?: string;
  menus: MenuData[];
}

export interface MenuManager {
  readonly MENU_TARGETS: typeof MENU_TARGETS;
  readonly MENU_TYPES: typeof MENU_TYPES;
  readonly TAB_TYPES: typeof TAB_TYPES;

  // 核心注册方法
  register(options: MenuRegisterOptions): string | null;

  // 推荐 scene helper
  registerToolsMenuItem(options: MenuItemOptions): string | null;
  registerItemMenuItem(options: MenuItemOptions): string | null;
  registerCollectionMenuItem(options: MenuItemOptions): string | null;
  registerItemPaneInfoRowMenuItem(options: MenuItemOptions): string | null;
  registerReaderMenubarViewMenuItem(options: MenuItemOptions): string | null;
  registerItemSubmenu(options: Omit<SubmenuOptions, "target">): string | null;
  registerCollectionSubmenu(options: Omit<SubmenuOptions, "target">): string | null;
  registerReaderMenubarViewSubmenu(options: Omit<SubmenuOptions, "target">): string | null;

  // 兼容 alias（默认不作为新代码推荐写法）
  registerContextMenuItem(options: MenuItemOptions): string | null;
  registerReaderMenuItem(
    config: { target: string },
    options: MenuItemOptions
  ): string | null;
  registerSubmenu(options: SubmenuOptions): string | null;
  registerStateDrivenMenu(options: StateDrivenMenuOptions): string | null;
  registerSeparator(target: string, id?: string): string | null;

  // 注销方法
  unregister(menuId: string): boolean;
  unregisterAll(): void;

  // 查询方法
  getMenuCount(): number;
  hasMenu(menuId: string): boolean;
  getRegisteredMenuIds(): string[];
  getMenuRegistrationSnapshot(menuId?: string | null): MenuRegistrationSnapshot[] | MenuRegistrationSnapshot | null;
  getLiveMenuState(menuId: string, menuPath?: string | null): LiveMenuState | null;
  isOfficialAPIAvailable(): boolean;
}

export function createMenuManager(options: MenuManagerOptions): MenuManager;
export function createMenuStateResolver(options?: MenuStateResolverOptions): (context?: MenuContext) => MenuResolvedState;

// ========== Item Pane ==========

export interface ItemPaneOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  uiFactory?: UIFactory;
  i18n?: I18n;
  pluginID: string;
  zotero?: unknown;
}

export interface SectionHeader {
  l10nID?: string;
  label?: string;
  icon?: string;
  darkIcon?: string;
}

export interface SectionOptions {
  paneID: string;
  pluginID?: string;
  header?: SectionHeader;
  sidenav?: SectionHeader & { orderable?: boolean };
  bodyXHTML?: string;
  onInit?: (props: { item?: unknown }) => void;
  onDestroy?: (props: unknown) => void;
  onItemChange?: (props: { item?: unknown; setEnabled: (enabled: boolean) => void }) => boolean | void;
  onRender: (props: {
    doc: Document;
    body: HTMLElement;
    item?: unknown;
    editable?: boolean;
  }) => void;
  onAsyncRender?: (props: {
    body: HTMLElement;
    item?: unknown;
  }) => Promise<void>;
  onToggle?: (props: { item?: unknown }) => void;
  sectionButtons?: Array<{
    type: string;
    icon: string;
    darkIcon?: string;
    l10nID?: string;
    onClick?: (props: { item?: unknown; paneID: string }) => void;
  }>;
}

export interface InfoRowOptions {
  rowID: string;
  pluginID?: string;
  label: {
    l10nID?: string;
  };
  position?: "start" | "afterCreators" | "end";
  multiline?: boolean;
  nowrap?: boolean;
  editable?: boolean;
  onGetData: (props: { item?: unknown; tabType?: string; editable?: boolean }) => string;
  onSetData?: (props: { item?: unknown; tabType?: string; editable?: boolean; value: string }) => void;
  onItemChange?: (props: {
    rowID: string;
    item?: unknown;
    tabType?: string;
    editable?: boolean;
    setEnabled: (enabled: boolean) => void;
    setEditable: (editable: boolean) => void;
  }) => void;
}

export interface ItemPane {
  isAvailable(): boolean;
  registerSection(options: SectionOptions): string | null;
  registerInfoRow(options: InfoRowOptions): string | null;
  unregisterSection(paneID: string): boolean;
  unregisterInfoRow(rowID: string): boolean;
  refreshInfoRow(rowID: string): boolean;
  unregisterAll(): void;
  getSectionCount(): number;
  getInfoRowCount(): number;
  hasSection(paneID: string): boolean;
  hasInfoRow(rowID: string): boolean;
  resolveSectionPaneID(paneID: string): string | null;
  getRegistrationSnapshot(): {
    sections: Array<{
      paneID: string;
      registeredPaneID: string | null;
      headerL10nID: string | null;
      sidenavL10nID: string | null;
    }>;
    infoRows: Array<{
      rowID: string;
      registeredRowID: string | null;
      labelL10nID: string | null;
    }>;
  };

  // 便捷工厂方法
  createSimpleSection(options: {
    paneID: string;
    headerL10nID: string;
    sidenavL10nID?: string;
    icon?: string;
    getContent: (item: unknown) => string;
    isEnabled?: (item: unknown) => boolean;
  }): string | null;
  createFieldInfoRow(options: {
    rowID: string;
    labelL10nID: string;
    field: string;
    editable?: boolean;
    formatValue?: (value: unknown) => string;
    isEnabled?: (item: unknown) => boolean;
  }): string | null;
  createConditionalInfoRow(options: {
    rowID: string;
    labelL10nID: string;
    getData: (item: unknown) => string;
    setData?: (item: unknown, value: string) => void;
    condition: (item: unknown) => boolean;
    editable?: boolean;
  }): string | null;
}

export function createItemPane(options: ItemPaneOptions): ItemPane;

// ========== Item Tree ==========

export interface ItemTreeOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  i18n?: I18n;
  pluginID: string;
  zotero?: unknown;
}

export interface ColumnOptions {
  dataKey: string;
  pluginID?: string;
  label?: string;
  l10nID?: string;
  dataProvider: (item: unknown, dataKey: string) => string | number;
  renderCell?: (
    index: number,
    data: string | number,
    column: { className?: string },
    isFirstColumn: boolean,
    doc: Document
  ) => HTMLElement;
  iconPath?: string;
  width?: number;
  fixedWidth?: boolean;
  sortable?: boolean;
  hidden?: boolean;
  enabledTreeIDs?: string[];
  position?: string;
}

export interface ItemTree {
  isAvailable(): boolean;
  registerColumn(options: ColumnOptions): string | null;
  unregisterColumn(dataKey: string): boolean;
  unregisterAll(): void;
  getColumnCount(): number;
  hasColumn(dataKey: string): boolean;
  createFieldDataProvider(field: string): (item: unknown) => string;
  createFormattedDataProvider(
    extractor: (item: unknown) => unknown,
    formatter: (value: unknown) => string
  ): (item: unknown) => string;
  createDefaultCellRenderer(styleOptions?: {
    color?: string;
    fontWeight?: string;
    textAlign?: string;
  }): (index: number, data: unknown, column: unknown, isFirstColumn: boolean, doc: Document) => HTMLElement;
  createConditionalCellRenderer(
    conditionFn: (data: unknown) => boolean,
    trueStyle: Record<string, string>,
    falseStyle: Record<string, string>
  ): (index: number, data: unknown, column: unknown, isFirstColumn: boolean, doc: Document) => HTMLElement;
}

export function createItemTree(options: ItemTreeOptions): ItemTree;

// ========== Command Palette ==========

export interface CommandPaletteOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  i18n?: I18n;
  pluginID: string;
  zotero?: unknown;
}

export interface CommandOptions {
  id?: string;
  label: string;
  category?: string;
  description?: string;
  handler: (context?: unknown) => void;
  condition?: (context?: unknown) => boolean;
  aliases?: string[];
  keywords?: string[];
  shortcut?: string;
  icon?: string;
}

export interface CommandSnapshot {
  id: string;
  label: string;
  category: string;
  description: string;
  shortcut: string | null;
  icon: string | null;
  aliases: string[];
  keywords: string[];
  enabled: boolean;
  searchable: boolean;
  type: string;
}

export interface CommandPalette {
  isAvailable(): boolean;
  registerCommand(options: CommandOptions): string | null;
  registerAnonymousCommand(options: { id?: string; handler: (prompt: unknown) => void }): string | null;
  unregisterCommand(commandId: string): boolean;
  unregisterAll(): void;
  getCommandCount(): number;
  hasCommand(commandId: string): boolean;
  getAllCommands(): Array<{ id: string; label: string; category: string }>;
  getCommandSnapshot(commandId?: string | null, context?: unknown): CommandSnapshot[] | CommandSnapshot | null;
  searchCommands(query: string, context?: unknown, options?: { includeDisabled?: boolean; limit?: number }): CommandSnapshot[];
  executeCommand(commandId: string, context?: unknown): boolean;
}

export function createCommandPalette(options: CommandPaletteOptions): CommandPalette;

// ========== Reader ==========

export interface ReaderOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  zotero?: unknown;
  pluginID?: string;
}

export const READER_TYPES: {
  PDF: "pdf";
  EPUB: "epub";
  SNAPSHOT: "snapshot";
};

export const ANNOTATION_TYPES: {
  HIGHLIGHT: "highlight";
  NOTE: "note";
  IMAGE: "image";
  INK: "ink";
  TEXT: "text";
};

export const READER_EVENT_TYPES: {
  RENDER_TEXT_SELECTION_POPUP: "renderTextSelectionPopup";
  RENDER_SIDEBAR_ANNOTATION_HEADER: "renderSidebarAnnotationHeader";
  RENDER_TOOLBAR: "renderToolbar";
  CREATE_COLOR_CONTEXT_MENU: "createColorContextMenu";
  CREATE_VIEW_CONTEXT_MENU: "createViewContextMenu";
  CREATE_ANNOTATION_CONTEXT_MENU: "createAnnotationContextMenu";
  CREATE_THUMBNAIL_CONTEXT_MENU: "createThumbnailContextMenu";
  CREATE_SELECTOR_CONTEXT_MENU: "createSelectorContextMenu";
};

export interface AnnotationData {
  type: string;
  text?: string;
  comment?: string;
  color?: string;
  pageIndex?: number;
  rects?: unknown;
  [key: string]: unknown;
}

export interface ReaderSummary {
  tabID: string | null;
  itemID: number | null;
  type: string | null;
  annotationIDs: number[];
  annotationCount: number;
}

export interface ReaderSelectionSnapshot {
  hasSelection: boolean;
  sourceKind: string;
  text: string;
  textLength: number;
  tabID: string | null;
  itemID: number | null;
  readerType: string | null;
  selectedAnnotationIDs: number[];
  annotationCount: number;
  uiState?: Record<string, unknown> | null;
}

export interface ReaderEvent {
  type?: string;
  doc?: Document | null;
  reader?: unknown;
  params?: Record<string, unknown>;
  append?: (...args: unknown[]) => void;
  [key: string]: unknown;
}

export interface ReaderContextMenuItem {
  label?: string;
  l10nID?: string;
  l10nArgs?: unknown;
  icon?: string;
  onCommand?: (...args: unknown[]) => void;
  [key: string]: unknown;
}

export type ReaderContextMenuItemSource =
  | ReaderContextMenuItem
  | ReaderContextMenuItem[]
  | ((event: ReaderEvent) => ReaderContextMenuItem | ReaderContextMenuItem[] | null | undefined);

export interface RegisteredReaderEventListener {
  type: string;
  handler: (event: ReaderEvent) => void;
  wrappedHandler?: (event: ReaderEvent) => void;
  pluginID?: string | null;
}

export interface ReaderEventDispatchResult {
  type?: string;
  dispatched: number;
  failed: number;
  usedDoc: boolean;
  supported: boolean;
}

export interface ReaderEventAPIReport {
  available: boolean;
  registeredCount: number;
  registeredTypes: string[];
  registeredListeners: RegisteredReaderEventListener[];
  knownTypes: string[];
  probeCompatibleTypes: string[];
  probeDispatchModes: string[];
  syntheticFallbackAvailable: boolean;
}

export interface Reader {
  // 常量
  readonly READER_TYPES: typeof READER_TYPES;
  readonly ANNOTATION_TYPES: typeof ANNOTATION_TYPES;
  readonly READER_EVENT_TYPES: typeof READER_EVENT_TYPES;

  // 阅读器 API
  isAvailable(): boolean;
  getAllReaders(): unknown[];
  getByTabID(tabID: string): unknown | null;
  getByItemID(itemID: number): unknown | null;
  getActiveReader(): unknown | null;
  openReader(options: {
    itemID: number;
    location?: unknown;
    openInBackground?: boolean;
    openInWindow?: boolean;
    allowDuplicate?: boolean;
  }): Promise<unknown | null>;
  openByURI(uri: string, location?: unknown, options?: unknown): Promise<boolean | null>;
  getWindowStates(): Array<{ window: Window; readers: unknown[] }>;
  canOpen(itemID: number): Promise<boolean>;
  getReaderType(itemID: number): string | null;
  closeByItemID(itemID: number): boolean;
  getAnnotationIDs(identifier: string | number): number[];
  getReaderSummary(target?: unknown): ReaderSummary | null;
  getSelectionSnapshot(source?: unknown, options?: {
    maxTextLength?: number;
    includeUIState?: boolean;
    view?: "primary" | "secondary";
  }): ReaderSelectionSnapshot | null;
  getReaderUIStateSnapshot(target?: unknown): Record<string, unknown> | null;
  getReaderInteractionSnapshot(target?: unknown): Record<string, unknown> | null;
  getActiveSummary(): ReaderSummary | null;
  waitForReaderReady(target: unknown, options?: { timeoutMs?: number; intervalMs?: number }): Promise<unknown | null>;
  setContextPaneOpen(target: unknown, open: boolean, options?: { timeoutMs?: number; intervalMs?: number }): Promise<Record<string, unknown> | null>;
  selectSidebarView(target: unknown, view: string, options?: {
    timeoutMs?: number;
    intervalMs?: number;
    activationPolicy?: "host-first" | "ui-required";
  }): Promise<{
    view: string;
    uiState: Record<string, unknown> | null;
    button: Element | null;
    panel: Element | null;
    doc: Document | null;
    activationPolicy?: "host-first" | "ui-required";
    activationStrategy?: string | null;
    actionElementObserved?: boolean;
    actionDispatched?: boolean;
  } | null>;
  findToolbarElement(target: unknown, options?: { selector?: string; view?: "primary" | "secondary" }): Element | null;
  findSidebarViewElements(target: unknown, view: string, options?: { view?: "primary" | "secondary" }): {
    button: Element | null;
    panel: Element | null;
    doc: Document | null;
  };
  isEventAPIAvailable(): boolean;
  registerViewContextMenuItem(menuItemOrFactory: ReaderContextMenuItemSource, options?: { pluginID?: string }): (() => void) | null;
  registerAnnotationContextMenuItem(menuItemOrFactory: ReaderContextMenuItemSource, options?: { pluginID?: string }): (() => void) | null;
  registerEventListener(type: string, handler: (event: ReaderEvent) => void, options?: { pluginID?: string }): (() => void) | null;
  unregisterEventListener(type: string, handler: (event: ReaderEvent) => void): number;
  unregisterAllEventListeners(): number;
  getRegisteredEventListeners(): RegisteredReaderEventListener[];
  getEventListenerCount(): number;
  getKnownEventTypes(): string[];
  getProbeCompatibleEventTypes(): string[];
  getEventAPIReport(): ReaderEventAPIReport;
  dispatchSyntheticEvent(target: unknown, options?: {
    type?: string;
    detail?: unknown;
    doc?: Document | null;
    view?: "primary" | "secondary";
  }): ReaderEventDispatchResult;
  getReaderFrameWindow(target: unknown, options?: { view?: "primary" | "secondary" }): Window | null;

  // 注解 API
  isAnnotationsAvailable(): boolean;
  getAnnotations(attachmentID: number): unknown[];
  getAnnotation(annotationID: number): unknown | null;
  createAnnotation(attachmentID: number, annotationData: AnnotationData, options?: unknown): Promise<unknown | null>;
  updateAnnotation(annotationID: number, updates: { text?: string; comment?: string; color?: string; pageIndex?: number }): Promise<boolean>;
  deleteAnnotation(annotationID: number): Promise<boolean>;
  deleteAnnotations(annotationIDs: number[]): Promise<number>;
  getAnnotationAuthor(annotationID: number): string | null;
  isAnnotationEditable(annotationID: number): boolean;
}

export function createReader(options?: ReaderOptions): Reader;

export interface ReaderSelectionActionDescriptor {
  id?: string;
  label: string;
  description?: string;
  aliases?: string[];
  keywords?: string[];
  condition?: (context?: unknown) => boolean;
  handler: (context?: unknown) => unknown | Promise<unknown>;
}

export interface ReaderSelectionActionSnapshot {
  id: string;
  label: string;
  description: string;
  aliases: string[];
  keywords: string[];
  enabled: boolean;
  hasSelection: boolean;
}

export interface ReaderSelectionActionExecutionResult {
  ok: boolean;
  actionId: string | null;
  selection: ReaderSelectionSnapshot | null;
  result: unknown;
  errorMessage: string | null;
  skipped: boolean;
}

export interface ReaderSelectionActionsOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  reader?: {
    getSelectionSnapshot: (
      source?: unknown,
      options?: {
        maxTextLength?: number;
        includeUIState?: boolean;
        view?: "primary" | "secondary";
      }
    ) => ReaderSelectionSnapshot | null;
  } | null;
}

export interface ReaderSelectionActions {
  registerAction(options: ReaderSelectionActionDescriptor): string | null;
  unregisterAction(actionId: string): boolean;
  unregisterAll(): void;
  hasAction(actionId: string): boolean;
  getActionCount(): number;
  getActionSnapshot(actionId?: string | null, input?: unknown): ReaderSelectionActionSnapshot[] | ReaderSelectionActionSnapshot | null;
  executeAction(actionId: string, input?: unknown): Promise<ReaderSelectionActionExecutionResult>;
}

export function createReaderSelectionActions(options?: ReaderSelectionActionsOptions): ReaderSelectionActions;

// ========== Preference Panes ==========

export interface PreferencePanesOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  pluginID: string;
  rootURI: string;
  zotero?: unknown;
}

export interface PreferencePaneLoadContext {
  window: Window | null;
  paneID: string;
  pluginID: string;
  resolveURI: (uri: string) => string;
}

export interface PreferencePaneOptions {
  id?: string;
  src: string;
  parent?: string;
  label?: string;
  image?: string;
  scripts?: string[];
  stylesheets?: string[];
  helpURL?: string;
  onPreferenceLoad?: (
    context: PreferencePaneLoadContext
  ) => void | Promise<void>;
}

export interface PreferencePanes {
  isAvailable(): boolean;
  registerPane(options: PreferencePaneOptions): Promise<string | null>;
  unregisterPane(paneId: string): boolean;
  unregisterAll(): void;
  getPaneCount(): number;
  hasPane(paneId: string): boolean;
  getAllPanes(): string[];
  resolveURI(uri: string): string;
}

export function createPreferencePanes(options: PreferencePanesOptions): PreferencePanes;
