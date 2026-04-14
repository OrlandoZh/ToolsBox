# REFERENCE_ADDONS_MARKET_PATTERNS.md

> 参考来源：`reference/plugin/zotero-addons-main/`（Zotero Addons Market，作者 Northword）
> 用途：Zotero 插件市场（浏览、安装、管理社区插件）的架构模式沉淀
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：addons 源码](../reference/plugin/zotero-addons-main/)

## 1. 核心架构概览

Addons Market 是一个"插件管理器"插件，核心职责是：**从社区数据源获取插件列表、展示可安装插件、支持安装/卸载/更新/回退、多镜像下载容错、数据源自切换与自动探测**。

与其他功能插件不同，它管理的是**Zotero 的其他插件**而非文献条目。它是"元插件"（meta-plugin），操作对象是 `AddonManager` 而非 `Zotero.Items`。

### 1.1 源码文件索引

| 文件 | 职责 | 说明 |
|---|---|---|
| `src/index.ts` | 入口引导 | 全局 `Addon` 单例注册到 `Zotero` |
| `src/addon.ts` | 根单例 | `data`/`hooks`/`api`/`actions` 持有者 |
| `src/hooks.ts` | 生命周期钩子 | startup/mainWindowLoad/shutdown |
| `src/core/EventBus.ts` | 事件总线 | 基于 `mitt` 的插件变更事件分发 |
| `src/modules/addonInfo.ts` | 插件信息管理器 | 获取、过滤、版本匹配、下载 URL 解析（单例） |
| `src/modules/addonTable.ts` | 主窗口虚拟表格 | 数据展示、源切换、自动更新、右键菜单 |
| `src/modules/addonDetail.ts` | 详情面板 | 安装/更新/卸载/回退/历史版本 |
| `src/modules/addonListenerManager.ts` | 插件管理器监听 | 桥接 Zotero AddonManager 事件到 EventBus |
| `src/modules/historicalVersions.ts` | 历史版本窗口 | 显示历史发行版本、兼容性检查、指定版本安装 |
| `src/modules/guide.ts` | 首次运行引导 | `ztoolkit.Guide` 引导，位标志追踪 |
| `src/modules/registerScheme.ts` | 自定义 URL Scheme | `zotero://zoteroaddoncollection/` 路由器 |
| `src/modules/crypto.ts` | 密码学验证 | RSA-PSS 签名验证（execJS 命令） |
| `src/services/AddonInstallService.ts` | 安装服务 | 下载进度、多镜像回退、卸载、撤销卸载 |
| `src/ui/table/TableActions.ts` | 表格批量操作 | 批量安装/卸载/启用/禁用 |
| `src/ui/table/TableDataTransformer.ts` | 数据转换 | AddonInfo[] -> 表格行数据、排序 |
| `src/ui/table/TableMenuHandler.ts` | 动态上下文菜单 | 根据选中状态生成菜单 |
| `src/ui/table/TableSearchHandler.ts` | 模糊搜索 | Fuse.js 模糊搜索 + 120ms 防抖 |
| `src/ui/table/TableColumnManager.ts` | 列状态管理 | 可见性、排序、宽度持久化 |
| `src/utils/configuration.ts` | 数据源配置 | 9 种数据源定义（auto/scraper/chinese/custom） |
| `src/utils/compat.ts` | 兼容性层 | Zotero 7/8 兼容（AddonManager 导入差异） |
| `src/utils/locale.ts` | 国际化 | Fluent FTL（15 种语言） |
| `src/utils/prefs.ts` | 偏好读写 | 类型化偏好 get/set |
| `src/utils/window.ts` | 窗口工具 | `isWindowAlive` |
| `src/utils/ztoolkit.ts` | ztoolkit 初始化 | `MyToolkit` 组合（VirtualizedTable/ProgressWindow/Menu/Guide/UI） |

源码文件总计 **33 个 TS 文件**。

### 1.2 数据流概览

```
数据获取层：
  用户打开插件市场 -> AddonInfoManager.fetchAddonInfos()
                   -> 从当前数据源 API 获取 JSON（5s 超时）
                   -> 缓存 12 小时
                   -> 如果 auto 源：顺序探测，取首个响应的源

UI 展示层：
  AddonInfo[] -> TableDataTransformer -> 关联本地已安装插件
             -> 计算安装状态 -> 构建表格行数据
             -> VirtualizedTableHelper 渲染
             -> Fuse.js 模糊搜索（120ms 防抖）

安装管理层：
  用户点击安装 -> AddonInstallService.installAddonFrom([urls])
               -> 按优先级选择镜像 URL
               -> AddonManager.getInstallForURL() 下载
               -> IInstallListener 跟踪进度
               -> 下载失败 -> 自动尝试下一个镜像
               -> 安装完成 -> EventBus 发射 ADDON_CHANGED -> UI 刷新
```

