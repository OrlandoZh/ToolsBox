# zotero-better-notes — Hook + Custom Element + 全功能笔记系统

> 生成时间: 2026-04-12
> 项目: zotero-better-notes v3.0.3
> 源码: `reference/plugin/zotero-better-notes-master/`
> GitHub: <https://github.com/windingwind/zotero-better-notes>
> 许可证: AGPL-3.0-or-later

## 一、架构概览

zotero-better-notes 是 Zotero 的全功能笔记增强插件，提供笔记模板、Markdown 转换、工作区、自动同步、知识关联等能力。其核心架构模式与当前模板形成鲜明对比：

| 维度 | Better Notes | 当前模板 |
|---|---|---|
| UI 架构 | Custom Element (bn-workspace) + XUL | 取决于实现 |
| 生命周期 | Hook-based (onStartup/onNotify) | bootstrap init/shutdown |
| 工具集 | MyToolkit (选择性导入) | 直接导入或无 |
| 笔记引擎 | ProseMirror + remark/rehype | 取决于实现 |
| 数据持久化 | Dexie (IndexedDB) | 取决于实现 |
| 构建工具 | zotero-plugin-scaffold ^0.8.0 | 自研 scripts/build.mjs |
| Worker 管线 | 4 种 Worker (convert/parsing/relation/docx) | 无 Worker |
| 公共 API | 10+ 命名空间 (workspace/sync/convert/template...) | 取决于实现 |

### 1.1 源码分层结构

```
zotero-better-notes-master/
├── addon/
│   ├── bootstrap.js                # 标准 bootstrap 入口
│   ├── manifest.json               # 插件 manifest
│   ├── locale/{en,zh-CN,ja}/       # 多语言
│   └── content/                    # 静态资源、偏好设置
├── src/
│   ├── index.ts                    # 全局入口 (_globalThis.addon, ztoolkit)
│   ├── addon.ts                    # Addon 类 (状态中心 + createZToolkit)
│   ├── hooks.ts                    # 生命周期钩子 + 事件分发
│   ├── api.ts                      # 公共 API 表面 (10+ 命名空间)
│   ├── utils/
│   │   ├── ztoolkit.ts             # MyToolkit 模式 (选择性导入)
│   │   ├── editor.ts               # ProseMirror 编辑器工具
│   │   ├── template.ts             # 模板解析
│   │   └── ...
│   ├── elements/                   # Custom Elements
│   │   ├── base.ts                 # PluginCEBase
│   │   ├── workspace/
│   │   │   ├── workspace.ts        # bn-workspace (三栏布局)
│   │   │   └── ...
│   │   ├── outline/                # bn-outline
│   │   └── context/                # bn-context
│   ├── modules/                    # 功能模块
│   │   ├── workspace/              # 工作区系统
│   │   ├── sync/                   # 笔记同步 (diff/merge)
│   │   ├── template/               # 模板系统 (Monaco 编辑器)
│   │   ├── convert/                # MD/HTML/LaTeX 转换
│   │   ├── relation/               # 知识关联
│   │   ├── editor/                 # ProseMirror 插件
│   │   └── note/                   # 笔记管理
│   └── worker/                     # Worker 入口
│       ├── convertWorker.ts        # 转换管线
│       ├── parsingWorker.ts        # 解析管线
│       ├── relationWorker.ts       # 关联分析
│       └── docxWorker.ts           # DOCX 导出
├── tools/
│   └── build.ts                    # zotero-plugin-scaffold
└── package.json
```

## 二、Hook-Based 生命周期

### 2.1 Hook 分发器

Better Notes 不使用 bootstrap.js 直接调用 init/shutdown，而是通过 **hook 分发器** 管理生命周期：

```
bootstrap.js → _globalThis.addon.init()
  └─ hooks.ts: onStartup()
       ├─ createZToolkit()
       ├─ 注册全局快捷键
       ├─ 初始化各模块 (workspace, sync, template, relation...)
       └─ 注册 notifier
  └─ hooks.ts: onMainWindowLoad(win)
       ├─ 注册 UI 元素
       └─ 注册菜单
  └─ hooks.ts: onNotify(event, type, ids)
       ├─ type == 'item' → onNotifyItem(ids)
       ├─ type == 'file' → onNotifyFile(ids)
       └─ type == 'tab' → onNotifyTab(ids)
  └─ hooks.ts: onShutdown()
       └─ 清理资源、保存状态
```

### 2.2 Hook 注册模式

