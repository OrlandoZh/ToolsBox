# REFERENCE_PDF_OVERLAY_POSITIONING_PATTERNS.md

> 参考来源：`reference/zotero-main/` Reader / annotation authoritative source，加上现有 PDF 参考专题
> 用途：Zotero Reader 内 PDF 解析、annotation position 与 overlay 定位技术链沉淀
> 最后更新：2026-04-30

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- 宿主 authoritative source：
  - [`reader.js`](../reference/zotero-main/chrome/content/zotero/xpcom/reader.js)
  - [`annotations.js`](../reference/zotero-main/chrome/content/zotero/xpcom/annotations.js)
- 相关参考专题：
  - [REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md](./REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md)
  - [REFERENCE_AI_BAR_PATTERNS.md](./REFERENCE_AI_BAR_PATTERNS.md)

## 1. 结论

本轮没有在仓库中找到名为 `PDF_OVERLAY_POSITIONING_IMPROVEMENT_PLAN` 的现成文档；这里按其问题方向沉淀一份 reference note。

PDF overlay 定位不要以屏幕像素或一次性的 DOM `getBoundingClientRect()` 作为事实源。更稳的路线是：

```
PDF-space anchor
  -> pageIndex + rects / paths
  -> PDF.js viewport transform
  -> current page DOM rect
  -> overlay DOM position
```

也就是说，位置事实应尽量停留在 Zotero / PDF.js 的 PDF 页坐标系里，直到最后一刻才投影到当前缩放、旋转、滚动状态下的 DOM 坐标。

## 2. 坐标层分工

| 层 | 稳定事实 | 用途 | 风险 |
|---|---|---|---|
| 文本层 | 选中文本、全文索引、recognizer TextBox | 找语义上下文或短文本 disambiguation | 同文多次出现时容易漂 |
| Annotation 层 | `position.pageIndex`、`position.rects`、`position.paths` | 高亮、批注、overlay anchor | 必须保留未知字段，避免破坏 host 扩展信息 |
| PDF.js viewport 层 | page viewport、scale、rotation | PDF rect 到 viewport rect 的投影 | 属于 Reader 内部 iframe，版本漂移要 probe |
| DOM 层 | page element / overlay root 的 live rect | 实际绘制 overlay | zoom、scroll、resize 后会失效 |

## 3. Host 侧证据

Zotero Reader 初始化时会把 attachment data、annotations、primary / secondary view state 一并传入内部 reader。插件侧 Reader event 通过 `customEvent` 转发，`append` 会被包装后交给 `Zotero.Reader._dispatchEvent`。

Zotero annotation 的持久化形态是 `annotationPosition` 字符串，但 `Zotero.Annotations.toJSONSync()` 会把它解析成 raw `position` 对象传给 Reader；`saveFromJSON()` 又会把 `json.position` 原样 stringify 回 annotation item。这个设计说明 `position` 是 Reader 和数据层之间的核心桥。

测试样例里 PDF annotation position 使用：

```json
{
  "pageIndex": 0,
  "rects": [[0, 0, 100, 100]]
}
```

也有 text annotation 带 `fontSize` / `rotation`，ink annotation 带 `paths` / `width`。所以 overlay helper 不应只认识 highlight rects，也不应在 normalize 时丢弃未知 position 字段。

## 4. 推荐实现路径

1. 先拿 Reader：
   - `resolveReader(target)`
   - `waitForReaderReady(target)`
   - `getReaderFrameWindow(target, { view: "primary" })`

2. 再拿 PDF anchor：
   - 已有 annotation：读 `annotation.annotationPosition` 或 `Zotero.Annotations.toJSON(item).position`
   - Reader 事件：优先消费 `event.params.annotation.position` 一类 payload，如果 host 实际提供
   - 选区文本：短文本或多次出现时，结合 recognizer TextBox / page index，而不是只靠全文 regex
   - 新建 annotation：使用 `createAnnotation(..., { position })`，让 Zotero 自己负责持久化和 Reader 同步

3. 再进入 PDF.js viewport：
   - 从 Reader primary view iframe 拿 `PDFViewerApplication.pdfViewer`
   - 等待目标 page view 初始化 / render 完成
   - 取 `pageView.viewport`
   - 若 `viewport.convertToViewportRectangle(rect)` 可用，优先用它处理 scale / rotation / y-axis
   - 转换后对 `[x1, y1, x2, y2]` 做 min / max normalize

4. 最后映射到 overlay root：
   - 取 page element live rect
   - 取 overlay root live rect
   - `left = pageRect.left + viewportRect.left - rootRect.left`
   - `top = pageRect.top + viewportRect.top - rootRect.top`
   - `width = viewportRect.right - viewportRect.left`
   - `height = viewportRect.bottom - viewportRect.top`

5. 生命周期上要重算：
   - zoom / scale change
   - page rotation
   - scroll mode / spread mode change
   - window resize
   - page render / virtualized page mount
   - annotation add / update / delete

## 5. 当前模板已有锚点

当前 `src/features/reader.js` 已经有几个能接这个路线的基础能力：

- `getReaderFrameWindow()`：能进入 `_internalReader._primaryView._iframeWindow`
- `getSelectionSnapshot()`：能从 Reader event 或 iframe selection 抽选中文本
- `createAnnotation()`：能通过 `Zotero.Annotations.saveFromJSON()` 写入带 `position` 的 annotation
- `normalizeAnnotationPosition()`：已保留 `sourcePosition` 其他字段，只补 `pageIndex` 和 `rects`

当前缺口是一个明确的 geometry helper，例如：

```typescript
resolvePDFOverlayGeometry(reader, position, options)
```

它应只负责把 PDF-space `position` 转成当前 Reader iframe 内 overlay 可用的 DOM rects，不承担语义选段、LLM、高亮策略或 UI 注入。

## 6. 与现有参考方案的关系

Smart Highlighter 的 `Rect Splitter` 是有价值的 fallback：当拿不到 PDF.js / recognizer 精确位置时，可以用字符比例插值把 span 映射成近似 rects。但它不应成为主定位方案，因为它主动绕开了 PDF 渲染引擎，精度会受字体、换行、旋转和 CJK 宽度影响。

AI Bar 的三段式选区上下文提取更适合借鉴在“找到选区上下文”这一层：全文唯一匹配、短文本位置匹配、recognizer TextBox。它解决的是文本 disambiguation，不直接替代 overlay geometry。

## 7. 验收建议

如果后续实现 overlay positioning helper，建议最小验收分三层：

1. Unit：用 fake `viewport.convertToViewportRectangle()` 验证 rect normalize、root offset、unknown field preservation
2. Host smoke：打开 PDF Reader，针对一个已知 highlight annotation 计算 overlay rect，确认 pageIndex 和尺寸非空
3. Dynamic：切换 zoom、scroll、resize 后重算，确认 overlay 仍贴住同一 annotation rect

这份文档只是 reference distillation，不是 current truth；是否进入开发主线仍要回到 `docs/CURRENT_BACKLOG.md` 和 expansion wave。
