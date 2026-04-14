# Zotero PDF Translate — 翻译管线 + 多服务架构

> 生成时间: 2026-04-12
> 项目: Zotero PDF Translate v2.4.3
> 源码: `reference/plugin/zotero-pdf-translate-main/`
> GitHub: <https://github.com/windingwind/zotero-pdf-translate>
> 许可证: AGPL-3.0-or-later

## 一、架构概览

Zotero PDF Translate 是 Zotero 的翻译增强插件，支持 PDF/EPub/网页/元数据/标注/笔记的多语言翻译。其核心架构模式：

| 维度 | PDF Translate | 当前模板 |
|---|---|---|
| 构建工具 | zotero-plugin-scaffold ^0.8.2 | 自研 scripts/build.mjs |
| 翻译引擎 | 40+ 服务插件化 | 不适用 |
| 语言检测 | franc + ISO6393 映射 | 不适用 |
| 任务队列 | TranslateTask 队列 + 批量处理 | 不适用 |
| 外部 API | translate/getServices/getTemporaryRefreshHandler | 不适用 |
| Reader 集成 | renderTextSelectionPopup + renderSidebarAnnotationHeader | 不适用 |
| toolkit 版本 | zotero-plugin-toolkit v5.1.0-beta.8 | 取决于实现 |

### 1.1 源码分层结构

```
zotero-pdf-translate-main/
├── addon/
│   ├── bootstrap.js                # 标准 bootstrap
│   ├── manifest.json
│   ├── locale/{en,zh-CN,ja,it}/    # 多语言
│   └── content/                    # preferences.xhtml, customElements.js
├── src/
│   ├── index.ts                    # 全局入口 (addon, ztoolkit)
│   ├── addon.ts                    # Addon 类 (data.translate / data.popup)
│   ├── hooks.ts                    # 生命周期 + 事件分发
│   ├── api.ts                      # 公共 API (translate/getServices/getTemporaryRefreshHandler)
│   ├── modules/
│   │   ├── services/               # 40+ 翻译服务
│   │   │   ├── base.ts             # TranslateService 接口
│   │   │   ├── index.ts            # TranslationServices 类
│   │   │   ├── google.ts           # Google 翻译
│   │   │   ├── deepl.ts            # DeepL Free/Pro
│   │   │   ├── gpt.ts              # ChatGPT + 自定义 GPT
│   │   │   ├── gemini.ts           # Gemini
│   │   │   ├── claude.ts           # Claude
│   │   │   ├── baidu.ts            # 百度翻译
│   │   │   ├── youdao.ts           # 有道翻译
│   │   │   └── ...                 # 40+ 服务
│   │   ├── reader.ts               # Reader 事件注册 (popup/sidebar)
│   │   ├── popup.ts                # Reader popup 构建与刷新
│   │   ├── preferenceWindow.ts     # 设置面板
│   │   ├── tabpanel.ts             # Reader 标签页面板
│   │   ├── menu.ts                 # 右键菜单
│   │   ├── shortcuts.ts            # 快捷键
│   │   ├── itemTree.ts             # 条目列表额外列
│   │   ├── infoBox.ts              # 信息面板额外行
│   │   ├── notify.ts               # Notifier 注册
│   │   ├── fields.ts               # 自定义字段
│   │   ├── defaultPrefs.ts         # 默认偏好
│   │   └── prompt.ts               # 命令面板
│   └── utils/
│       ├── task.ts                 # TranslateTask + TranslateTaskRunner
│       ├── config.ts               # 语言代码 + franc 检测
│       ├── locale.ts               # 国际化
│       ├── prefs.ts                # 偏好读写
│       └── str.ts                  # 字符串工具
├── test/
├── zotero-plugin.config.ts
└── package.json
```

## 二、生命周期钩子

### 2.1 启动链

