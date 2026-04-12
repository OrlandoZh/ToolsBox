# Zotero Terminology Guide

本指南用于约束模板中的宿主接口、UI surface 与验证文案命名，避免开发时脱离 Zotero 官方语义自造名词。

## Authority

- 首先对齐 `reference/zotero-main` 中的宿主源码命名
- 其次对齐模板内已冻结的 host semantic index、host interface contracts 与 validation surface contracts
- 中文表述优先使用稳定、可复用的 Zotero 开发术语

## Preferred Terms

| Host Term | Preferred Chinese | Use For | Avoid |
| --- | --- | --- | --- |
| `PreferencePanes` / `preference pane` | 偏好设置面板 | 偏好设置注册、偏好设置 surface、相关诊断 | 偏好页 |
| `Item Pane` | 条目窗格 | 右侧条目详情窗格、ItemPaneManager 相关包装层 | 条目面板 |
| `Item Tree` | 条目列表 | 中间条目列表与 ItemTreeManager 相关包装层 | 条目树控件 |
| `context pane` | 上下文窗格 | Reader 侧触发的 context pane surface | Reader 右侧栏面板 |
| `renderToolbar` | `renderToolbar` 工具栏注入 | Reader 官方事件类型与对应 UI 注入点 | toolbar entry |
| `menu item` | 菜单项 | MenuManager 注册结果与真实菜单 surface | menu entry |
| `view context menu` / `createViewContextMenu` | 视图区上下文菜单 | Reader 视图区菜单 surface 与相关事件 | Reader 右键菜单 / 空白区右键 |
| `Sidebar` | 侧边栏 | Reader 或主界面的侧边导航/侧栏状态 | 右侧栏 |
| `annotation context menu` / `createAnnotationContextMenu` | 批注上下文菜单 | Reader 批注菜单 surface 与相关事件 | 注释右键入口 / Reader 右键菜单 |

## Naming Rules

- 命名宿主 API、事件类型和 surface 时，优先保留 Zotero 原始英文名，再补充中文说明。
- 当 API 名称比位置描述更精确时，优先使用 API 名称。
  例如：使用 `renderToolbar`，不要只写“工具栏入口”。
- 当 surface 名称比产品化描述更稳定时，优先使用 surface 名称。
  例如：使用 `context pane`，不要只写“Reader 右侧栏面板”。
- 当需要描述菜单类注入时，优先使用 `menu item`，因为这与 Zotero `MenuData.menuType` 一致。
- 当需要描述 Reader 菜单时，先区分 `reader/menubar/view` 与 `createViewContextMenu` / `createAnnotationContextMenu`。
  前者是 `MenuManager` target，后者是 `Reader.registerEventListener(...)` 事件 surface。
- 不要用笼统的 `reader menu` 同时指代 menubar、view context menu 和 annotation context menu。

## Scope

- 本指南只约束模板里的框架治理、宿主接口包装、验证 surface 与诊断摘要命名
- 宿主字段、枚举、事件与 surface 语义的机器可读事实源见 `docs/ZOTERO_HOST_SEMANTIC_INDEX.md`
- 不约束下游项目的产品功能名、营销文案或业务模块名