## 2. 多数据源架构

### 2.1 源定义

文件：`src/utils/configuration.ts`

```typescript
const sources = [
  { id: 'source-auto', name: 'Auto' },
  { id: 'source-zotero-scraper-github', api: 'https://raw.githubusercontent.com/syt2/zotero-addons-scraper/...' },
  { id: 'source-zotero-scraper-gitee', api: 'https://gitee.com/ytshen/zotero-addon-scraper/...' },
  { id: 'source-zotero-scraper-jsdelivr', api: 'https://cdn.jsdelivr.net/gh/syt2/zotero-addons-scraper/...' },
  { id: 'source-zotero-scraper-ghproxy', api: 'https://gh-proxy.org/...' },
  { id: 'source-zotero-chinese-github', api: 'https://raw.githubusercontent.com/zotero-chinese/zotero-plugins/...' },
  { id: 'source-zotero-chinese-gitee', api: 'https://gitee.com/northword/zotero-plugins/...' },
  { id: 'source-zotero-chinese-jsdelivr', api: 'https://cdn.jsdelivr.net/gh/zotero-chinese/zotero-plugins/...' },
  { id: 'source-zotero-chinese-ghproxy', api: 'https://gh-proxy.org/...' },
  { id: 'source-custom', api: (userDefined) },
];
```

两大数据源生态：
- **scraper 源**（syt2）：提供插件列表 + 历史版本数据（支持回退）
- **chinese 源**（zotero-chinese）：中文社区插件仓库

### 2.2 自动源探测

```typescript
static async autoSwitchAvaliableApi(timeout = 3000) {
  for (const source of sourcesWithApi) {
    try {
      const infos = await AddonInfoAPI.fetchAddonInfos(source.api, timeout);
      if (infos.length > 0) {
        this.shared.sourceInfos[source.api] = [new Date(), infos];
        setAutoSource(source);  // 保存为默认源
        return infos;
      }
    } catch { /* 超时或失败，尝试下一个 */ }
  }
}
```

**设计要点**：每个源 3s 超时，顺序探测，第一个有数据的源被设为当前 auto 源并持久化。

### 2.3 数据缓存

```typescript
class AddonInfoManager {
  private sourceInfos: { [key: string]: [Date, AddonInfo[]] } = {};

  get addonInfos() {
    const [cachedAt, infos] = this.sourceInfos[currentSourceUrl];
    const isExpired = Date.now() - cachedAt.getTime() >= 12 * 60 * 60 * 1000;
    if (isExpired) {
      this.fetchAddonInfos(true);  // 异步刷新
    }
    return infos;
  }
}
```

**12 小时 TTL**：缓存期内直接返回，过期后异步刷新（不阻塞当前渲染）。

## 3. 多镜像下载与自动回退

### 3.1 安装服务

文件：`src/services/AddonInstallService.ts`

```typescript
async function installAddonFrom(
  url: string | string[],  // 单 URL 或镜像数组
  options: InstallOptions = {}
) {
  const actualInstall = async () => {
    const install = await AddonManager.getInstallForURL(currentUrl, {
      telemetryInfo: addonName,
      eventListeners: [new InstallProgressListener(progressWindow)],
    });

    // 监听安装状态变化
    const listener = new InstallListener(install, progressWindow);
    await install.install();
    return install.state === 'installed';
  };

  const success = await actualInstall();
  if (!success && Array.isArray(url) && url.length > 1) {
    // 失败，尝试下一个镜像
    options.startIndex = startIndex + 1;
    return await installAddonFrom(url, options);
  }
}
```

### 3.2 URL 优先级

```typescript
function xpiDownloadUrls(sourceID: string, downloadsURLs: XpiDownloadUrls): string[] {
  const result = Object.values(downloadsURLs);
  let firstElement: string;
  switch (sourceID) {
    case 'source-zotero-chinese-github':
    case 'source-zotero-scraper-github':
      firstElement = downloadsURLs.github;
      break;
    // ... 其他源的优先 URL
  }
  // 将优先 URL 移到数组头部
  result.unshift(result.splice(result.indexOf(firstElement), 1)[0]);
  return result;
}
```