```
bootstrap.js → addon.init()
  └─ hooks.onStartup()
       ├─ 等待 Zotero 三重 Promise
       ├─ initLocale()
       ├─ setDefaultPrefSettings()
       ├─ registerCustomFields()          # 自定义字段注册
       ├─ registerReaderInitializer()     # Reader 事件监听
       ├─ registerShortcuts()
       ├─ registerNotify(["item"])        # 条目通知
       ├─ registerPrefsWindow()
       ├─ registerExtraColumns()          # 条目列表额外列
       ├─ registerItemPaneInfoRows()      # 信息面板额外行
       ├─ registerReaderTabPanel()        # Reader 标签页面板
       └─ onMainWindowLoad(win) for each
            ├─ 加载 customElements.js
            ├─ registerMenu()
            └─ registerPrompt()
```

**关键设计点**：
- 启动链简单直接，无 SQLite/认证等重型初始化
- `customElements.js` 在 `onMainWindowLoad` 时通过 `loadSubScript` 动态加载
- 所有注册函数职责单一，hooks 只做分发

### 2.2 关闭链

```
hooks.onShutdown()
  ├─ ztoolkit.unregisterAll()
  ├─ onMainWindowUnload(win) for each     # 移除 FTL 资源
  ├─ addon.data.alive = false
  └─ delete Zotero[config.addonInstance]
```

## 三、TranslateTask 队列系统

### 3.1 任务接口

```typescript
interface TranslateTask {
  id: string;                             // 唯一 ID
  type: "text" | "annotation" | "title" | "abstract" | "addtonote" | "custom";
  raw: string;                            // 原始文本
  result: string;                         // 翻译结果
  audio: { text: string, url: string }[]; // 音频 (发音服务)
  service: string;                        // 当前服务 ID
  candidateServices: string[];            // 候选服务列表 (失败时 fallback)
  itemId: number | undefined;             // 关联条目
  langfrom: string | undefined;           // 源语言
  langto: string | undefined;             // 目标语言
  secret: string;                         // 服务密钥
  status: "waiting" | "processing" | "success" | "fail";
  extraTasks: TranslateTask[];            // 额外子任务 (异步并行)
  callerID: string;                       // 调用者 ID
}
```

### 3.2 任务队列管理

```typescript
// addon.ts
interface AddonData {
  translate: {
    selectedText: string;                 // Reader 选中文本
    concatKey: boolean;                   // 拼接模式开关
    queue: TranslateTask[];               // 任务队列
    maximumQueueLength: number;           // 默认 100
    batchTaskDelay: number;               // 默认 1000ms
    services: TranslationServices;        // 服务注册表
    cachedSourceLanguage: string;         // 缓存的源语言
    refreshTick: number;                  // 刷新计数
  };
}
```

**关键设计点**：
- `queue.findLast()` 用于缓存查找（相同 raw + service + 语言 = 缓存命中）
- 队列长度上限 100，超出时丢弃最旧任务
- 批量翻译时，每个任务间插入 `batchTaskDelay` (1000ms) 防止限流

### 3.3 任务创建工厂

```typescript
// utils/task.ts
addTranslateTask(raw: string, itemId?: number, type?: string)
addTranslateAnnotationTask(libraryId: number, annotationId: string)
addTranslateTitleTask(itemId: number, skipIfExists?: boolean)
addTranslateAbstractTask(itemId: number)
getLastTranslateTask(filter?: Partial<TranslateTask>)
```

### 3.4 Concat 模式

```typescript
// 用户按住 Ctrl/Command 选择多段文本时，启用拼接模式
if (ev.ctrlKey || ev.metaKey) {
  addon.data.translate.concatKey = true;
}
// concatKey 为 true 时，新文本追加到最后一个 task.raw
```

**关键设计点**：
- `focusout` 事件自动重置 `concatKey`
- 允许用户在 PDF 中连续选多段文本一次性翻译

## 四、多服务插件架构

### 4.1 TranslateService 接口

