# Jasminum — 中文文献集成架构

> 生成时间: 2026-04-12
> 项目: Jasminum v1.1.35
> 源码: `reference/plugin/jasminum-main/`
> GitHub: <https://github.com/l0o0/jasminum>
> 许可证: AGPL-3.0-or-later

## 一、架构概览

Jasminum 是 Zotero 生态中最成熟的中文文献集成插件，核心能力围绕 CNKI（中国知网）、万方数据、医视三个数据源的多源元数据抓取、中文 PDF 标题提取、HeadlessBrowserService 无头浏览、交互式验证码 Cookie 沙盒、翻译器自动更新与 PDF 大纲提取。

| 维度 | Jasminum | LLM for Zotero | 当前模板 |
|---|---|---|---|
| 版本 | v1.1.35 | v3.7.26 | 取决于实现 |
| toolkit | zotero-plugin-toolkit v5.1.0-beta.4 | 自研 zToolkit | 取决于实现 |
| 核心领域 | 中文文献元数据抓取 + CNKI 集成 | Agent 多轮工具调用 | 取决于实现 |
| 数据源 | CNKI / WanFangData / Yiigle 三源 | 不适用 | 不适用 |
| 浏览器 | HeadlessBrowserService（XUL `<browser>` + page actors） | 不适用 | 不适用 |
| PDF 处理 | 中文标题提取 + 大纲持久化 | 取决于实现 | 取决于实现 |
| 认证 | Cookie 沙盒 + 交互式验证码 | 不适用 | 不适用 |
| 翻译器 | 远程 CDN 测速 + 自动更新 | 不适用 | 不适用 |
| UI 框架 | zotero-plugin-toolkit DOM API | 取决于实现 | 取决于实现 |
| 构建 | zotero-plugin-scaffold v0.8.0 | 取决于实现 | 取决于实现 |

### 1.1 源码分层结构

```
jasminum-main/
├── addon/
│   ├── bootstrap.js                    # 标准 bootstrap
│   ├── chrome/content/
│   └── locale/
├── src/
│   ├── index.ts                        # Addon 类型定义 + 全局入口
│   ├── addon.ts                        # 全局单例创建 + defineGlobal
│   ├── hooks.ts                        # 生命周期（onStartup / onShutdown / onMainWindowLoad）
│   ├── modules/
│   │   ├── services/
│   │   │   ├── cnki.ts                 # CNKI 搜索 / 翻译 / snapshot 解析
│   │   │   └── index.ts               # 多源编排（metaSearch / metaTranslate / globalItemFix）
│   │   ├── outline/
│   │   │   └── outline.ts             # PDF 大纲提取 / JSON 持久化 / schema 迁移 / 树 DOM
│   │   └── translators.ts             # 翻译器更新（CDN 测速 / 12h 间隔 / 进度窗口）
│   └── utils/
│       ├── headlessBrowser.ts          # HeadlessBrowserService（XUL browser + page actors）
│       ├── task.ts                     # ScraperTask / AttachmentTask / TaskRunner
│       ├── cookiebox.ts               # MyCookieSandbox（验证码窗口 / Cookie 提取 / 过期管理）
│       └── pdfParser.ts               # 中文 PDF 标题提取（RecognizerData → PdfData）
├── scripts/                            # 构建脚本
└── package.json                        # zotero-plugin-toolkit v5.1.0-beta.4 + string-similarity
```

## 二、生命周期钩子

### 2.1 启动链

```
bootstrap.js → addon.init()
  └─ hooks.onStartup()
       ├─ initLocale()
       ├─ registerHeadlessActor()      # 注册 JasminumHeadless window actor
       ├─ registerPrefsPane()
       ├─ initPrefs()
       ├─ registerNotifiers()
       ├─ registerMenu()
       ├─ registerTab()
       ├─ registerExtraColumnWithCustomCell()
       ├─ injectStyles()
       └─ wait 1s → onMainWindowLoad() for each window

onMainWindowLoad(window):
  ├─ createZToolkit()
  ├─ wait 10s
  └─ autoUpdateTranslators()           # 如果 pref 开启
```

### 2.2 关闭链

```
hooks.onShutdown()
  ├─ unregisterHeadlessActor()
  ├─ ztoolkit.unregisterAll()
  └─ delete Zotero[config.addonInstance]
```

**关键设计点**：
- `registerHeadlessActor()` 在 `onStartup` 中完成，确保 page actors 在所有窗口可用
- `onMainWindowLoad` 中有 10 秒延迟后才初始化翻译器，给 Zotero 主窗口充分启动时间
- 使用 `createZToolkit()` 按需构建，不是全量导入
- 多窗口支持：每个主窗口加载时独立创建 zToolkit 实例