**设计要点**：根据当前数据源动态调整镜像优先级，GitHub 源优先用 GitHub Raw，中国源优先用 Gitee。

## 4. 本地插件匹配

### 4.1 多策略匹配

文件：`src/ui/table/TableDataTransformer.ts`

```typescript
function relatedAddons(info: AddonInfo): LocalAddon[] {
  const results: LocalAddon[] = [];

  // 策略 1：通过 addon ID 匹配
  for (const addon of allAddons) {
    if (addon.id === info.releaseInfo?.addonId) {
      results.push(toLocalAddon(addon));
    }
  }

  // 策略 2：通过插件名称匹配
  for (const addon of allAddons) {
    if (addon.name === info.releaseInfo?.name || addon.name === info.name) {
      results.push(toLocalAddon(addon));
    }
  }

  // 策略 3：通过 homepageURL 包含仓库路径
  for (const addon of allAddons) {
    if (addon.homepageURL?.includes(info.repo)) {
      results.push(toLocalAddon(addon));
    }
  }

  // 策略 4：通过 updateURL 包含仓库路径
  for (const addon of allAddons) {
    if (addon.updateURL?.includes(info.repo)) {
      results.push(toLocalAddon(addon));
    }
  }

  return results;
}
```

**设计要点**：4 种策略兜底匹配，确保即使数据源元数据不完整，也能正确关联已安装插件。

## 5. 状态计算与安装状态枚举

```typescript
enum InstallState {
  unknown = 'unknown',              // 无法确定
  notInstalled = 'notInstalled',    // 未安装
  normal = 'normal',                // 已安装且为最新版本
  updatable = 'updatable',          // 已安装但有新版本
  disabled = 'disabled',            // 已禁用
  incompatible = 'incompatible',    // 与当前 Zotero 版本不兼容
  pendingUninstall = 'pendingUninstall', // 待卸载（重启后生效）
}

function calculateInstallState(local: LocalAddon | null, remote: AddonInfo): InstallState {
  if (!local) return InstallState.notInstalled;
  if (local.pendingUninstall) return InstallState.pendingUninstall;
  if (!local.isActive) return InstallState.disabled;
  if (!isVersionCompatible(remote.minVersion, remote.maxVersion)) {
    return InstallState.incompatible;
  }
  if (local.version !== remote.version) return InstallState.updatable;
  return InstallState.normal;
}
```

## 6. 版本兼容性检查

```typescript
export function isVersionCompatible(minVersion?: string, maxVersion?: string): boolean {
  const currentVersion = Services.appinfo.version;
  const minCompare = Services.vc.compare(currentVersion, minVersion?.replace('*', '0'));
  const maxCompare = Services.vc.compare(currentVersion, maxVersion?.replace('*', '999'));
  return minCompare >= 0 && maxCompare <= 0;
}
```

**通配符支持**：`*` 替换为 `0`（min）或 `999`（max），支持 `7.0.*` 这类宽松版本范围。

## 7. 虚拟表格优化

### 7.1 刷新竞争保护

```typescript
class AddonTable {
  private refreshTag = 0;

  async refresh(force = false) {
    this.refreshTag += 1;
    const curRefreshTag = this.refreshTag;

    const addonInfos = await TableDataTransformer.transformAddonInfos(force);

    // 如果期间触发了新的刷新，丢弃本次结果
    if (curRefreshTag !== this.refreshTag) { return; }

    // 渲染数据...
  }
}
```

**设计要点**：单调递增标记防止旧数据覆盖新数据。

### 7.2 列状态持久化

```typescript
class TableColumnManager {
  // 列配置（可见性、顺序、宽度、排序方向）存储为偏好
  // 使用 LargePrefHelper 处理超长偏好值
  saveConfig() {
    LargePrefHelper.setCharPref('table.columns', JSON.stringify(this.columns));
  }

  loadConfig() {
    const raw = LargePrefHelper.getCharPref('table.columns', '');
    return raw ? JSON.parse(raw) : defaultColumns;
  }
}
```

### 7.3 Fuse.js 模糊搜索