```typescript
// hooks.ts
export function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any }
) {
  try {
    switch (type) {
      case "item":
        addon.hooks.onNotifyItem(ids);
        break;
      case "file":
        addon.hooks.onNotifyFile(ids);
        break;
      case "tab":
        addon.hooks.onNotifyTab(ids);
        break;
      default:
        break;
    }
  } catch (e) {
    log.error("notify hook", e);
  }
}
```

**关键设计点**：
- `try/catch` 包裹每个 hook 调用，防止一个 hook 崩溃影响其他 hook
- notifier 通过 `Zotero.Notifier.registerObserver` 注册，接收所有事件
- hook 内部分发到具体模块，各模块自行判断是否需要响应

### 2.3 笔记打开 Hook

`onOpenNote` 支持多种模式：

| 模式 | 行为 |
|---|---|
| auto | 根据设置自动选择 |
| preview | 预览模式（只读） |
| tab | 在 Zotero 标签页中打开 |
| window | 独立窗口 |
| builtin | 使用 Zotero 内置笔记编辑器 |

## 三、MyToolkit 模式

### 3.1 选择性导入 vs 完整导入

Better Notes 不使用 `ZoteroToolkit` 完整导入，而是创建 `MyToolkit` 类：

```typescript
// utils/ztoolkit.ts
export class MyToolkit extends BasicTool {
  UI: UITool;
  Menu: MenuManager;
  Clipboard: ClipboardHelper;
  FilePicker: FilePickerHelper;
  ProgressWindow: ProgressWindowHelper;
  VirtualizedTable: VirtualizedTableHelper;
  Dialog: DialogHelper;
  LargePref: LargePrefHelper;
  Guide: GuideHelper;
}
```

**关键设计点**：
- 只导入实际使用的 helper，减少打包体积
- `BasicTool` 是 zotero-plugin-toolkit 的基类，所有 helper 都继承它
- 通过 `createZToolkit()` 函数创建实例，而非直接 `new ZoteroToolkit()`
- 生产环境禁用 elementJSONLog 和 DOMLog（dev-only）

### 3.2 与当前模板对比

| 维度 | Better Notes (MyToolkit) | 当前模板 |
|---|---|---|
| 导入方式 | 选择性导入 8 个 helper | 取决于实现 |
| 基类 | BasicTool | 取决于实现 |
| Dev 工具 | 生产环境自动禁用 | 取决于实现 |
| 体积优化 | 通过选择性导入减少 | 取决于实现 |

## 四、Custom Element 架构

### 4.1 PluginCEBase

所有 Custom Element 继承自 `PluginCEBase`：

```typescript
// elements/base.ts
abstract class PluginCEBase extends HTMLElement {
  abstract get addon(): typeof _globalThis.addon;
  abstract get window(): Window;
  abstract connectedCallback(): void;
  abstract disconnectedCallback(): void;
}
```

**关键设计点**：
- 提供 `addon` 和 `window` 的 getter，子类可以直接访问
- 生命周期通过 `connectedCallback` / `disconnectedCallback` 管理
- 与 Zotero 的 DOM 生命周期对齐

### 4.2 bn-workspace 三栏布局

`bn-workspace` 是核心工作区元素：

```typescript
// elements/workspace/workspace.ts
class Workspace extends PluginCEBase implements VirtualWorkspace {
  // 三栏
  //   left:   bn-outline (标题大纲)
  //   center: note-editor (ProseMirror 编辑器)
  //   right:  bn-context (上下文面板)

  connectedCallback() {
    // 创建 XUL 布局
    const container = document.createElementNS(XUL_NS, "vbox");
    // 左栏
    const outline = document.createElement("bn-outline");
    // 中栏
    const editorContainer = document.createElement("div");
    // 右栏
    const context = document.createElement("bn-context");
    // 分割条
    const splitter1 = document.createElementNS(XUL_NS, "splitter");
    const splitter2 = document.createElementNS(XUL_NS, "splitter");
  }
}
```

**关键设计点**：
- 使用 XUL `vbox` + `splitter` 实现可调整大小的三栏布局
- 状态持久化通过 `Services.prefs` 保存面板宽度和可见性
- `ResizeObserver` 监听编辑器滚动容器变化，同步更新 UI
- 工具栏按钮通过 `Zotero.UI.registerToolbarButton` 注入

### 4.3 Custom Element 注册

```typescript
// modules/workspace/content.ts
export async function initWorkspace() {
  customElements.whenDefined("bn-workspace").then(() => {
    const workspace = document.createElement("bn-workspace");
    container.appendChild(workspace);
  });
}
```

**关键设计点**：
- 使用 `customElements.whenDefined` 等待元素注册完成
- 防止在元素未注册时创建实例导致报错
- 适合异步加载的 Custom Element（由 Zotero 或其他模块注册）