## 三、多源元数据抓取架构

### 3.1 三源级联搜索

```
metaSearch(task)
  ├─ 解析文件名模式: {%t}_{%g} → {title, author}
  ├─ 计算文件名与搜索结果的 string-similarity
  ├─ WanFangData.search()              // 优先 1
  ├─ Yiigle.search()                   // 优先 2
  ├─ CNKI.search()                     // 兜底
  ├─ 如果 similarity === 1 → 提前返回（精确匹配）
  └─ 返回所有结果，按相似度排序
```

### 3.2 CNKI 搜索详情

```typescript
// cnki.ts → search(searchOption)
POST {api}/litsearch/search
  QueryJson: {
    Platform: "",
    Resource: "CROSSPLATFORM",
    Classid: "16A80F1EA40",
    Products: [{
      ID: "*",
    }],
    QueryItems: [{
      Field: "TI",           // 标题字段
      Value: expression,     // TI %= 表达式
      Operator: "AND",
      ExtendType: SearchExtendType.CJKWordSegment  // CJK 分词
    }, ...authorFilter]
  }

// 返回解析:
parseTable(result.table) → DocTools.mapRow() → SearchItem[]

// 403 → 重试逻辑（可能触发验证码）
if (response.status === 403) {
  await this.getRefworksText(searchResult, 403);  // 重试
}
```

### 3.3 两阶段翻译

```typescript
// cnki.ts → translate(searchResult, libraryID)

// 阶段 1: Zotero Translate (Web)
const translation = new Zotero.Translate.Web();
translation.setTranslatorID(cnkiTranslatorID);
translation.setDocument(doc);
const items = await translation.translate();

// 阶段 2: 如果阶段 1 失败 → Refworks 文本导入
const text = await this.getRefworksText(searchResult);
const translation = new Zotero.Translate.Import();
translation.setTranslator("RefWorks Tagged");
translation.setString(text);
const items = await translation.translate();
```

### 3.4 翻译后修复

```typescript
// globalItemFix()
// - 标签类型转换（Zotero 自动生成的 tag → Jasminum 自定义 tag）
// - 集合保留（翻译过程中不丢失原有 collection 关联）
// - CNKI 特定 extra 字段处理（CNKICite 字段注入）
// - 孤儿笔记清理
```

**关键设计点**：
- 文件名模式解析 `{%t}_{%g}` 是中文文献特有的命名约定
- `string-similarity` 库用于 PDF 文件名与数据库记录的模糊匹配
- 精确匹配（similarity === 1）时提前退出，避免不必要的搜索
- 两阶段翻译确保即使 CNKI 页面结构变化，仍有 Refworks 兜底
- 403 响应自动重试，结合验证码沙盒处理

## 四、HeadlessBrowserService

### 4.1 浏览器创建与配置

```typescript
class HeadlessBrowserService {
  private _createBrowser(): XULBrowserElement {
    // 创建隐藏 XUL <browser> 元素
    const browser = ztoolkit.UI.createElement(document, "browser", {
      attributes: { flex: "0", width: "0", height: "0", ... },
      skipDOM: true,
    });
    // 设置 sandbox flags 和 docShell 配置
    browser.setAttribute("securityflags", "no-cors-overwrite");
    browser.docShell.allowDNSPrefetchResolution = false;
    // ...
  }

  private _configureBrowser(): void {
    // BlockingObserver: 阻止远程资源加载
    // E10SUtils: 处理 remoteness 变化
    // BrowsingContext API: 页面上下文管理
  }
}
```

### 4.2 页面交互

```typescript
async load(url: string): Promise<void>
async waitForSelector(selector: string, timeout?: number): Promise<Element>
async waitForURLChange(): Promise<void>
async click(selector: string): Promise<void>
async fill(selector: string, text: string): Promise<void>
async press(selector: string, key: string): Promise<void>
async evaluate(script: string): Promise<any>
```

### 4.3 Window Actor 注册

```typescript
// registerHeadlessActor()
ChromeUtils.registerWindowActor("JasminumHeadless", {
  parent: { esModuleURI: "chrome://jasminum/content/actors/headlessParent.jsm", },
  child: { esModuleURI: "chrome://jasminum/content/actors/headlessChild.jsm", },
  allFrames: true,
});

// _sendActorQuery() → 5s timeout
browser.messageManager.sendQuery("JasminumHeadless:Query", { script, ... });
```

### 4.4 自动清理