```typescript
const fuseOptions = {
  keys: [
    { name: 'addonInfoName', weight: 0.3, getFn: (e) => e[0].name || '' },
    { name: 'addonName', weight: 0.3, getFn: (e) => e[1]['menu-name'] || '' },
    { name: 'addonInfoDescription', weight: 0.2, getFn: (e) => e[0].description || '' },
    { name: 'addonDescription', weight: 0.2, getFn: (e) => e[1]['menu-desc'] || '' },
  ],
  threshold: 0.3,
  ignoreLocation: true,
};
```

**自定义 `getFn`**：同时搜索远程数据源的名称/描述和本地插件的名称/描述，加权搜索。

## 8. 事件驱动 UI 刷新

### 8.1 EventBus

文件：`src/core/EventBus.ts`

```typescript
import mitt from 'mitt';

const eventBus = mitt<EventMap>();

enum AddonEvents {
  ADDON_CHANGED = 'addon:changed',
}

export function getEventBus() { return eventBus; }
```

### 8.2 AddonListenerManager 桥接

```typescript
class AddonListenerManager {
  register() {
    AddonManager.addAddonListener({
      onInstalled: (addon) => this.emitChanged(),
      onUninstalled: (addon) => this.emitChanged(),
      onEnabled: (addon) => this.emitChanged(),
      onDisabled: (addon) => this.emitChanged(),
      onOperationCancelled: (addon) => this.emitChanged(),
      // ... 所有 AddonManager 生命周期事件
    });
  }

  private emitChanged() {
    getEventBus().emit(AddonEvents.ADDON_CHANGED);
  }
}

// 订阅方
getEventBus().on(AddonEvents.ADDON_CHANGED, () => {
  AddonTable.refresh();
  AddonInfoDetail.refresh();
});
```

**设计要点**：解耦 UI 组件与 AddonManager 事件，多个 UI 组件订阅同一个事件，各自刷新。

## 9. 自定义 URL Scheme

### 9.1 Scheme 路由器

文件：`src/modules/registerScheme.ts`

```
zotero://zoteroaddoncollection/configSource?source=source-custom&customURL=...
zotero://zoteroaddoncollection/install?source=...
zotero://zoteroaddoncollection/execJS?source=...&sign=...
```

### 9.2 execJS 与 RSA-PSS 验证

```typescript
// crypto.ts
async function verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('spki', base64ToArrayBuffer(publicKey),
    { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'RSA-PSS', saltLength: 32 },
    key, base64ToArrayBuffer(signature), new TextEncoder().encode(message));
}
```

**设计要点**：外部链接可以触发插件内的 JS 执行，但必须经过 RSA-PSS 签名验证，确保只有持有私钥的授权方才能执行。

## 10. 首次运行引导

```typescript
class Guide {
  private showGuide() {
    const status = getPref('guideStatus') ?? 0;
    if (!(status & GuideStatus.openAddonTable)) {
      ztoolkit.Guide.showGuide([...steps]);
      setPref('guideStatus', status | GuideStatus.openAddonTable);
    }
  }
}
```

**位标志追踪**：用单个整数偏好存储多个引导步骤的完成状态，每个步骤占一个 bit。

## 11. Zotero 7/8 兼容层

```typescript
// compat.ts
export function getAddonManager(): IAddonManager {
  if (isZotero8()) {
    return ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;
  } else {
    return ChromeUtils.import('resource://gre/modules/AddonManager.jsm').AddonManager;
  }
}
```

**设计要点**：Zotero 7 使用 `.jsm` + `ChromeUtils.import`，Zotero 8 使用 `.sys.mjs` + `ChromeUtils.importESModule`。通过版本号判断，统一接口。

## 12. 历史版本与回退

### 12.1 仅 scraper 源支持

历史版本数据仅 scraper 源提供，从单独的 JSON 文件获取：

```
https://raw.githubusercontent.com/syt2/zotero-addons-scraper/refs/heads/publish/release_cache/{encoded_repo}.json
```

### 12.2 回退到上一版本

```typescript
async function rollbackToPreviousVersion() {
  const releases = await fetchHistoricalReleases(repo);
  // 找到比当前版本小的第一个版本
  const currentIndex = releases.findIndex(r => r.version === currentVersion);
  const previousVersion = releases[currentIndex + 1];
  // 确认对话框 -> 安装指定版本
  const confirmed = await confirmRollbackDialog(previousVersion.version);
  if (confirmed) {
    await installAddonFrom(previousVersion.xpiURL);
  }
}
```

## 13. 最小化 ztoolkit 组合

