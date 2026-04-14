# REFERENCE_PDF_AI_BOOKMARKS_PATTERNS.md

> 参考来源：`reference/plugin/pdf-ai-bookmarks-main/`（pdf-ai-bookmarks，作者：edwintuan）
> 用途：Gemini AI 驱动的 PDF 层级书签自动生成 / 大文件分块上传 / pdf-lib 大纲操作的架构模式沉淀
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：pdf-ai-bookmarks 源码](../reference/plugin/pdf-ai-bookmarks-main/)

## 1. 核心架构概览

pdf-ai-bookmarks 是一个纯 JavaScript 引导的 Zotero 8 插件，使用 Google Gemini AI 自动分析 PDF 文档结构并生成层级书签（Outline）。核心设计解决的是"如何让 AI 理解大型 PDF 的层级结构并写回 PDF 文件"这一问题。

```
pdf-ai-bookmarks 插件层：
├── bootstrap.js                  生命周期（install / startup / shutdown / onMainWindowLoad/Unload）
├── pdf-ai-bookmarks.js           核心逻辑（~917 行，PDFAIBookmarks 对象模式）
├── preferences.js                偏好设置面板逻辑
└── lib/
    └── pdf-lib.js                pdf-lib 库（用于 PDF 大纲操作）
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **PDFAIBookmarks** | 单例对象，承载所有逻辑：文件 I/O、Gemini API 调用、分块策略、书签应用、UI 集成 | `pdf-ai-bookmarks.js` |
| **Gemini Upload** | 大文件可恢复上传（Resumable Upload Protocol）+ XHR 进度追踪 | `uploadFileToGemini()` / `waitForFileActive()` |
| **Chunked Strategy** | >100MB PDF 分块上传，每块独立调用 Gemini，合并结果 | `generateBookmarksChunked()` |
| **PDF Outline Builder** | 使用 pdf-lib 构建 PDF 层级大纲（Outlines/OutlineItem） | `applyBookmarks()` / `getOrCreateOutlines()` |
| **File I/O Layer** | IOUtils 优先、Zotero.File API 降级，支持多种数据类型 | `readFile()` / `writeFile()` / `normalizeBytes()` |

## 2. Bootstrap 生命周期

### 2.1 bootstrap.js 入口

```javascript
var PDFAIBookmarks;  // 全局变量，非模块化

async function startup({ id, version, rootURI }) {
    // 1. 注册偏好设置面板
    Zotero.PreferencePanes.register({
        pluginID: 'pdf-ai-bookmarks@antigravity.com',
        src: rootURI + 'preferences.xhtml',
        scripts: [rootURI + 'preferences.js']
    });

    // 2. 通过 scriptloader 加载 pdf-lib 库到全局作用域
    Services.scriptloader.loadSubScript(rootURI + 'lib/pdf-lib.js');

    // 3. 加载主插件逻辑
    Services.scriptloader.loadSubScript(rootURI + 'pdf-ai-bookmarks.js');
    PDFAIBookmarks.init({ id, version, rootURI });
    PDFAIBookmarks.addToAllWindows();
}

function onMainWindowLoad({ window }) {
    PDFAIBookmarks.addToWindow(window);
}

function onMainWindowUnload({ window }) {
    PDFAIBookmarks.removeFromWindow(window);
}

function shutdown() {
    PDFAIBookmarks.removeFromAllWindows();
    PDFAIBookmarks = undefined;
}
```

**设计特点：** 纯 JS 插件，不需要构建步骤。通过 `Services.scriptloader.loadSubScript` 同步加载脚本到全局作用域，pdf-lib 和主逻辑都以全局对象形式存在（`PDFLib` / `PDFAIBookmarks`）。

**注意点：** 使用 `onMainWindowLoad` / `onMainWindowUnload` 而非仅在 `startup` 中一次性处理，确保 Zotero 多窗口场景下正确注册/注销。

## 3. 纯 JS 对象模式

### 3.1 PDFAIBookmarks 单例

```javascript
PDFAIBookmarks = {
    id: null,
    version: null,
    rootURI: null,
    addedElementIDs: [],

    init({ id, version, rootURI }) {
        this.id = id;
        this.version = version;
        this.rootURI = rootURI;
    },

    log(msg) {
        Zotero.debug("PDF AI Bookmarks: " + msg);
    },

    // ... 所有方法均挂载在此对象上
};
```

**设计决策：** 不使用 TypeScript、不使用构建工具、不使用模块系统。整个插件通过 `Services.scriptloader` 注入全局作用域，所有方法作为单例对象的属性。

**优势：** 零构建依赖，调试直接，代码路径清晰。适合中小型插件。
**局限：** 缺少类型安全、无树摇优化、全局命名空间污染。

## 4. Gemini API 集成

### 4.1 双模式上传策略

根据文件大小自动选择不同的上传模式：

```javascript
// 阈值定义
const MAX_INLINE_BYTES = 100 * 1024 * 1024;   // 100MB（2026-01-12 从 20MB 提升）
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