```typescript
// using() 静态方法
static async using<T>(options, fn: (browser: HeadlessBrowserService) => Promise<T>): Promise<T> {
  const browser = new HeadlessBrowserService(options);
  try { return await fn(browser); }
  finally { await browser.destroy(); }  // 自动销毁 browser 元素
}
```

**关键设计点**：
- 这是所有参考插件中最完整的无头浏览器实现
- XUL `<browser>` 元素 + page actors 组合，比 `Zotero.HTTP.request` 能处理更复杂的页面交互
- `BlockingObserver` 阻止不必要的远程资源加载，提高性能
- `E10SUtils` 处理 Firefox 多进程架构下的 remoteness 变化
- `using()` 模式确保浏览器实例一定会被清理，防止内存泄漏
- 所有页面交互通过 page actor 完成，不是直接 DOM 操作

## 五、中文 PDF 标题提取

### 5.1 提取流程

```
getPDFTitle(itemID)
  ├─ Zotero.PDFWorker.getRecognizerData(itemID)  // 获取 OCR 识别数据
  ├─ recognizerDataToPdfData(data)               // 深度转换
  │   └─ pages → lines → words → paragraphs
  ├─ pdfLinesToPdfParagraphs()                   // 按字号 + 语义连贯性 + 排版一致性分组
  ├─ detectDocType(paragraphs)                   // 检测文档类型（article/thesis/book）
  ├─ 根据文档类型选择提取策略
  └─ normalizeText(title)                        // 全角→半角 / 私有区字符清理 / CJK 空格规范化
```

### 5.2 文档类型检测

```typescript
function detectDocType(paragraphs: PdfParagraph[]): DocType {
  // 匹配论文特征: 学位论文、博士学位、硕士学位论文...
  // 匹配图书特征: 出版社、ISBN、版次...
  // 默认: article
}
```

### 5.3 标题提取策略

```typescript
// getArticleTitle(): 首页最大字号段落
// getThesisTitle(): 在论文特征标记（"学位论文"等）后的段落
```

### 5.4 段落分组算法

```typescript
function pdfLinesToPdfParagraphs(lines: PdfLine[]): PdfParagraph[] {
  // 1. 按字号分组
  // 2. 语义连贯性检测（CJK 标点符号桥接）
  // 3. 排版一致性检测
  // 4. 合并为段落
}
```

**关键设计点**：
- 依赖 Zotero 内置的 `PDFWorker.getRecognizerData()`，不是自己实现 OCR
- CJK 感知段落分组：利用中文标点符号（如句号、逗号）作为行与行之间的桥接
- 文档类型检测使用正则模式匹配，不是 ML 分类
- 全角→半角转换处理中文 PDF 常见的编码问题
- 私有使用区字符（Private Use Area）清理防止乱码

## 六、Cookie 沙盒与验证码处理

### 6.1 Cookie 沙盒

```typescript
class MyCookieSandbox {
  private _CNKIHomeCookieBox: {
    cookieBox: Window | null,
    expiryTime: number,           // 5 分钟过期
    _initPromise: Deferred<void>, // 去重初始化
    _captchaPromise: Deferred<void> // 并发验证码去重
  };

  async getCookieBoxFromUrl(url: string): Promise<Window> {
    // 1. 在 viewer 窗口中打开 CNKI
    // 2. 注入"确认完成验证"按钮到 DOM
    // 3. 用户手动完成验证码后点击确认
    // 4. 通过 getCookiesForURI 提取 Cookie
  }

  async passCaptchaToCookieBox(): Promise<void> {
    // 处理 403 响应: 打开验证码窗口
    // _captchaPromise 去重: 多个并发请求共享同一个验证码窗口
  }

  async getCNKIHomeCookieBox(): Promise<Window> {
    // 检查过期 → 如果过期则重新初始化
  }
}
```

**关键设计点**：
- 这是所有参考插件中独有的模式，其他插件都没有交互式验证码处理
- `_captchaPromise` 确保多个并发搜索不会弹出多个验证码窗口
- 5 分钟 Cookie 过期机制，平衡了安全性和用户体验
- 用户手动完成验证码，插件只负责等待和提取结果
- `getCookiesForURI` 是 Firefox 原生 API，不是第三方依赖

## 七、TaskRunner 与延迟用户选择

### 7.1 任务状态机

```
ScraperTask:
  waiting → processing → multiple_results / success / fail

  // deferred Promise 模式
  private _deferred: Deferred<SearchItem | null>;

  // 多个搜索结果时等待用户选择
  set searchResults(results: SearchItem[]) {
    this._searchResults = results;
    this.updateProgressUI();
    if (results.length > 1) {
      // 等待用户选择，不自动继续
      this._deferred.promise.then(selectedItem => ...);
    }
  }
```

