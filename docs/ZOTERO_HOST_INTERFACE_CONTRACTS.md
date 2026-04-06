# Zotero Host Interface Contracts

> Generated from `config/zotero-host-interface-contracts.json`. Edit the registry and run `npm run docs:sync-zotero-host-interface-contracts`.

## Governance Goal

- 插件接口包装层的修改必须先对齐 Zotero 宿主源码，再同步 clean-room 包装器、类型与测试，避免接口凭经验漂移。

## Contracts

### `menu-manager`

- Version: `1`
- Summary: 冻结 MenuManager 包装层与 Zotero 官方菜单目标、菜单类型和注册入口的对齐关系。
- Owner Files:
  - `src/features/menu-manager.js`
- Reference Sources:
  - `chrome/content/zotero/xpcom/pluginAPI/menuManager.js` includes `const VALID_TARGETS = [`, `const VALID_MENU_TYPES = [`, `Zotero.MenuManager = {`, `registerMenu(options) {`
- Exported Surface:
  - menu targets: `src/features/menu-manager.js` includes `export const MENU_TARGETS = {`, `MAIN_MENU_FILE: "main/menubar/file"`, `LIBRARY_ITEM: "main/library/item"`, `READER_MENU_VIEW: "reader/menubar/view"`, `ITEM_PANE_INFO_ROW: "itemPane/info/row"`
  - menu types: `src/features/menu-manager.js` includes `export const MENU_TYPES = {`, `MENUITEM: "menuitem"`, `SUBMENU: "submenu"`
  - tab types: `src/features/menu-manager.js` includes `export const TAB_TYPES = {`, `READER_PDF: "reader/pdf"`, `READER_SNAPSHOT: "reader/snapshot"`
  - official registration bridge: `src/features/menu-manager.js` includes `function hasOfficialAPI() {`, `return Zotero && Zotero.MenuManager && typeof Zotero.MenuManager.registerMenu === "function";`, `function register(config) {`, `const menuData = menus.map((menuItem, index) => wrapMenuData(menuId, menuItem, `${index}`, menuPaths));`, `function getMenuRegistrationSnapshot(menuId = null) {`, `function getLiveMenuState(menuId, menuPath = null) {`
- Required Types:
  - `types/features.d.ts` includes `readonly MENU_TARGETS: typeof MENU_TARGETS;`, `readonly MENU_TYPES: typeof MENU_TYPES;`, `registerReaderMenuItem(`, `getMenuRegistrationSnapshot(menuId?: string | null): MenuRegistrationSnapshot[] | MenuRegistrationSnapshot | null;`, `getLiveMenuState(menuId: string, menuPath?: string | null): LiveMenuState | null;`, `isOfficialAPIAvailable(): boolean;`