```typescript
class MyToolkit extends BasicTool {
  UI: UITool;
  VirtualizedTable: typeof VirtualizedTableHelper;
  ProgressWindow: typeof ProgressWindowHelper;
  Menu: MenuManager;
  Guide: typeof GuideHelper;
}
```

**设计要点**：不继承完整的 `ZoteroToolkit`，只组合需要的 helper，减少内存开销。

## 14. 可借鉴的架构模式

### 14.1 可借鉴的模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **多数据源自探测** | 多地区/多 CDN 的 API 可用性不确定 | 低 —— 顺序探测 + 超时 + 持久化选择 |
| **数据缓存 + 异步刷新** | 频繁读取、偶尔变更的远程数据 | 低 —— TTL 到期异步刷新不阻塞 |
| **多镜像下载回退** | 资源下载可能失败或地区受限 | 中 —— 数组传参 + 递归重试 |
| **本地插件多策略匹配** | 元数据不完整的关联匹配 | 中 —— 4 种策略兜底 |
| **刷新竞争保护（refreshTag）** | 并发刷新导致旧数据覆盖新数据 | 低 —— 单调计数器 |
| **EventBus 解耦** | 多个 UI 组件需要响应同一事件 | 低 —— `mitt` 事件总线 |
| **Fuse.js 自定义搜索** | 需要模糊搜索多字段 | 低 —— `getFn` 自定义提取器 |
| **列状态持久化** | 用户自定义表格布局 | 低 —— JSON + LargePrefHelper |
| **安装状态枚举计算** | 远程与本地版本比较 | 低 —— 多条件优先级判断 |
| **自定义 URL Scheme** | 从外部链接触发插件内操作 | 中 —— 路由器 + 签名验证 |
| **位标志引导状态** | 多个独立引导步骤完成追踪 | 低 —— 位运算 |
| **Zotero 7/8 兼容层** | 模块系统差异 | 低 —— 版本号分支导入 |
| **最小化 ztoolkit** | 减少不必要的 helper 加载 | 低 —— 继承 BasicTool + 手动组合 |

### 14.2 与当前模板的结合点

- 如果模板需要**插件/扩展市场功能**，可直接复用数据源获取 + 多镜像下载 + 安装状态计算管线
- 如果模板需要**多 API 源支持**，可复用自动探测 + 12h 缓存模式
- 如果模板需要**远程数据驱动的表格展示**，可复用虚拟表格 + Fuse.js 搜索 + 列状态持久化
- 如果模板需要**事件驱动的 UI 刷新**，可复用 EventBus + AddonListenerManager 桥接模式

## 15. 不可直接搬运的部分

| 内容 | 原因 | 处理方式 |
|---|---|---|
| `AddonManager` 桥接 | 管理的是 Zotero 插件而非文献条目 | 功能插件不需要此层 |
| `zotero://zoteroaddoncollection/` Scheme | 特定于此插件的自定义 Scheme | 按需自定义新的 Scheme |
| RSA-PSS execJS 验证 | 安全敏感，涉及代码执行 | 谨慎评估是否需要远程命令执行 |
| 历史版本回退 | 依赖 scraper 源特有的 release_cache | 需要数据源支持 |
| `LargePrefHelper` | 依赖 zotero-plugin-toolkit | 替换为模板自己的大偏好存储 |
| `VirtualizedTableHelper` | 依赖 zotero-plugin-toolkit | 替换为模板自己的表格方案 |
| 多语言 FTL 文件 | 15 种语言翻译文件 | 按需裁剪语言 |

## 16. 源文件统计

| 类别 | 数量 |
|---|---|
| TypeScript 源文件 | 33 |
| 核心模块文件 | 8（addonInfo、addonTable、addonDetail、addonListenerManager、historicalVersions、guide、registerScheme、crypto） |
| 服务文件 | 1（AddonInstallService） |
| UI 表格文件 | 5（TableActions、TableDataTransformer、TableMenuHandler、TableSearchHandler、TableColumnManager） |
| 工具文件 | 5（configuration、compat、locale、prefs、window） |
| 核心/事件文件 | 1（EventBus） |
| 生命周期文件 | 2（hooks.ts、addon.ts） |
| 入口文件 | 1（index.ts） |
| ztoolkit 初始化 | 1（ztoolkit.ts） |
| UI 详情文件 | 1（DetailButtonHandler） |
| 类型声明 | ~4（types/*.ts） |