if (len <= MAX_INLINE_BYTES) {
    // 模式 1: 内联 base64 数据
    const base64Pdf = this.bytesToBase64(pdfBytes);
    newBookmarks = await this.callGeminiAPI(base64Pdf, existingToc, {
        totalPages: pdfDoc.getPageCount()
    });
} else {
    // 模式 2: 大文件分块上传
    newBookmarks = await this.generateBookmarksChunked(pdfDoc, existingToc, onProgress, len, MAX_INLINE_BYTES);
}
```

### 4.2 内联数据模式（<=100MB）

```javascript
async callGeminiAPI(base64Pdf, existingToc, opts = {}) {
    const apiKey = this.getApiKey();
    const prompt = this.buildPrompt(existingToc, opts);

    const requestBody = JSON.stringify({
        contents: [{
            parts: [
                { text: prompt },
                {
                    inline_data: {
                        mime_type: "application/pdf",
                        data: base64Pdf
                    }
                }
            ]
        }],
        generationConfig: {
            response_mime_type: "application/json",
            response_schema: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        page_number: { type: "integer" },
                        level: { type: "integer" }
                    },
                    required: ["title", "page_number", "level"]
                }
            }
        }
    });

    // 使用 XHR 而非 fetch，以便更好的超时控制和错误诊断
    const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=' + apiKey, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.timeout = 5 * 60 * 1000; // 5 分钟超时

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ status: xhr.status, text: xhr.responseText });
            } else {
                reject(new Error(`Gemini API error: ${xhr.status} - ${xhr.responseText}`));
            }
        };
        xhr.onerror = () => reject(new Error(`NetworkError (XHR): readyState=${xhr.readyState}, status=${xhr.status}`));
        xhr.ontimeout = () => reject(new Error(`Timeout after ${xhr.timeout}ms`));
        xhr.onabort = () => reject(new Error('Request aborted'));

        xhr.send(requestBody);
    });

    const data = JSON.parse(result.text);
    const textContent = data.candidates[0].content.parts[0].text;
    return JSON.parse(textContent);
}
```

**关键设计：**

- **JSON Schema 约束输出**：通过 `response_mime_type: "application/json"` + `response_schema` 强制 Gemini 返回结构化 JSON，而不是自由文本
- **XHR 优于 fetch**：大 payload 场景下 XHR 提供更详细的错误信息（`readyState`、`status`）和原生超时支持
- **5 分钟超时**：AI 生成可能很慢，`fetch` 默认超时不适用

### 4.3 可恢复上传模式（>100MB）

```javascript
async uploadFileToGemini(bytes, mimeType, displayName, onProgress = null) {
    const apiKey = this.getApiKey();
    const size = bytes.byteLength;

    // 第一步：发起可恢复上传会话
    let startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(size),
            'X-Goog-Upload-Header-Content-Type': mimeType
        },
        body: JSON.stringify({
            file: { display_name: displayName || 'pdf-ai-bookmarks.pdf' }
        })
    });

    if (!startRes.ok) {
        const errorText = await startRes.text();
        throw new Error(`Gemini upload start error: ${startRes.status} - ${errorText}`);
    }

    const uploadUrl = startRes.headers.get('x-goog-upload-url') || startRes.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) {
        throw new Error('Gemini upload error: missing upload URL');
    }

    // 第二步：使用 XHR 上传文件内容（带进度回调）
    const uploadRes = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', mimeType);
        xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
        xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
        xhr.timeout = 10 * 60 * 1000; // 10 分钟超时

        xhr.onload = () => resolve(xhr);
        xhr.onerror = () => reject(new Error(`network error (readyState=${xhr.readyState})`));
        xhr.ontimeout = () => reject(new Error(`timeout after ${xhr.timeout}ms`));
        xhr.onabort = () => reject(new Error('aborted'));

        if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent, e.loaded, e.total);
                }
            };
        }

        xhr.send(new Blob([bytes], { type: mimeType }));
    });

    // 解析返回的文件 URI
    const fileInfo = JSON.parse(uploadRes.responseText || '{}');
    const fileUri = fileInfo?.file?.uri || fileInfo?.uri;
    const fileName = fileInfo?.file?.name || fileInfo?.name;

    return { fileUri, fileName };
}
```

**可恢复上传流程：**

1. **Start**：POST 到 `/upload/v1beta/files`，携带 `X-Goog-Upload-Protocol: resumable` 头，获取上传 URL
2. **Upload + Finalize**：用上传 URL POST 文件内容，`X-Goog-Upload-Command: upload, finalize` 表示上传并结束
3. **Progress**：`xhr.upload.onprogress` 提供精确的上传进度

### 4.4 文件状态轮询

```javascript
async waitForFileActive(fileName, maxWaitMs = 120000) {
    const apiKey = this.getApiKey();
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
        if (!res.ok) {
            await Zotero.Promise.delay(2000);
            continue;
        }
        const info = await res.json();
        const state = info?.state || 'UNKNOWN';

        if (state === 'ACTIVE') {
            return info;  // 文件已就绪，可以调用
        } else if (state === 'FAILED') {
            throw new Error(`File processing failed: ${JSON.stringify(info)}`);
        }

        await Zotero.Promise.delay(2000);  // 每 2 秒轮询
    }

    throw new Error(`File did not become ACTIVE within ${maxWaitMs}ms`);
}
```

**设计特点：** 轮询间隔 2 秒，最大等待 120 秒。使用 `Zotero.Promise.delay` 而非 `setTimeout`，与 Zotero Promise 生态一致。

### 4.5 文件清理

```javascript
async deleteGeminiFile(fileName) {
    if (!fileName) return;
    const apiKey = this.getApiKey();
    try {
        await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${apiKey}`, {
            method: 'DELETE'
        });
    } catch (_) {
        // Best-effort cleanup — 不阻塞主流程
    }
}
```

**设计决策：** 清理操作采用 best-effort 模式，失败不抛出异常，不影响主流程。

### 4.6 重试与指数退避

```javascript
const MAX_RETRIES = 3;
let lastError = null;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
        // XHR 请求...
    } catch (e) {
        lastError = e;
        const isNetworkError = e.message && (
            e.message.includes('NetworkError') || e.message.includes('Timeout')
        );

        if (attempt < MAX_RETRIES && isNetworkError) {
            // 指数退避：2s, 4s, 8s
            const waitMs = Math.pow(2, attempt) * 1000;
            await Zotero.Promise.delay(waitMs);
        } else if (!isNetworkError) {
            // 非网络错误（如 400）不重试
            throw e;
        }
    }
}

throw lastError;
```

**关键逻辑：** 仅对网络错误和超时重试；对 API 返回的业务错误（400、403 等）直接抛出，避免无效重试。

## 5. 大文件分块上传策略

### 5.1 分块计算

```javascript
async generateBookmarksChunked(pdfDoc, existingToc, onProgress, totalBytes, maxInlineBytes) {
    const totalPages = pdfDoc.getPageCount();

    // 目标每块原始数据 ~35MB（base64 后 ~47MB，接近 48MB 经验上限）
    const TARGET_CHUNK_RAW_BYTES = 35 * 1024 * 1024;
    const avgBytesPerPage = totalBytes / totalPages;
    // 每块页数：20-500 页之间
    const pagesPerChunk = Math.max(20, Math.min(500, Math.floor(TARGET_CHUNK_RAW_BYTES / avgBytesPerPage)));
    const chunkTotal = Math.ceil(totalPages / pagesPerChunk);

    this.log(`Chunked upload: ${totalBytes} bytes (${totalPages} pages), avg ${Math.round(avgBytesPerPage/1024)}KB/page, ${pagesPerChunk} pages/chunk, ${chunkTotal} chunks total.`);
}
```

**设计决策：**

- 目标 35MB 原始数据 → base64 后 ~47MB，留有余量应对 48MB 经验上限
- 每块最少 20 页（避免 AI 上下文太少），最多 500 页（避免单个请求过大）
- 根据每页平均字节数动态计算页数

### 5.2 分块切分与并发控制

```javascript
// 切分
const chunks = [];
for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);
    chunks.push({ start, end });
}

// 并发 = 1（大请求场景下稳定性优先）
const concurrency = 1;
const results = await this.runWithConcurrency(chunks, concurrency, async (chunk, idx) => {
    const { start, end } = chunk;
    const chunkDoc = await PDFLib.PDFDocument.create();
    const pageIndexes = [];
    for (let i = start; i < end; i++) pageIndexes.push(i);
    const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndexes);
    copiedPages.forEach(page => chunkDoc.addPage(page));
    const chunkBytes = await chunkDoc.save();

    // base64 转换 + Gemini 调用
    const base64Pdf = this.bytesToBase64(chunkBytes);
    const chunkBookmarks = await this.callGeminiAPI(base64Pdf, existingToc, {
        totalPages,
        chunkStart: start + 1,  // 1-indexed
        chunkEnd: end,
        chunkPages: end - start
    });

    return this.normalizeChunkBookmarks(chunkBookmarks, start + 1, end);
});

// 合并结果
const merged = [];
for (const chunkList of results) {
    if (chunkList && chunkList.length) {
        merged.push(...chunkList);
    }
}
return merged;
```

### 5.3 通用并发工具函数

```javascript
async runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let index = 0;
    const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
        while (index < items.length) {
            const current = index++;
            results[current] = await worker(items[current], current);
        }
    });
    await Promise.all(runners);
    return results;
}
```

**设计特点：** 轻量级并发池，使用共享 `index` 变量实现任务分发。适合任意数量的异步任务，控制最大并发数。

### 5.4 页码偏移处理（核心难点）

分块模式下，AI 返回的页码可能是"块内相对页码"或"全文绝对页码"，需要自动检测并修正：

```javascript
normalizeChunkBookmarks(bookmarks, chunkStart, chunkEnd) {
    if (!Array.isArray(bookmarks)) return [];

    const chunkPages = chunkEnd - chunkStart + 1;
    let hasAbsolute = false;   // 是否有绝对页码
    let allRelative = true;    // 是否全部是相对页码

    for (const b of bookmarks) {
        const page = Number(b && b.page_number);
        if (!Number.isFinite(page)) continue;
        // 页码在 [chunkStart, chunkEnd] 范围内 → 绝对页码
        if (page >= chunkStart && page <= chunkEnd) hasAbsolute = true;
        // 页码 > chunkPages → 不是相对页码
        if (page < 1 || page > chunkPages) allRelative = false;
    }

    // 需要偏移的条件：没有绝对页码 且 所有页码都是相对页码
    const needsOffset = !hasAbsolute && allRelative;
    const offset = chunkStart - 1;

    return bookmarks.map((b) => {
        if (!b) return null;
        let page = Number(b.page_number);
        if (!Number.isFinite(page)) return null;
        page = Math.round(page);
        if (needsOffset) page += offset;  // 相对 → 绝对
        if (page < chunkStart || page > chunkEnd) return null;  // 越界过滤

        let level = Number(b.level);
        if (!Number.isFinite(level)) level = 1;
        level = Math.max(1, Math.min(6, Math.round(level)));

        let title = b.title ? String(b.title) : 'Untitled';
        return { title, page_number: page, level };
    }).filter(Boolean);
}
```

**检测逻辑：**

| 场景 | `hasAbsolute` | `allRelative` | `needsOffset` | 行为 |
|---|---|---|---|---|
| AI 返回绝对页码 | true | false | false | 不偏移 |
| AI 返回相对页码 | false | true | true | 加上 offset |
| 混合页码 | true | false | false | 不偏移（保守策略） |
| 页码超出块范围 | false | false | false | 不偏移 |

## 6. PDF 书签应用（pdf-lib）

### 6.1 创建/获取 Outlines 字典

```javascript
getOrCreateOutlines(pdfDoc) {
    const context = pdfDoc.context;
    const catalog = pdfDoc.catalog;
    const outlinesKey = PDFLib.PDFName.of('Outlines');

    let outlinesRef = catalog.get(outlinesKey);
    let outlinesDict = catalog.lookupMaybe(outlinesKey, PDFLib.PDFDict);

    if (!outlinesDict) {
        // PDF 没有大纲 → 创建空 Outlines 字典
        outlinesDict = context.obj({
            Type: PDFLib.PDFName.of('Outlines'),
            Count: PDFLib.PDFNumber.of(0)
        });
        outlinesRef = context.register(outlinesDict);
        catalog.set(outlinesKey, outlinesRef);
    } else if (!(outlinesRef instanceof PDFLib.PDFRef)) {
        outlinesRef = context.register(outlinesDict);
        catalog.set(outlinesKey, outlinesRef);
    }

    return { root: outlinesDict, ref: outlinesRef };
}
```

### 6.2 构建层级大纲

```javascript
async applyBookmarks(pdfPath, pdfBytes, bookmarks) {
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    const { root, ref: rootRef } = this.getOrCreateOutlines(pdfDoc);

    const pages = pdfDoc.getPages();
    const pageRefs = pages.map(page => page.ref);

    // 父节点状态追踪
    const parentStates = new Map();
    const getParentState = (parentRef, parentDict) => {
        const key = parentRef.toString();
        if (!parentStates.has(key)) {
            parentStates.set(key, {
                dict: parentDict,
                firstRef: null,
                lastRef: null,
                lastDict: null,
                count: 0
            });
        }
        return parentStates.get(key);
    };

    // 更新父节点的 First/Last/Prev/Next/Count 链表
    const updateParent = (state, childRef, childDict) => {
        if (state.lastDict) {
            state.lastDict.set(PDFLib.PDFName.of('Next'), childRef);
            childDict.set(PDFLib.PDFName.of('Prev'), state.lastRef);
        }
        if (!state.firstRef) {
            state.firstRef = childRef;
        }
        state.lastRef = childRef;
        state.lastDict = childDict;
        state.count += 1;
        state.dict.set(PDFLib.PDFName.of('First'), state.firstRef);
        state.dict.set(PDFLib.PDFName.of('Last'), state.lastRef);
        state.dict.set(PDFLib.PDFName.of('Count'), PDFLib.PDFNumber.of(state.count));
    };

    // levelStack 维护当前层级的父节点引用
    const levelStack = [];
    const rootState = getParentState(rootRef, root);

    for (const bookmark of bookmarks) {
        const title = bookmark.title || 'Untitled';
        const pageNum = (bookmark.page_number || 1) - 1; // 1-indexed → 0-indexed
        let level = Number(bookmark.level);
        if (!Number.isFinite(level)) level = 1;
        level = Math.max(1, Math.min(6, Math.round(level)));

        // 层级跳跃保护：不能跳级（如从 level 1 直接到 level 3）
        if (level > levelStack.length + 1) {
            level = levelStack.length + 1;
        }

        if (pageNum < 0 || pageNum >= pages.length) continue;

        // PDF 目标格式：[pageRef, /XYZ, left, top, zoom]
        const dest = pdfDoc.context.obj([
            pageRefs[pageNum],
            PDFLib.PDFName.of('XYZ'),
            null,  // left — 保持当前视图
            null,  // top
            null   // zoom
        ]);

        // 确定父节点
        let parentRef = rootRef;
        let parentDict = root;
        if (level > 1) {
            const parent = levelStack[level - 2];
            if (parent) {
                parentRef = parent.ref;
                parentDict = parent.dict;
            }
        }

        // 创建大纲条目
        const outlineItem = pdfDoc.context.obj({
            Title: PDFLib.PDFHexString.fromText(title),
            Parent: parentRef,
            Dest: dest
        });

        const outlineItemRef = pdfDoc.context.register(outlineItem);

        const parentState = getParentState(parentRef, parentDict);
        updateParent(parentState, outlineItemRef, outlineItem);

        // 更新 levelStack
        levelStack[level - 1] = { ref: outlineItemRef, dict: outlineItem };
        levelStack.length = level;  // 截断更深层级
    }

    // 保存修改后的 PDF
    const modifiedBytes = await pdfDoc.save();
    await this.writeFile(pdfPath, modifiedBytes);
}
```

**PDF Outline 核心模式：**

- **链表结构**：每个大纲条目通过 `First`/`Last`/`Prev`/`Next` 指针形成双向链表
- **Count 字段**：记录展开状态下可见的子条目总数（递归计数）
- **Destination 格式**：`[pageRef, /XYZ, null, null, null]` 表示跳转到该页并保持当前视图
- **层级栈**：`levelStack[i]` 存储第 `i+1` 层最后一个条目的引用，用于后续同层级或子层级条目的 Parent 关联
- **层级保护**：`level > levelStack.length + 1` 时降级，防止 AI 返回不连续层级

## 7. 健壮的文件 I/O

### 7.1 多类型数据归一化

```javascript
normalizeBytes(data) {
    if (!data) return null;

    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer);

    // 二进制字符串 → Uint8Array
    if (typeof data === 'string') {
        const len = data.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = data.charCodeAt(i);
        }
        return bytes;
    }

    return null;
}
```

**覆盖类型：** Uint8Array、ArrayBuffer、ArrayBufferView（DataView 等）、二进制字符串。

### 7.2 Base64 分块转换

```javascript
bytesToBase64(bytes) {
    const len = bytes.byteLength;
    const CHUNK_SIZE = 8192;
    const binaryChunks = [];
    for (let i = 0; i < len; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
        binaryChunks.push(String.fromCharCode.apply(null, chunk));
    }
    return btoa(binaryChunks.join(''));
}
```

**为什么分块：** `btoa` 对超大字符串会导致栈溢出。8192 字节分块在性能和内存间取得平衡。

### 7.3 健壮读取（IOUtils 优先）

```javascript
async readFile(inputPath) {
    const path = this.normalizePath(inputPath);

    // 尝试 IOUtils（Zotero 7 / Firefox 标准）
    if (typeof IOUtils !== 'undefined') {
        try {
            let data = await IOUtils.read(path);
            let bytes = this.normalizeBytes(data);
            if (bytes) return bytes;
        } catch (e) {
            this.log("IOUtils read failed, falling back: " + e);
        }
    }

    // 降级到 Zotero API（返回二进制字符串）
    let data = await Zotero.File.getBinaryContentsAsync(path);
    let bytes = this.normalizeBytes(data);
    if (bytes) return bytes;

    return new Uint8Array(data);
}
```

### 7.4 健壮写入

```javascript
async writeFile(path, data) {
    if (typeof IOUtils !== 'undefined') {
        try {
            return await IOUtils.write(path, data);
        } catch (e) {
            this.log("IOUtils write failed, falling back: " + e);
        }
    }
    await Zotero.File.putContentsAsync(path, data);
}
```

## 8. AI Prompt 工程

### 8.1 动态 Prompt 构建

```javascript
buildPrompt(existingToc, opts = {}) {
    const shouldPolish = this.shouldPolish();
    const { totalPages, chunkStart, chunkEnd } = opts;

    let prompt = `You are an expert PDF editor. Your task is to generate a comprehensive Table of Contents (bookmarks/outline) for the provided PDF file.

Rules:
1. Read the entire document to understand its structure.
2. Generate a list of bookmarks with accurate page numbers.
3. 'page_number' must be the PHYSICAL page number in the PDF (starting from 1).
4. 'level' indicates the hierarchy: 1 for chapters, 2 for sections, 3 for subsections.
5. Output MUST be a valid JSON array matching the schema: [{"title": "Chapter 1", "page_number": 5, "level": 1}, ...]`;

    if (shouldPolish && existingToc.length > 0) {
        // 已有书签 → 优化模式
        prompt += `\n\nThe PDF already has these bookmarks. Use them as a base to refine and improve:\n${JSON.stringify(existingToc)}`;
    } else {
        prompt += `\n\nNo existing bookmarks found. Generate from scratch.`;
    }

    if (chunkStart && chunkEnd) {
        // 分块模式 → 强调页码计算
        prompt += `\n\n**IMPORTANT - CHUNK MODE:**
This PDF is CHUNK of a larger document. You are viewing pages ${chunkStart} to ${chunkEnd} (out of ${totalPages || 'unknown'} total pages).

CRITICAL RULES FOR CHUNK MODE:
1. The FIRST page you see is page ${chunkStart} of the full document, NOT page 1.
2. If you see "Page 1" printed on a page, that page is actually page ${chunkStart} in the full document.
3. To calculate the correct page_number: take the page position within this chunk (1-indexed) and add ${chunkStart - 1}.
   Example: The 5th page in this chunk = page ${chunkStart + 4} in the full document.
4. ONLY output bookmarks for content in this chunk (pages ${chunkStart}-${chunkEnd}).
5. Use the SAME JSON format as always: [{"title": "...", "page_number": X, "level": Y}, ...]`;
    }

    return prompt;
}
```

**Prompt 设计要点：**

- **角色设定**："expert PDF editor" 建立上下文
- **明确规则**：用编号列出必须遵守的约束
- **Schema 双重保证**：Prompt 描述 + `response_schema` 约束
- **分块模式特殊指令**：用大写和示例强调页码计算规则
- **Polish 模式**：传入已有书签让 AI 优化而非从零生成

### 8.2 偏好控制

```javascript
shouldPolish() {
    return Zotero.Prefs.get('extensions.pdf-ai-bookmarks.polish', true) !== false;
}
```

通过 preference 让用户选择"增强已有书签"还是"从零生成"。

## 9. UI 集成

### 9.1 Tools 菜单注册

```javascript
addToWindow(window) {
    let doc = window.document;
    let toolsMenu = doc.getElementById('menu_ToolsPopup');
    if (toolsMenu) {
        if (toolsMenu.querySelector('#pdf-ai-bookmarks-menu')) return;  // 幂等

        let menuitem = doc.createXULElement('menuitem');
        menuitem.id = 'pdf-ai-bookmarks-menu';
        menuitem.setAttribute('label', 'Generate PDF AI Bookmarks');
        menuitem.addEventListener('command', async () => {
            // 获取目标 PDF ...
        });

        toolsMenu.appendChild(menuitem);
        this.addedElementIDs.push('pdf-ai-bookmarks-menu');
    }
}

removeFromWindow(window) {
    let doc = window.document;
    for (let id of this.addedElementIDs) {
        let elem = doc.getElementById(id);
        if (elem) elem.remove();
    }
}
```

**幂等注册：** `if (toolsMenu.querySelector('#pdf-ai-bookmarks-menu')) return;` 防止重复添加。
**清理机制：** 记录所有添加的元素 ID，卸载时逐一清理。

### 9.2 Active Reader 检测与降级

```javascript
menuitem.addEventListener('command', async () => {
    let attachment = null;

    // 优先级 1：检测当前打开的 PDF Reader
    try {
        let win = Zotero.getMainWindow();
        let tabID = win && win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null;
        if (tabID && Zotero.Reader && Zotero.Reader.getByTabID) {
            let reader = Zotero.Reader.getByTabID(tabID);
            if (reader && reader.itemID) {
                attachment = Zotero.Items.get(reader.itemID);
            }
        }
    } catch (e) {
        this.log("Failed to detect active reader: " + e);
    }

    // 优先级 2：选中条目 → PDF 附件
    if (!attachment) {
        let pane = Zotero.getActiveZoteroPane();
        let items = pane.getSelectedItems();
        let selectedItem = items && items.length ? items[0] : null;

        if (selectedItem) {
            if (selectedItem.isAttachment() && selectedItem.isPDFAttachment()) {
                attachment = selectedItem;
            } else if (selectedItem.getAttachments) {
                // 条目有多个附件时取第一个 PDF
                let attachmentIDs = selectedItem.getAttachments();
                let pdfAttachments = attachmentIDs
                    .map(id => Zotero.Items.get(id))
                    .filter(att => att.isAttachment() && att.isPDFAttachment());

                if (pdfAttachments.length) {
                    attachment = pdfAttachments[0];
                    this.log("Multiple PDFs found; using first attachment");
                }
            }
        }
    }

    if (attachment) {
        await this.runBookmarkGenerator(null, attachment);
    } else {
        window.alert("Please select a PDF attachment or open a PDF in the reader.");
    }
});
```

**检测链：** Active Reader → Selected PDF Attachment → Parent Item 的第一个 PDF 附件 → 提示用户。

### 9.3 进度窗口

```javascript
let progressWin = new Zotero.ProgressWindow();
progressWin.changeHeadline("Generating Bookmarks...");
progressWin.show();
let itemProgress = new progressWin.ItemProgress(
    "Processing PDF...",
    "Analyzing " + filePath.split('/').pop()
);
itemProgress.setProgress(5);

const onProgress = (percent, text) => {
    if (text) itemProgress.setText(text);
    if (typeof percent === 'number') itemProgress.setProgress(percent);
};

const count = await this.generateBookmarks(filePath, onProgress);
itemProgress.setProgress(100);
itemProgress.setText(`Done! Added ${count} bookmarks.`);
progressWin.startCloseTimer(2000);
```

## 10. 偏好设置面板

```javascript
// preferences.js
window.PDFAIBookmarks_Preferences = {
    init: function () {
        const apiKeyInput = document.getElementById("pdf-ai-bookmarks-api-key");
        const polishCheckbox = document.getElementById("pdf-ai-bookmarks-polish");

        // 加载当前值
        const currentApiKey = Zotero.Prefs.get('extensions.pdf-ai-bookmarks.apiKey', true);
        const currentPolish = Zotero.Prefs.get('extensions.pdf-ai-bookmarks.polish', true);

        if (currentApiKey) apiKeyInput.value = currentApiKey;
        polishCheckbox.checked = currentPolish !== undefined ? currentPolish : true;

        // 自动保存
        apiKeyInput.addEventListener("input", (e) => {
            Zotero.Prefs.set('extensions.pdf-ai-bookmarks.apiKey', e.target.value, true);
        });
        polishCheckbox.addEventListener("command", (e) => {
            Zotero.Prefs.set('extensions.pdf-ai-bookmarks.polish', e.target.checked, true);
        });
    }
};
```

**设计模式：** `Zotero.Prefs.get/set` 第三个参数 `true` 表示全局偏好（而非用户级偏好）。使用 `input` 事件（apiKey）和 `command` 事件（checkbox）实现即时保存。

## 11. 文件路径归一化

```javascript
normalizePath(path) {
    if (!path) return null;

    if (typeof path === 'string' && path.startsWith('file://')) {
        try {
            return Services.io.newURI(path)
                .QueryInterface(Components.interfaces.nsIFileURL)
                .file.path;
        } catch (e) {
            this.log("Failed to normalize file URL: " + e);
        }
    }

    if (path.path) return path.path;  // nsIFile 对象

    try {
        if (path instanceof Components.interfaces.nsIFile) {
            return path.path;
        }
    } catch (_) {}

    return null;
}
```

**处理类型：** `file://` URL 字符串、`nsIFile` 对象、已有字符串路径、null/undefined。

## 12. 可借鉴的架构模式

### 12.1 可借鉴的模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **Gemini JSON Schema 约束输出** | 任何需要 AI 返回结构化数据的场景 | 低 — `response_mime_type` + `response_schema` 即可 |
| **可恢复上传 + XHR 进度** | 大文件上传到云端 API，需要进度反馈 | 中 — 需理解 Google Resumable Upload Protocol |
| **分块处理 + 页码偏移自动检测** | 大文件分片分析、结果合并 | 高 — 涉及 AI 行为不确定性的容错 |
| **IOUtils 优先 + Zotero.File 降级** | 跨 Zotero 版本的兼容文件 I/O | 低 — 通用降级模式 |
| **bytesToBase64 分块转换** | 大二进制数据转 base64 | 低 — 防止栈溢出的标准做法 |
| **并发池 runWithConcurrency** | 任意需要限制并发数的场景 | 低 — 轻量无依赖 |
| **PDF Outline 链表构建** | 用 pdf-lib 操作 PDF 大纲/书签 | 中 — 需理解 PDF 规范 |
| **levelStack 层级栈** | 多级嵌套结构的扁平化→层级化转换 | 中 — 通用树构建模式 |
| **AI Prompt 动态构建（Polish vs Scratch）** | 同一功能支持"从头生成"和"优化已有"两种模式 | 低 — Prompt 模板化 |
| **Active Reader 检测链** | 需要获取当前操作对象的 Zotero 插件 | 低 — `getByTabID` → `getSelectedItems` 降级 |
| **幂等菜单注册 + ID 清理** | Zotero 多窗口菜单管理 | 低 — 标准模式 |
| **XHR 替代 fetch 用于大 payload** | 需要超时、进度、详细错误码的场景 | 低 — API 替换 |
| **指数退避重试** | 网络不稳定环境下的 API 调用 | 低 — 通用模式 |
| **normalizeBytes 多类型兼容** | 处理不同来源的二进制数据 | 低 — 类型守卫模式 |

### 12.2 与当前模板的结合点

- 如果模板需要 **AI 生成结构化数据**（如 TOC、摘要、分类），可复用 `response_mime_type: "application/json"` + `response_schema` 模式
- 如果需要 **处理大文件上传**，可复用可恢复上传 + XHR 进度模式
- 如果需要 **分块处理大文件并合并结果**，可复用分块策略 + 页码偏移检测
- 如果需要 **PDF 大纲操作**，可复用 pdf-lib 的 Outline 构建模式
- 如果需要 **跨 Zotero 版本兼容的文件 I/O**，可复用 IOUtils + Zotero.File 降级模式
- 如果需要 **限制并发数的批量任务**，可直接复用 `runWithConcurrency`
- 如果需要 **多级层级结构构建**，可复用 `levelStack` 模式

### 12.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 硬编码 Gemini 模型名（`gemini-3-flash-preview`） | 应支持模型配置，而非硬编码 |
| 硬编码 API URL 和端点 | 应提取为常量或配置 |
| 全局变量模式（`var PDFAIBookmarks`） | 应使用 ES 模块封装 |
| 纯 JS 无类型系统 | 中大型项目应使用 TypeScript |
| 无构建步骤 | 实际项目应包含 lint、test、build 流程 |
| `extractTOC` 为空实现 | 未实现已有书签提取，无法利用 polish 模式 |
| `callGeminiAPIWithFile` 未在主流程使用 | 代码存在但未集成，可能是历史遗留 |
| 固定 `gemini-3-flash-preview` 和 `gemini-2.0-flash` | 两个方法使用不同模型，应统一或可配置 |
| 无取消机制 | 长时间 AI 任务应支持用户取消 |
| 分块并发 = 1 固定 | 应根据网络状况和文件大小动态调整 |
| 无 PDF 加密/权限处理 | 加密 PDF 会导致 pdf-lib 加载失败 |
| 无 API 配额/限流处理 | 连续大文件可能触发 Gemini API 限流 |
| 无本地缓存 | 相同 PDF 重复调用会重复付费 |

## 13. 局限性

| 局限 | 影响 |
|---|---|
| 需要互联网连接 | 无法离线处理 |
| 需要 Gemini API Key | 用户需自行申请并承担费用 |
| AI 生成质量不确定 | 复杂/非标准文档的书签准确性依赖模型能力 |
| 大 PDF 处理时间长 | 分块模式下每块独立调用，2GB 文件可能需要数分钟 |
| 仅支持 Gemini | 无多 Provider 支持、无 Fallback、无本地模型选项 |
| 原地修改文件 | 直接覆盖原 PDF，无备份机制 |
| 仅支持大纲书签 | 不支持高亮、注释等其他 PDF 标注操作 |

## 14. 相关参考

- [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) — 完整 LLM Agent 架构，多 Provider 支持
- [REFERENCE_PDF_TRANSLATE_PATTERNS.md](./REFERENCE_PDF_TRANSLATE_PATTERNS.md) — PDF 翻译相关的 Reader 集成模式
- [REFERENCE_ZOTERO_GPT_PATTERNS.md](./REFERENCE_ZOTERO_GPT_PATTERNS.md) — GPT 集成与多模型支持
- [REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md) — AI 对话面板与会话管理