## 五、公共 API 表面

Better Notes 提供了 **10+ 命名空间** 的公共 API，可供其他插件调用：

### 5.1 API 命名空间

| 命名空间 | 核心方法 | 用途 |
|---|---|---|
| `workspace` | open, close, getWorkspace | 工作区管理 |
| `sync` | sync, getSyncState | 笔记同步状态 |
| `convert` | md2note, note2md, note2html, note2latex | 格式转换 |
| `template` | runTemplate, runTextTemplate, renderTemplatePreview | 模板系统 |
| `$export` | exportNote, exportNotes | 笔记导出 |
| `$import` | importNote, importNotes | 笔记导入 |
| `editor` | insert, del, move, replace | 编辑器操作 |
| `note` | create, delete, getNote | 笔记管理 |
| `relation` | getRelations, addRelation | 知识关联 |
| `utils` | ... | 工具方法 |

### 5.2 关键 API 示例

```typescript
// 笔记转换
api.convert.md2note({ content: string, item: Zotero.Item })
api.convert.note2md({ item: Zotero.Item })
api.convert.note2html({ item: Zotero.Item })
api.convert.note2latex({ item: Zotero.Item })
api.convert.content2diff({ before: string, after: string })

// 编辑器操作
api.editor.insert({ position: number, content: string })
api.editor.del({ from: number, to: number })
api.editor.move({ from: number, to: number, content: string })
api.editor.replace({ from: number, to: number, content: string })

// 模板系统
api.template.runTemplate({ template: string, item: Zotero.Item })
api.template.runTextTemplate({ template: string, text: string })
api.template.renderTemplatePreview({ template: string })
```

**关键设计点**：
- API 按功能命名空间组织，便于发现和调用
- `api.ts` 是单一出口，其他模块通过 `addon.api` 访问
- 支持 diff/merge 操作，可用于笔记同步和冲突解决

## 六、Worker 管线

Better Notes 使用 **4 种独立的 Worker** 处理重计算任务：

| Worker | 用途 | 技术栈 |
|---|---|---|
| convertWorker | MD/HTML/LaTeX 转换 | unified, remark, rehype |
| parsingWorker | 笔记内容解析 | ProseMirror, remark |
| relationWorker | 知识关联分析 | 图算法 |
| docxWorker | DOCX 导出 | docx 库 |

**与 Chartero 对比**：
- Chartero: 1 个 ChromeWorker (ESM)，主从通信协议，请求-响应 + 流式推送
- Better Notes: 4 个 Worker，各自独立职责，无主从通信协议
- 当前模板: 无 Worker

## 七、与当前模板的对比

### 7.1 架构模式

| 维度 | Better Notes | 当前模板 |
|---|---|---|
| 生命周期 | Hook-based 分发器 | bootstrap init/shutdown |
| UI 架构 | Custom Element + XUL | 取决于实现 |
| 工具集 | MyToolkit (选择性导入) | 取决于实现 |
| 笔记引擎 | ProseMirror | 取决于实现 |
| 数据层 | Dexie (IndexedDB) | 取决于实现 |
| 公共 API | 10+ 命名空间 | 取决于实现 |
| Worker | 4 种独立 Worker | 无 |
| 构建系统 | zotero-plugin-scaffold | 自研 build.mjs |

### 7.2 可借鉴点

1. **Hook-based 分发器**：将 notifier 事件分发到具体模块 hook，每个 hook 独立 try/catch
2. **MyToolkit 模式**：选择性导入 zotero-plugin-toolkit helper，减少打包体积
3. **Custom Element 架构**：bn-workspace 三栏布局 + 状态持久化 + ResizeObserver 同步
4. **公共 API 表面**：按功能命名空间组织，便于其他插件调用
5. **`customElements.whenDefined`**：等待元素注册完成再创建实例
6. **Worker 职责分离**：4 种 Worker 各自独立，避免单点故障
7. **Diff/Merge API**：content2diff 支持笔记同步和冲突解决

### 7.3 不可直接搬运的点

1. **ProseMirror 依赖**：体积大、复杂度高，当前模板暂无富文本编辑器需求
2. **Dexie (IndexedDB)**：Browser-only API，Zotero 主进程不支持
3. **XUL 布局**：Zotero 专用 UI 框架，与 Web 标准不兼容
4. **Monaco 编辑器**：模板系统依赖，体积大
5. **unified/remark/rehype 生态**：Markdown 处理管线，当前模板暂无此需求
6. **10+ API 命名空间**：Better Notes 是"平台级"插件，当前模板不需要这么宽的 API
