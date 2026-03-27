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
  // 条目面板上下文菜单
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
  onShowing?: (event: Event, context: MenuContext) => void;
  onShown?: (event: Event, context: MenuContext) => void;
  onHiding?: (event: Event, context: MenuContext) => void;
  onHidden?: (event: Event, context: MenuContext) => void;
  onCommand?: (event: Event, context: MenuContext) => void;
  menus?: MenuData[];
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
  label: string;
  icon?: string;
  enableForTabTypes?: string[];
  onCommand?: (event: Event, context: MenuContext) => void;
  onShowing?: (event: Event, context: MenuContext) => void;
}

export interface MenuManager {
  readonly MENU_TARGETS: typeof MENU_TARGETS;
  readonly MENU_TYPES: typeof MENU_TYPES;
  readonly TAB_TYPES: typeof TAB_TYPES;

  // 核心注册方法
  register(options: MenuRegisterOptions): string | null;

  // 便捷注册方法
  registerToolsMenuItem(options: MenuItemOptions): string | null;
  registerContextMenuItem(options: MenuItemOptions): string | null;
  registerCollectionMenuItem(options: MenuItemOptions): string | null;
  registerReaderMenuItem(
    config: { target: string },
    options: MenuItemOptions
  ): string | null;
  registerSubmenu(options: {
    id?: string;
    target: string;
    label: string;
    icon?: string;
    menus: MenuData[];
  }): string | null;
  registerSeparator(target: string, id?: string): string | null;

  // 注销方法
  unregister(menuId: string): boolean;
  unregisterAll(): void;

  // 查询方法
  getMenuCount(): number;
  hasMenu(menuId: string): boolean;
  getRegisteredMenuIds(): string[];
  isOfficialAPIAvailable(): boolean;
}

export function createMenuManager(options: MenuManagerOptions): MenuManager;

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
  onRender?: (props: {
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
  condition?: () => boolean;
  shortcut?: string;
  icon?: string;
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
  executeCommand(commandId: string, context?: unknown): boolean;
}

export function createCommandPalette(options: CommandPaletteOptions): CommandPalette;

// ========== Reader ==========

export interface ReaderOptions {
  logger?: Logger;
  zotero?: unknown;
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

export interface Reader {
  // 常量
  readonly READER_TYPES: typeof READER_TYPES;
  readonly ANNOTATION_TYPES: typeof ANNOTATION_TYPES;

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
  getActiveSummary(): ReaderSummary | null;

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

// ========== Preference Panes ==========

export interface PreferencePanesOptions {
  logger?: Logger;
  lifecycle?: LifecycleManager;
  pluginID: string;
  rootURI: string;
  zotero?: unknown;
}

export interface PreferencePaneOptions {
  id?: string;
  src: string;
  parent?: string;
  label: string;
  image?: string;
  scripts?: string[];
  stylesheets?: string[];
  helpURL?: string;
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