```typescript
interface TranslateService {
  id: string;                              // 唯一服务 ID (小写 + 连字符)
  type: "word" | "sentence";               // 服务类型
  name?: string;                           // 显示名
  helpUrl?: string;                        // 帮助链接
  defaultSecret?: string;                  // 默认密钥
  secretValidator?: (secret: string) => SecretValidateResult;
  translate: TranslateTaskProcessor;       // 主翻译函数
  config?: (settings: AllowedSettingsMethods) => void;  // 可选配置 UI
  requireExternalConfig?: boolean;         // 是否需要外部配置 (Docker 等)
}
```

### 4.2 服务注册表 (40+)

| 类别 | 服务 |
|---|---|
| 通用翻译 | Google, GoogleAPI, Bing, Microsoft, DeepL Free/Pro/Custom/X, LibreTranslate |
| 中文服务 | 百度, 百度专业, 阿里, 腾讯, 腾讯 Transmart, 彩云, 火山, 火山 Web, 腾讯交互翻译 |
| 词典 | BingDict, CambridgeDict, CollinsDict, YoudaoDict, HaiciDict, WeblioDict, FreeDictionaryAPI |
| LLM | ChatGPT (+ 3 自定义 + Azure), Gemini, Claude, QwenMT |
| 学术 | Cnki (CNKI 翻译), Haici (海词) |
| 开源/自托管 | NLLB, Pot, Mtranserver, OpenL, Niutrans |
| 其他 | 有道, 有道智云, 有道智云 LLM, 讯飞 |

### 4.3 服务排序规则

```typescript
// 1. 免费无需配置的服务 (无 secret, 无 config) → 最前
// 2. 需要密钥但无配置 UI 的服务
// 3. 需要外部配置的服务 (Docker 等)
// 4. custom 开头的服务 → 最后
```

### 4.4 服务失败 Fallback

```typescript
// runTranslationTask 内部
if (task.status === "fail" && task.candidateServices.length > 0) {
  task.service = task.candidateServices.shift()!;
  task.status = "waiting";
  return await this.runTranslationTask(task, options);  // 递归调用下一服务
}
```

**关键设计点**：
- 每个任务自带 `candidateServices` 列表
- 失败时自动切换到下一个候选服务
- 递归调用，直到成功或候选耗尽

## 五、语言自动检测

```typescript
// utils/config.ts
function inferLanguage(text: string): string {
  // franc 检测 + minLength: 3
  const detected = franc(text, { minLength: 3 });
  return MACRO_LANG_MAP[detected] || detected;
}

function matchLanguage(lang: string): string {
  // 匹配 LANG_CODE 索引表 (150+ locale codes)
  return indexMap[lang.toLowerCase()] || "";
}
```

**关键设计点**：
- `franc` 库 + ISO6393 宏语言映射
- 尊重条目 `language` 字段
- 缓存源语言（按条目），减少重复检测

## 六、Reader 集成

### 6.1 文本选择 Popup

```
Zotero.Reader.registerEventListener("renderTextSelectionPopup", (event) => {
  addon.data.translate.selectedText = params.annotation.text.trim();
  addon.hooks.onReaderPopupShow(event);
})
  └─ buildReaderPopup(event)
       ├─ 创建 audiobox (发音按钮)
       ├─ 创建 translate 按钮
       ├─ 创建 textarea (翻译结果/原文)
       └─ 创建 addToNote 按钮
  └─ onReaderPopupRefresh()
       └─ updateReaderPopup()
            ├─ 根据 task.status 控制按钮可见性
            ├─ RTL 语言方向适配 (ar/fa/he)
            ├─ textarea 字号/行高自适应
            └─ popup 大小自动调整
```

**关键设计点**：
- `ignoreIfExists: true` 防止重复创建元素
- textarea 支持拖拽调整大小，尺寸持久化到偏好
- 双击复制选中文本到剪贴板
- RTL 语言自动切换方向

### 6.2 侧边栏标注翻译按钮

