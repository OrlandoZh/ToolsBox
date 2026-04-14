# Chartero — Vue + Vite + Worker 架构模式

> 生成时间: 2026-04-12
> 项目: Chartero v2.10.0 (Charts for Zotero)
> 源码: `reference/plugin/Chartero-main/`
> GitHub: <https://github.com/volatile-static/Chartero>
> 许可证: AGPL-2.0-or-later

## 一、架构概览

Chartero 是一个为 Zotero 提供数据可视化（阅读进度、时间线、标签云、知识图谱等图表）的插件。其最大价值在于采用了与当前模板完全不同的技术栈：

| 维度 | Chartero | 当前模板 |
|---|---|---|
| UI 框架 | Vue 3 + TDesign | React 18 (optional bundle) |
| 构建工具 | Vite 7 + esbuild | esbuild 直接构建 |
| Worker | ChromeWorker (PDF 处理) | 无 Worker |
| 状态管理 | 组件 data/computed | 无（简单 postMessage） |
| UI 组件库 | TDesign Vue Next | 无 |
| 图表库 | Highcharts + highcharts-vue | 无 |
| 脚手架 | zotero-plugin-scaffold ^0.8.0 | 自研 scripts/build.mjs |

### 1.1 源码分层结构

```
Chartero-main/
├── addon/                          # Zotero 插件静态资源
│   ├── bootstrap.js                # 标准 bootstrap 入口
│   ├── manifest.json               # 占位 manifest（构建时填充）
│   ├── locale/{en,zh-CN,ja,it}/    # 多语言 locale
│   └── content/                    # 图标、preferences.xhtml
├── src/
│   ├── bootstrap/                  # 插件运行时层（构建后编译到 content/）
│   │   ├── index.ts                # 全局 addon 实例化入口
│   │   ├── addon.ts                # Addon 类（zotero-plugin-toolkit 封装）
│   │   ├── events.ts               # Zotero 事件加载/回调
│   │   ├── modules/                # 功能模块
│   │   │   ├── global.ts           # 全局状态 (G 函数)
│   │   │   ├── utils.ts            # 工具 + WorkerManager
│   │   │   ├── prefs.ts            # 设置面板
│   │   │   ├── sidebar.ts          # 侧边栏 Panel 注册
│   │   │   ├── history/            # 阅读历史追踪
│   │   │   ├── minimap/            # PDF 缩略图
│   │   │   ├── images/             # PDF 图片提取
│   │   │   ├── columns.tsx         # 条目列表自定义列
│   │   │   └── recent.ts           # 最近操作记录
│   ├── vue/                        # Vue UI 层
│   │   ├── vite.config.ts          # Vite 构建配置
│   │   ├── dashboard/              # 仪表盘（侧边栏内嵌）
│   │   ├── summary/                # 摘要面板（条目选择时展示）
│   │   ├── overview/               # 总览（独立标签页）
│   │   ├── report/                 # 报告（独立窗口）
│   │   └── test/                   # 本地开发测试环境
│   └── worker/                     # Web Worker 层
│       ├── index.ts                # Worker 入口（Slave 端）
│       ├── manager.ts              # WorkerManagerBase（主从通信协议）
│       └── pdf.ts                  # PDF.js 处理（图片提取/文本提取）
├── tools/
│   ├── build.ts                    # 基于 zotero-plugin-scaffold
│   ├── config.ts                   # 构建配置
│   └── release.ts                  # 发布流程
└── package.json
```

## 二、Bootstrap 入口模式

### 2.1 bootstrap.js — 标准 Zotero 入口

`addon/bootstrap.js` 采用经典 Zotero 插件启动模式：

1. **Chrome 注册**: 通过 `amIAddonManagerStartup.registerChrome` 注册 locale 和 content 映射
2. **Resource 注册**: 通过 `nsISubstitutingProtocolHandler` 注册 `resource://chartero/` 协议
3. **加载编译后的 JS**: `Services.scriptloader.loadSubScript(rootURI + 'content/__addonName__.js', ctx)`
   - 这里 `__addonName__.js` 是构建时由 `src/bootstrap/index.ts` 编译产物
4. **调用 init()**: 调用全局 `addon.init()` 触发初始化

### 2.2 Addon 类 — zotero-plugin-toolkit 封装

`src/bootstrap/addon.ts` 是核心类：

