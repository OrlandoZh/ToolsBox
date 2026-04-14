# REFERENCE_PDF2ZH_PATTERNS.md

> 参考来源：`reference/plugin/zotero-pdf2zh-main/`（zotero-pdf2zh）
> 用途：PDF 翻译 / 服务端处理 / LLM 集成 / 文件附件管理的架构模式沉淀
> 最后更新：2026-04-12

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-pdf2zh 源码](../reference/plugin/zotero-pdf2zh-main/)

## 1. 核心架构概览

zotero-pdf2zh 采用 **插件（Zotero 侧）+ 服务端（Python 侧）** 的两层架构：

```
Zotero 插件层：                    服务端层（Python）：
├── pdf2zhHelper.ts              ├── PDF 翻译引擎（pdf2zh）
│   ├── processWorker()           ├── PDF 裁剪
│   ├── processSingleFile()       ├── 双语对照生成
│   ├── sendRequest()             ├── LLM 翻译
│   └── fetchAndAttachPDF()       └── 文件服务（/translatedFile/）
├── pdf2zhFileProcessor.ts       通信协议：
├── pdf2zhTypes.ts               POST /{endpoint}  { fileName, base64, config, llm_api? }
├── llmApiManager.ts             GET  /translatedFile/{fileName} → binary
└── preferenceScript.ts
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **PDF2zhHelper** | 主处理管线：验证附件→发送请求→获取结果→附加文件 | `src/modules/pdf2zhHelper.ts` |
| **FileProcessor** | 批量处理调度器 + 事件系统 | `src/modules/pdf2zhFileProcessor.ts` |
| **PDF2zhTypes** | 类型定义（ServerConfig, PDFType, PDFOperationOptions） | `src/modules/pdf2zhTypes.ts` |
| **LLMApiManager** | 多 LLM Provider 管理与激活 | `src/modules/llmApiManager.ts` |
| **PDF2zhUIFactory** | 右键菜单注册（子菜单：翻译/裁剪/对比） | `src/modules/pdf2zh.ts` |

## 2. 文件处理管线

### 2.1 主入口：processWorker

```
processWorker(endpoint)
  ├── 获取选中 items
  ├── 遍历验证每个 PDF 附件（validatePDFAttachment）
  ├── 构建 tasks 数组 [{ fileName, item, config, endpoint }]
  ├── 创建 ProgressWindow
  ├── FileProcessor.addEventListener() 监听 batchStarted / batchCompleted
  └── fileProcessor.processBatch(tasks)
```

**附件验证链路：**

```
validatePDFAttachment(item)
  ├── getAttachmentItem(item)
  │   ├── item.isAttachment() → 直接使用
  │   └── item.isRegularItem() → item.getBestAttachment()
  ├── filepath.endsWith('.pdf') 校验
  └── IOUtils.exists(filepath) 校验
```

### 2.2 单文件处理：processSingleFile

```
processSingleFile({ fileName, item, config, endpoint })
  ├── prepareFileData(item)
  │   └── readPDFAsBase64(filepath) → Blob → FileReader → data URL
  ├── sendRequest(fileData, config, endpoint)
  │   ├── 获取活跃 LLM API 配置（如果 engine == pdf2zh）
  │   ├── POST { fileName, base64, config, llm_api? }
  │   └── 检查 response.status != 'error'
  └── handleResponse(response, item, config)
      └── 遍历 fileList → fetchAndAttachPDF() → addAttachment()
```

### 2.3 文件类型识别

```typescript
static getFileType(fileName: string): string {
  if (fileName.indexOf("mono.pdf") != -1) return PDFType.MONO;
  if (fileName.indexOf("dual.pdf") != -1) return PDFType.DUAL;
  if (fileName.indexOf("mono-cut.pdf") != -1) return PDFType.MONO_CUT;
  if (fileName.indexOf("dual-cut.pdf") != -1) return PDFType.DUAL_CUT;
  if (fileName.indexOf("crop-compare.pdf") != -1) return PDFType.CROP_COMPARE;
  if (fileName.indexOf("compare.pdf") != -1) return PDFType.COMPARE;
  if (fileName.indexOf("cut.pdf") != -1) return PDFType.ORIGIN_CUT;
  return PDFType.ORIGIN;
}
```

**问题：** 通过文件名模式识别文件类型，而不是服务端返回的 `type` 字段。这使得文件名变更会导致类型识别失败。更好的做法是服务端返回结构化元数据。

### 2.4 文件附加

```typescript
static async addAttachment({ item, filePath, options, type, service }) {
  const parentItemID = this.getParentItemID(item);
  let newTitle = service + "-" + type;
  const shortTitle = targetItem.getField("shortTitle");
  if (shortTitle) newTitle = shortTitle + "-" + service + "-" + type;

  const attachment = await Zotero.Attachments.importFromFile({
    file: filePath,
    parentItemID: parentItemID ?? undefined,
    libraryID: item.libraryID,
    collections: parentItemID == undefined ? this.getCollections(item) : undefined,
    title: options.rename ? newTitle : PathUtils.filename(filePath),
  });

  if (options.openAfterProcess && attachment?.id) {
    Zotero.Reader.open(attachment.id);
  }
}
```

**设计决策：** 处理后的文件附加到父条目（parentItem），而不是原始附件项。这使得翻译后的 PDF 作为独立附件出现在文献条目下。

## 3. 批量处理调度器（FileProcessor）

### 3.1 事件系统

```typescript
class FileProcessor {
  private eventListeners: ((event: string, data: any) => void)[] = [];