- Required Tests:
  - `menu-manager.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - 菜单业务文案和产品特定交互逻辑
  - agent 诊断层如何解释菜单回归
  - 非官方 API 的宿主 DOM 注入策略

### `item-pane`

- Version: `1`
- Summary: 冻结 ItemPane Section / InfoRow 包装层与 Zotero 官方 hook / l10n / refresh 契约的对齐关系。
- Owner Files:
  - `src/features/item-pane.js`
- Reference Sources:
  - `chrome/content/zotero/xpcom/pluginAPI/itemPaneManager.js` includes `Zotero.ItemPaneManager.registerSection({`, `registerSection(options) {`, `Zotero.ItemPaneManager.registerInfoRow({`, `refreshInfoRow(rowID) {`
- Exported Surface:
  - section registration bridge: `src/features/item-pane.js` includes `function registerSection(sectionOptions) {`, `error("itemPane.registerSection.noOnRender", { paneID });`, `config.header.l10nID = header.l10nID;`, `config.sidenav.l10nID = sidenav.l10nID;`, `const registeredPaneID = Zotero.ItemPaneManager.registerSection(config);`
  - info row registration bridge: `src/features/item-pane.js` includes `function registerInfoRow(rowOptions) {`, `const registeredRowID = Zotero.ItemPaneManager.registerInfoRow(config);`, `function refreshInfoRow(rowID) {`
- Required Types:
  - `types/features.d.ts` includes `registerSection(options: SectionOptions): string | null;`, `registerInfoRow(options: InfoRowOptions): string | null;`, `onRender: (props: {`, `headerL10nID: string;`, `labelL10nID: string;`
- Required Tests:
  - `item-pane.test.js`
  - `plugin.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - 具体 Section / InfoRow 展示内容
  - FTL 文案本身的产品语义
  - Reader 视觉和 agent 修复路径

### `item-tree`

- Version: `1`
- Summary: 冻结 ItemTree 自定义列包装层与 Zotero 官方列注册 / namespaced dataKey 契约的对齐关系。
- Owner Files:
  - `src/features/item-tree.js`
- Reference Sources:
  - `chrome/content/zotero/xpcom/pluginAPI/itemTreeManager.js` includes `registerColumn(option) {`, `registerColumns(options) {`, `unregisterColumn(dataKey) {`
- Exported Surface:
  - column registration bridge: `src/features/item-tree.js` includes `function registerColumn(columnOptions) {`, `config.enabledTreeIDs = enabledTreeIDs;`, `? Zotero.ItemTreeManager.registerColumn(config)`, `: Zotero.ItemTreeManager.registerColumns(config)?.[0];`
  - cell renderer helpers: `src/features/item-tree.js` includes `function createConditionalCellRenderer(conditionFn, trueStyle, falseStyle) {`
- Required Types:
  - `types/features.d.ts` includes `registerColumn(options: ColumnOptions): string | null;`, `enabledTreeIDs?: string[];`, `createConditionalCellRenderer(`
- Required Tests:
  - `plugin.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - 列内容的数据来源和产品字段设计
  - agent 侧如何解释 ItemTree 回归
  - 宿主内部列渲染实现细节

### `preference-panes`

- Version: `1`
- Summary: 冻结 PreferencePanes 包装层与 Zotero 官方 pane 注册 / URI 解析契约的对齐关系。
- Owner Files:
  - `src/features/preference-panes.js`
- Reference Sources:
  - `chrome/content/zotero/xpcom/preferencePanes.js` includes `Zotero.PreferencePanes.register({`, `throw new Error('pluginID and src must be provided');`, `src: await Zotero.Plugins.resolveURI(options.pluginID, options.src)`, `unregister: function (id) {`
- Exported Surface:
  - preference pane registration bridge: `src/features/preference-panes.js` includes `function resolveURI(uri) {`, `async function registerPane(paneOptions) {`, `const resolvedSrc = resolveURI(src);`, `const useOnPreferenceLoad = typeof onPreferenceLoad === "function";`, `registerPreferencePaneLoadHandler(paneId, onPreferenceLoad);`, `const paneId = await Zotero.PreferencePanes.register(registerOptions);`, `Zotero.PreferencePanes.unregister(paneId);`
- Required Types:
  - `types/features.d.ts` includes `registerPane(options: PreferencePaneOptions): Promise<string | null>;`, `resolveURI(uri: string): string;`, `label?: string;`, `onPreferenceLoad?: (`
- Required Tests:
  - `plugin.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - 偏好设置面板具体表单内容和业务设置
  - 偏好设置面板视觉样式
  - 产品特定的帮助文档链接

### `reader-events`

- Version: `1`
- Summary: 冻结 Reader 事件包装层与 Zotero 官方事件类型、注册入口和 synthetic fallback 边界的对齐关系。
- Owner Files:
  - `src/features/reader.js`
- Reference Sources:
  - `chrome/content/zotero/xpcom/reader.js` includes `@typedef {"renderTextSelectionPopup" | "renderSidebarAnnotationHeader" | "renderToolbar" |`, `registerEventListener(type, handler, pluginID = undefined) {`, `unregisterEventListener(type, handler) {`
- Exported Surface:
  - reader event constants: `src/features/reader.js` includes `export const READER_EVENT_TYPES = {`, `RENDER_TOOLBAR: "renderToolbar"`, `CREATE_SELECTOR_CONTEXT_MENU: "createSelectorContextMenu"`, `export const READER_EVENT_KNOWN_TYPES = Object.freeze([`, `export const READER_EVENT_SYNTHETIC_FALLBACK_TYPES = Object.freeze([`
  - reader event bridge: `src/features/reader.js` includes `function isEventAPIAvailable() {`, `async function waitForReaderReady(target, options = {}) {`, `function findToolbarElement(target, options = {}) {`, `function findSidebarViewElements(target, view, options = {}) {`, `async function setContextPaneOpen(target, open, options = {}) {`, `async function selectSidebarView(target, view, options = {}) {`, `function getKnownEventTypes() {`, `function getProbeCompatibleEventTypes() {`, `function dispatchSyntheticEvent(target, options = {}) {`, `function getEventAPIReport() {`, `function registerEventListener(type, handler, options = {}) {`, `function unregisterEventListener(type, handler) {`
- Required Types:
  - `types/features.d.ts` includes `export const READER_EVENT_TYPES: {`, `readonly READER_EVENT_TYPES: typeof READER_EVENT_TYPES;`, `isEventAPIAvailable(): boolean;`, `waitForReaderReady(target: unknown, options?: { timeoutMs?: number; intervalMs?: number }): Promise<unknown | null>;`, `setContextPaneOpen(target: unknown, open: boolean, options?: { timeoutMs?: number; intervalMs?: number }): Promise<Record<string, unknown> | null>;`, `selectSidebarView(target: unknown, view: string, options?: {`, `findToolbarElement(target: unknown, options?: { selector?: string; view?: "primary" | "secondary" }): Element | null;`, `findSidebarViewElements(target: unknown, view: string, options?: { view?: "primary" | "secondary" }): {`, `registerEventListener(type: string, handler: (event: ReaderEvent) => void, options?: { pluginID?: string }): (() => void) | null;`, `getKnownEventTypes(): string[];`, `getProbeCompatibleEventTypes(): string[];`, `getEventAPIReport(): ReaderEventAPIReport;`, `dispatchSyntheticEvent(target: unknown, options?: {`, `getReaderFrameWindow(target: unknown, options?: { view?: "primary" | "secondary" }): Window | null;`
- Required Tests:
  - `reader.test.js`
  - `agent-zotero-e2e-lib.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - Reader 更深的 UI 观测字段链
  - Reader 视觉基线与 drift 解释
  - agent 诊断文案和自动修复策略