```typescript
export default class Addon extends BasicTool {
    readonly extra: ExtraFieldTool;
    readonly ui: UITool;
    readonly menu: MenuManager;
    readonly patchSearch: PatchHelper;
    readonly history: ReadingHistory;
    readonly worker = new WorkerManager(new ChromeWorker(
        `resource://${packageName}/${config.addonName}-worker.mjs`,
        { type: 'module' }
    ));
    // ...
}
```

**关键设计点**：
- 继承自 `BasicTool`（zotero-plugin-toolkit），复用 toolkit 的基础能力
- Worker 在构造函数中即实例化，使用 `ChromeWorker` + `{ type: 'module' }` 支持 ESM Worker
- Locale 通过 `Zotero.File.getContentsFromURL` 同步加载
- 事件监听器通过 `WeakRef` 管理，防止内存泄漏

### 2.3 事件加载链

```
bootstrap.js:startup()
  └─ addon.init(win?)
       ├─ onAddonLoad()           # 主窗口未指定时调用
       │   ├─ Zotero.PreferencePanes.register()
       │   ├─ Zotero.Notifier.registerObserver()
       │   ├─ Prefs observer
       │   ├─ ReadingHistory.register()
       │   ├─ PatchHelper (patch Zotero.Search.prototype.search)
       │   ├─ registerPanels()    # 侧边栏
       │   ├─ Zotero.Reader.registerEventListener('renderToolbar')
       │   └─ addItemColumns()
       └─ onMainWindowLoad(win)   # 每个新主窗口调用
            ├─ popupshowing 监听
            ├─ menuView 注册（Overview）
            └─ itemsView.onSelect 监听
```

## 三、Vue UI 架构

### 3.1 多页面应用结构

Chartero 不是单页面 Vue App，而是 **4 个独立的 Vite 构建入口**：

| 页面 | 路径 | 用途 | 嵌入方式 |
|---|---|---|---|
| Dashboard | `vue/dashboard/` | 条目阅读进度仪表盘 | iframe → 侧边栏 Section |
| Summary | `vue/summary/` | 多条目统计摘要 | iframe → 条目内容面板 |
| Overview | `vue/overview/` | 全库知识图谱/统计 | iframe → 独立标签页 |
| Report | `vue/report/` | 详细报告 | 独立窗口 |

### 3.2 Vite 构建配置

```typescript
// src/vue/vite.config.ts
build: {
    target: 'firefox140',         // Zotero 基于 Firefox ESR
    rollupOptions: {
        input: {
            summary: resolve(__dirname, 'summary/index.html'),
            overview: resolve(__dirname, 'overview/index.html'),
            dashboard: resolve(__dirname, 'dashboard/index.html'),
        },
    },
    outDir: '../../build/addon/content/',  // 输出到 addon/content/
}
```

- `target: 'firefox140'` — 直接对齐 Zotero 7/8 的 Firefox ESR 内核
- 输出到 `build/addon/content/`，与 bootstrap 编译产物合并后一起打包
- 使用 `@vitejs/plugin-vue` + `@vitejs/plugin-vue-jsx` 双插件
- `unplugin-auto-import` + `unplugin-vue-components` + TDesignResolver 实现组件自动导入

### 3.3 组件通信模式

Vue 页面与 Zotero 宿主之间通过 **iframe postMessage** 通信：

```
Zotero 宿主 (bootstrap/modules/sidebar.ts)
  └─ registerPanels()
       └─ Zotero.ItemPaneManager.registerSection({
            onInit: args => {
                // 创建 iframe
                iframe.contentWindow.wrappedJSObject.addon = addon;
            },
            onItemChange: args => {
                // 条目切换时 postMessage
                post(args.body, { id: args.item.id });
            }
          })

Vue Dashboard (main.vue)
  └─ mounted()
       └─ addEventListener('message', e => {
            if (typeof e.data.id == 'number')
                this.item = Zotero.Items.get(e.data.id);
          })