  addEventListener(listener: (event: string, data: any) => void) {
    this.eventListeners.push(listener);
  }

  emitEvent(event: string, data: any) {
    this.eventListeners.forEach(listener => listener(event, data));
  }
}
```

**事件类型：**

| 事件 | 数据 | 用途 |
|---|---|---|
| `batchStarted` | `{ totalTasks }` | 初始化进度 UI |
| `taskStarted` | `{ fileName }` | 显示当前处理文件 |
| `taskCompleted` | `{ fileName }` | 更新进度 |
| `taskFailed` | `{ fileName, error }` | 记录错误 |
| `batchCompleted` | `{ succeeded, failed }` | 显示最终结果 |

### 3.2 并发控制

批量处理支持并发控制（`poolSize`），通过信号量或 Promise.all 分批实现。

## 4. LLM Provider 管理

### 4.1 多 Provider 配置

```typescript
interface LLMApiConfig {
  service: string;    // 服务名称（如 OpenAI, Claude）
  model: string;
  apiKey: string;
  apiUrl: string;
  extraData: Record<string, string>;
  activate: boolean;  // 是否激活
}
```

### 4.2 激活查找

```typescript
static getActiveLLMApiConfig(service: string): any {
  loadLLMApisFromPrefs();
  for (const [key, llmApi] of addon.data.llmApis.map) {
    if (llmApi.activate && llmApi.service == service) {
      return { service, model, apiKey, apiUrl, extraData };
    }
  }
  return null;
}
```

**设计特点：** 按 `service` 名称匹配激活的 Provider，而不是全局单一激活。这意味着不同翻译服务可以配置不同的 LLM。

## 5. 服务端通信协议

### 5.1 请求格式

```json
{
  "fileName": "paper.pdf",
  "fileContent": "data:application/pdf;base64,...",
  "serverUrl": "http://localhost:8080",
  "service": "openai",
  "next_service": "claude",
  "engine": "pdf2zh",
  "sourceLang": "en",
  "targetLang": "zh",
  "mono": "true",
  "dual": "true",
  "llm_api": {
    "service": "openai",
    "model": "gpt-4",
    "apiKey": "...",
    "apiUrl": "https://api.openai.com/v1",
    "extraData": {}
  }
}
```

### 5.2 响应格式

```json
{
  "status": "success",
  "fileList": ["translated/paper-mono.pdf", "translated/paper-dual.pdf"]
}
```

### 5.3 文件下载

```
GET /translatedFile/{fileName} → application/octet-stream
```

## 6. 重试机制

```typescript
static async retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 1,
  delay: number = 2000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}
```

**注意：** 默认 `MAX_RETRIES = 1`，即不重试。注释中说"其实不需要重试"，重试逻辑主要由服务端完成。

## 7. 菜单结构

```
右键菜单 → PDF2zh（子菜单）
  ├── PDF2zh: 翻译 (translatePDF)
  ├── PDF2zh: 裁剪 (cropPDF)
  ├── PDF2zh: 对比 (comparePDF)
  └── PDF2zh: 裁剪后对比 (crop-comparePDF)
```

每个菜单项通过 `commandListener: () => addon.hooks.onDialogEvents(command)` 路由到统一的事件处理器。

## 8. 可借鉴点

### 8.1 可借鉴的架构模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **插件 + 服务端两层架构** | 计算密集型任务（翻译、OCR、AI 处理） | 中——需要定义清晰的通信协议 |
| **Base64 传输 + 临时文件** | 文件上传下载的标准模式 | 低——通用方案 |
| **事件驱动的批量处理** | 任何需要进度反馈的批量操作 | 低——通用事件模式 |
| **多 Provider 配置管理** | 支持多个 AI 翻译/LLM 服务 | 中——需要 UI 和持久化 |
| **文件类型识别** | 根据结果文件名判断输出类型 | 低——但建议改进为服务端返回元数据 |
| **parentItem 附加逻辑** | 处理结果附加到文献条目 | 低——Zotero API 标准用法 |

### 8.2 与当前模板的结合点

- 如果未来模板需要**文件处理 + 服务端通信**，可复用 prepareFileData → sendRequest → handleResponse 管线
- 如果需要**批量处理 + 进度 UI**，可复用 FileProcessor 事件模式
- 如果需要**多 LLM Provider 支持**，可复用 LLMApiConfig 结构
- 如果需要**处理结果附加到文献**，可复用 addAttachment 模式

### 8.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 文件名模式识别文件类型 | 脆弱，应使用服务端返回的元数据 |
| 硬编码的 serverUrl 格式 | 应由配置管理系统提供 |
| axios 作为 HTTP 客户端 | Zotero 环境下更推荐 `fetch` |
| 大量 preference 配置 | 建议用 schema 管理，而不是分散的 `getPref` |
| `getBestAttachment()` | 这只返回最早添加的附件，不一定是最相关的 PDF |

## 9. 相关参考

- [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) — 通用技术链
- [REFERENCE_PDF_TRANSLATE_PATTERNS.md](./REFERENCE_PDF_TRANSLATE_PATTERNS.md) — 另一个 PDF 翻译插件（pdf-translate）
- [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) — LLM 集成参考