### 7.2 TaskRunner 执行

```typescript
class TaskRunner {
  private runningTask: ScraperTask | null = null;  // 同时只运行一个任务

  async addTask(task: ScraperTask): Promise<void> {
    this.runningTask = task;
    await this.runTask(task);
  }

  async runScrapeTask(task: ScraperTask): Promise<void> {
    const results = await metaSearch(task);    // 多源搜索
    // 等待用户选择（如果有多个结果）
    const selected = await task.waitForSelection();
    await metaTranslate(task, selected);       // 翻译
  }

  resumeTask(selectedItem: SearchItem): void {
    this.runningTask?.deferred.resolve(selectedItem);  // 解决 deferred
  }
}
```

**关键设计点**：
- 同时只运行一个任务（`runningTask` singleton），避免并发冲突
- `deferred` Promise 模式：搜索完成后暂停，等用户选择后再继续翻译
- 状态机确保任务状态可追踪：`waiting → processing → multiple_results → success/fail`
- `resumeTask()` 从 UI 层接收用户选择，解决 deferred Promise

## 八、翻译器自动更新系统

### 8.1 CDN 测速

```typescript
async bestSpeedBaseUrl(): Promise<string> {
  const urls = [cdn1, cdn2, cdn3];
  const promises = urls.map(url =>
    Zotero.HTTP.request("HEAD", url, { timeout: 5000 })
      .then(() => ({ url, time: Date.now() - start }))
      .catch(() => ({ url, time: Infinity }))
  );
  const results = await Promise.all(promises);
  return results.sort((a, b) => a.time - b.time)[0].url;  // 最快的 CDN
}
```

### 8.2 更新逻辑

```typescript
async updateTranslators(): Promise<void> {
  // 1. 检查 12 小时间隔
  const lastUpdate = prefs.get("translatorsLastUpdate");
  if (Date.now() - lastUpdate < 12 * 60 * 60 * 1000) return;

  // 2. 获取远程 translator 版本映射
  const remoteMap = await getLastUpdatedMap();

  // 3. 对比本地与远程 lastUpdated
  for (const [file, remoteInfo] of remoteMap) {
    const localInfo = getLocalTranslatorInfo(file);
    if (remoteInfo.lastUpdated > localInfo.lastUpdated) {
      downloadTranslators(file);  // 下载更新
    }
  }

  // 4. 写入 Zotero.DataDirectory.dir/translators/
  // 5. Zotero.Translators.reinit() 重新加载
}
```

**关键设计点**：
- 12 小时更新间隔，避免频繁请求
- 逐文件 `lastUpdated` 对比，只更新真正变化的翻译器
- 并发测速选择最快 CDN
- 更新后调用 `Zotero.Translators.reinit()` 重新加载
- `mendTranslators()` 检测缺失的 Endnote XML 翻译器，损坏时重置所有翻译器

## 九、PDF 大纲提取与持久化

### 9.1 提取与缓存

```typescript
async getOutlineFromPDF(reader: ReaderInstance): Promise<OutlineNode[]> {
  // 1. 从 JSON 缓存读取
  const cached = loadOutlineInfoFromJSON(item);
  if (cached) return cached;

  // 2. 从 PDF 提取
  const pdfDocument = Zotero.PDFWorker.getPDFDocument(item.id);
  const rawOutline = await pdfDocument.getOutline2();

  // 3. 递归扁平化
  function convert(items: RawOutlineItem[], depth: number): OutlineNode[] {
    return items.map(item => ({
      title: item.title,
      depth,
      expanded: false,
      children: convert(item.items, depth + 1),
    }));
  }

  // 4. 保存到 JSON
  saveOutlineToJSON(item, outline, baseFontSize);
  return outline;
}
```

### 9.2 JSON 持久化与 Schema 迁移

```typescript
// storage/{item.key}/jasminum-outline.json
{
  version: 2,              // schema 版本
  outline: OutlineNode[],
  baseFontSize: 14         // v2 新增
}

// Schema 迁移: v1 → v2
if (data.version === 1) {
  data.version = 2;
  data.baseFontSize = 14;  // 添加默认字体大小
}
```

### 9.3 树 DOM 创建

```typescript
function createTreeNodes(outline: OutlineNode[], parent: HTMLElement): void {
  for (const node of outline) {
    const li = document.createElement("li");
    const expander = createExpanderIcon(node);   // 展开/折叠图标
    const label = createLabel(node.title);
    li.appendChild(expander);
    li.appendChild(label);
    if (node.children.length > 0) {
      const ul = document.createElement("ul");
      createTreeNodes(node.children, ul);
      li.appendChild(ul);
    }
  }
}
```