```

**直接注入 `addon` 实例**：通过 `wrappedJSObject.addon = addon` 将 Zotero 侧的 Addon 实例注入到 iframe 的 window 上，Vue 组件可以直接调用 `addon.history`、`addon.getPref()` 等方法。

### 3.4 组件组织

以 Dashboard 为例：

```
main.vue (根)
├─ PageTime       # 每页阅读时间分布
├─ DateTime       # 时间轴日期视图
├─ TimeLine       # 阅读时间线
├─ UserPie        # 用户贡献饼图
└─ Network        # 条目关系网络
```

所有子组件通过 props 接收 `itemHistory: AttachmentHistory[]` 和 `chartTheme`，使用 Highcharts 渲染图表。

## 四、Worker 架构

### 4.1 主从通信协议

Chartero 实现了一个完整的 **主从 Worker 通信框架**：

```
主进程 (addon.ts)
  └─ WorkerManager (extends WorkerManagerBase<Worker>)
       └─ ChromeWorker(resource://chartero/chartero-worker.mjs)

Worker 进程 (worker/index.ts)
  └─ WorkerSlave (extends WorkerManagerBase<DedicatedWorkerGlobalScope>)
       └─ self (DedicatedWorkerGlobalScope)
```

### 4.2 请求-响应队列

`WorkerManagerBase` 实现了带 ID 的请求-响应队列：

```typescript
// manager.ts
class TaskQueue {
    private readonly data: { [id: number]: Task } = {};
    private head = 0;
    push(task: Task) { return this.data[this.head] = task; return this.head++; }
    pop(id: number) { const task = this.data[id]; delete this.data[id]; return task; }
}
```

- 每次 `query()` 生成唯一 ID，入队 resolve/reject
- Worker 收到 request 后处理，返回 response { id, result }
- 主进程根据 ID 匹配，resolve 对应 Promise

### 4.3 PDF 处理管线

Worker 承担 PDF 解析任务：

```typescript
// worker/pdf.ts
// 1. 使用 Zotero 内置 PDF.js
import * as pdfjsLib from 'resource://zotero/reader/pdf/build/pdf.mjs';

// 2. processPDF — 提取全文文本（通过 Zotero 内置 worker）
// 3. getAllImages — 遍历所有页面提取图片
//    └─ getPageImages → 解析 operator list → paintImageXObject → ImageBitmap
//    └─ 通过 postMessage + Transferable 将 ImageBitmap 传回主进程
```

**关键设计**：使用 `Transferable`（`[dat]` 数组）零拷贝传输 `ImageBitmap`，避免大图片序列化开销。

### 4.4 主进程侧 WorkerManager

```typescript
// bootstrap/modules/utils.ts
export class WorkerManager extends WorkerManagerBase<Worker> {
    private readonly pdfListeners: Record<string, PdfImageListener> = {};

    protected async onRequest(request: WorkerRequest<Worker>) {
        // Worker 主动调用主进程方法（eval 模式）
        const result = await evalCmd(request.method);
        this.that.postMessage({ response: { id: request.id, result } });
    }

    protected onDefault(data: any) {
        // 接收 Worker 推送的流式数据（如图片流）
        if (data.stream?.method == 'allImages') {
            const listener = this.pdfListeners[data.stream.url];
            if (listener) listener(/* page info, payload */);
        }
    }
}
```

Worker 不仅能被动响应请求，还能主动 `postMessage` 推送流式数据（如逐页推送图片）。

## 五、与当前模板的对比

### 5.1 构建系统

| 维度 | Chartero (zotero-plugin-scaffold) | 当前模板 (自研 build.mjs) |
|---|---|---|
| 脚手架 | 官方 `zotero-plugin-scaffold` ^0.8.0 | 自研 `scripts/build.mjs` |
| Vue SFC | Vite 编译 → `build/addon/content/` | 不涉及 |
| Bootstrap TS | esbuild 编译 → `build/addon/content/` | esbuild 编译 → `build/` |
| 开发热更新 | `zotero-plugin-scaffold` Serve 模式 | 无 |
| 配置驱动 | `zotero-plugin.config.ts` + `tools/config.ts` | `config/addon.config.json` |

### 5.2 UI 模式

| 维度 | Chartero | 当前模板 |
|---|---|---|
| UI 渲染 | iframe + Vue SFC | 可选 React bundle |
| 组件注入 | `Zotero.ItemPaneManager.registerSection` + iframe | 取决于实现 |
| 状态传递 | `wrappedJSObject.addon` 直接注入 + postMessage | 取决于实现 |
| UI 组件库 | TDesign Vue Next | 无 |
| 数据可视化 | Highcharts | 无 |

### 5.3 Worker 模式

| 维度 | Chartero | 当前模板 |
|---|---|---|
| Worker 类型 | ChromeWorker (ESM) | 无 |
| 通信协议 | 自定义请求-响应队列 + 流式推送 | 不适用 |
| PDF 处理 | Worker 内使用 Zotero 内置 PDF.js | 主进程 |
| 零拷贝传输 | Transferable (ImageBitmap) | 不适用 |

### 5.4 可借鉴点

1. **iframe + 直接注入 addon 实例**：比纯 postMessage 更灵活，Vue 组件可以同步调用 Zotero API
2. **Worker 主从通信协议**：完整的请求-响应 + 流式推送模式，可用于重计算任务
3. **Vite 多入口构建**：每个 Vue 页面独立构建，输出合并到 addon/content/
4. **zotero-plugin-scaffold**：官方脚手架，提供 build/serve/test/release 全链路
5. **WeakRef 事件监听管理**：防止 DOM 元素被移除后监听器仍然持有引用
6. **PatchHelper 模式**：通过 zotero-plugin-toolkit 的 PatchHelper 安全地 patch Zotero 内部方法

## 六、不可直接搬运的点

1. **Vue 依赖**：当前模板使用 React optional bundle，引入 Vue 会增加技术栈复杂度
2. **Highcharts 商业许可**：Highcharts 非免费商用，需考虑 ECharts 等替代
3. **TDesign 组件库**：体积较大，当前模板的轻量级 UI 可能更适合
4. **Worker 复杂度**：Chartero 的 Worker 主要用于 PDF 图片提取，当前模板暂无此需求
5. **eval 调试后门**：`DebuggerBackend` 允许远程执行 JS 代码，仅 `__dev__` 下启用