```
Zotero.Reader.registerEventListener("renderSidebarAnnotationHeader", (event) => {
  if (reader._item.numAnnotations() < 1000) {
    append(createTranslateAnnotationButton(doc, reader, annotationData));
  } else {
    // >1000 标注时，用 error 事件 + requestIdleCallback 延迟创建
    const placeholder = doc.createElement("img");
    placeholder.src = "chrome://zotero/error.png";
    placeholder.addEventListener("error", () => {
      requestIdleCallback(() => { /* 创建按钮 */ });
    });
  }
})
```

**关键设计点**：
- <1000 标注：立即创建按钮
- >=1000 标注：用 placeholder + `requestIdleCallback` 延迟创建，避免阻塞主线程

### 6.3 Notifier 批量翻译

```
onNotify("add", "item", ids) → 新标注条目
  └─ if getPref("enableComment")
       └─ onTranslateInBatch(annotationItems.map(addTranslateAnnotationTask))
            └─ for each task:
                 onTranslate(task) + batchTaskDelay
```

## 七、公共 API 设计

```typescript
// api.ts
export const api = {
  // v1.1.0-23+ 新签名 (需要 pluginID)
  translate(raw: string, options: { pluginID: string, ... }): Promise<string>,

  // 获取所有可用翻译服务
  getServices(): string[],

  // 获取临时刷新处理器 (用于 popup 和 item pane 刷新)
  getTemporaryRefreshHandler(): () => void,

  // 获取插件版本
  getVersion(): string,
};
```

**关键设计点**：
- `translate()` 旧签名已废弃，强制要求 `pluginID` 参数
- `getTemporaryRefreshHandler()` 返回一个函数，调用后触发 UI 刷新
- 外部插件可通过 `Zotero.ZoteroPDFTranslate.api.*` 调用

## 八、与当前模板的对比

### 8.1 架构模式

| 维度 | PDF Translate | 当前模板 |
|---|---|---|
| 任务系统 | TranslateTask 队列 + 缓存 | 不适用 |
| 服务注册 | 40+ 插件化服务 | 不适用 |
| 语言检测 | franc + ISO6393 | 不适用 |
| Fallback | candidateServices 递归 | 不适用 |
| Reader 集成 | renderTextSelectionPopup + sidebar | 取决于实现 |
| 外部 API | translate/getServices/refresh | 不适用 |
| Concat 模式 | Ctrl/Command 多段拼接 | 不适用 |

### 8.2 可借鉴点

1. **TranslateService 接口设计**：`id/type/translate/config/secretValidator` 最小接口，任何翻译服务只需实现这些
2. **任务队列 + 缓存**：`queue.findLast()` 按 raw+service+语言 去重，避免重复翻译
3. **递归 Fallback**：`candidateServices` 数组 + 递归 `runTranslationTask`，简洁的自动切换机制
4. **franc + ISO6393 语言检测**：150+ locale codes + 宏语言映射，覆盖全面
5. **Reader 事件注册模式**：`registerEventListener` + `ignoreIfExists` 防止重复
6. **延迟渲染优化**：`requestIdleCallback` + `error` 事件占位，大数据量场景适用
7. **Concat 模式**：Ctrl/Command + `concatKey` 标志，多段文本拼接翻译
8. **外部 API 设计**：pluginID 要求 + `getTemporaryRefreshHandler` 模式，方便其他插件集成

### 8.3 不可直接搬运的点

1. **40+ 翻译服务**：大部分是特定翻译 API 的封装，当前模板暂无翻译需求
2. **franc 语言检测**：依赖第三方 NLP 库，增加打包体积
3. **Reader popup 深度定制**：Zotero Reader 专用 UI，与当前模板的 UI 路线不一定匹配
4. **Annotation 自动翻译 + 自动打 tag**：学术场景专用
5. **LLM 服务 (GPT/Gemini/Claude)**：需要 API Key 管理，当前模板暂无此需求
6. **发音服务 (audio)**：需要额外 TTS API，当前模板暂无此需求