**关键设计点**：
- 大纲 JSON 缓存在 `storage/{item.key}/` 目录，不是内存
- Schema 迁移确保旧版本数据兼容
- 动态字体大小：`updateOutlineFontSize()` 通过 CSS 注入实现主题切换
- 深色/浅色主题同步：`registerThemeChange()` 监听 `prefers-color-scheme`
- 递归 DOM 树创建，支持无限层级嵌套

## 十、与 LLM for Zotero 的架构对比

### 10.1 领域差异

| 维度 | Jasminum | LLM for Zotero |
|---|---|---|
| 核心领域 | 中文文献元数据抓取 | AI Agent 多轮对话 |
| 数据源 | CNKI / WanFangData / Yiigle | 5 种 AI 模型适配器 |
| 浏览器 | HeadlessBrowserService（XUL browser） | 不适用 |
| 认证 | Cookie 沙盒 + 验证码 | API Key 认证 |
| 翻译 | Zotero Translate 两阶段 | 不适用 |
| PDF | 中文标题提取 + 大纲 | 取决于实现 |
| 用户交互 | 多结果选择 + 验证码确认 | HITL 确认流 |
| 更新 | 翻译器自动更新（CDN 测速） | 不适用 |
| 架构模式 | 单任务串行 + deferred 选择 | Agent 多轮工具调用 |
| 状态管理 | 状态机（waiting/processing/success/fail） | traceStore + conversationMemory |

### 10.2 可借鉴的通用模式

Jasminum 的以下模式虽然是针对中文文献场景设计的，但其中有几个可以泛化到当前模板：

1. **HeadlessBrowserService + page actor 模式**：最完整的无头浏览器实现，适用于需要复杂页面交互的场景（登录、表单填写、验证码等）
2. **deferred 用户选择模式**：搜索出多个结果后暂停，等用户选择后再继续，而不是自动选第一个
3. **TaskRunner 单例串行执行**：同时只运行一个任务，避免并发冲突和资源竞争
4. **多源级联搜索 + 相似度匹配**：多个数据源按优先级依次搜索，精确匹配时提前退出
5. **Cookie 沙盒 + 交互式验证码**：用户手动完成验证码，插件等待并提取结果
6. **翻译器 CDN 测速 + 增量更新**：并发测速选择最快源，逐文件对比只更新变化的
7. **PDF 大纲 JSON 持久化 + schema 迁移**：缓存结构带版本号，旧数据自动迁移
8. **`using()` 自动清理模式**：静态方法确保资源一定会被释放

### 10.3 不可直接搬运的点

1. **CNKI 专用 QueryJson 结构**：高度耦合 CNKI API，不能直接复用
2. **string-similarity 模糊匹配**：依赖中文文件名命名约定 `{%t}_{%g}`，非通用
3. **中文 PDF 标题提取**：依赖 CJK 特定的排版规则和标点符号桥接
4. **Zotero.Translate.Web 两阶段翻译**：依赖 Zotero 内置的 CNKI translator
5. **`pdfDocument.getOutline2()`**：Zotero PDFWorker 的内部 API，可能不稳定
6. **`Zotero.PDFWorker.getRecognizerData()`**：Zotero 内部 API，不是公开 contract
7. **XUL `<browser>` 元素**：Firefox/XUL 特有，不适用于其他宿主
8. **ChromeUtils.registerWindowActor**：Firefox 原生 API，不是 Zotero 插件通用接口
9. **5 分钟 Cookie 过期**：特定于 CNKI 的反爬策略
10. **12 小时翻译器更新间隔**：特定于翻译器更新频率，不是通用缓存策略

### 10.4 当前模板应跳过的坑

1. **不要硬编码数据源 URL**：Jasminum 的 CNKI API URL 是硬编码的，应该使用配置化的数据源注册
2. **不要依赖 Zotero 内部 API**：`PDFWorker.getRecognizerData()` 和 `pdfDocument.getOutline2()` 不是公开 API，Zotero 升级可能破坏
3. **不要全量导入 zotero-plugin-toolkit**：Jasminum 已经使用 `createZToolkit()` 按需构建
4. **不要跳过 schema 版本**：JSON 持久化一定要带 `version` 字段，方便后续迁移
5. **不要忽视 deferred 选择的用户体验**：多个结果时给用户选择，而不是自动选第一个
6. **不要在主线程做阻塞式网络请求**：Jasminum 的 CDN 测速是并发的，这是正确做法
7. **不要忘记自动清理资源**：`using()` 模式确保 HeadlessBrowserService 一定会被销毁
