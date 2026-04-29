# Know Ur Zotero 性能采集参考

> 参考来源：`reference/Templetereference/know-ur-zotero-main/`（Know Ur Zotero）
> 用途：Zotero 进程内 CPU activity monitor / Firefox profiler 数据解析 / 插件性能归因参考
> 最后更新：2026-04-29

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：Know Ur Zotero 源码](../reference/Templetereference/know-ur-zotero-main/)
- [README](../reference/Templetereference/know-ur-zotero-main/README.md)

## 1. 结论

Know Ur Zotero 对当前 Zotero 版本的性能采集有帮助，但适用面应收窄为 **运行中 CPU activity 采样、资源 URI 归因、插件调试辅助面板**。它不应直接替代当前模板的 `agent:zotero:e2e`、`agent:monitor`、`agent:gate` 或 release 性能预算。

它最值得借鉴的是：

- 使用 `Services.profiler.StartProfiler()` / `getProfileDataAsync()` 获取 Firefox/Gecko profiler 数据。
- 采样 feature 包含 `js`、`stackwalk`、`cpu`、`responsiveness`、`processcpu`、`memory`，线程默认聚焦 `GeckoMain`。
- 在 WebWorker 中解析 profiler schema，按 call stack 聚合 `threadCPUDelta`，避免把重解析压回 Zotero 主线程。
- 按资源 URI 归因：插件资源 URI、`chrome://zotero/`、`resource://zotero/reader`、`resource://zotero/note-editor`、`resource://zotero/`。
- 提供开发者 API：`Zotero.kuZ.api.profiler.startProfiler/getProfileData/getAndProcessProfileData/stopProfiler`。
- 提供交互入口：Tools menu activity monitor、toolbar status indicator、about:memory 入口、activity log JSON 输出。

## 2. 可借鉴技术链

```
Zotero 主进程
  ├─ startProfiler()
  │   └─ Services.profiler.StartProfiler(entries, interval, features, threads, activeTabID, duration)
  ├─ getProfileDataAsync()
  ├─ StopProfiler()
  └─ getAnalyzer()
      └─ WebWorker analyze(profileData)
          ├─ 解析 samples / stackTable / frameTable / stringTable
          ├─ 聚合 threadCPUDelta
          ├─ 按 callStack includes(filter.key) 归因
          └─ 生成 averageUsage / detailedResults / statistics
```

## 3. 对当前模板的使用边界

适合使用：

- 需要知道某个 UI surface、Reader 操作、批处理任务或插件模块是否造成主线程 CPU 峰值。
- 需要比较“模板自身代码、Zotero 主程序、Reader、Note Editor、其他插件”大类 CPU 占用。
- 需要给开发者提供手动开启的 profiling/monitoring 面板或 JSON 日志。

不适合直接使用：

- 冷启动耗时、安装链路、远端更新链路、release 分发闭环这类端到端验收。
- 稳定的 CI 门禁阈值。Firefox profiler 采样结果受机器、OS、Zotero 内核、其他插件和用户数据量影响很大。
- 内存泄漏定量证明。它提供 `memory` profiler feature 和 `about:memory` 入口，但没有形成可复现的 heap diff / leak detector。
- 当前项目 truth / gate 判定。参考结论只作为技术链输入，不能覆盖 `docs/CURRENT_BACKLOG.md`。

## 4. 移植注意点

- 目标版本应继续按模板自己的 `strictMinVersion=6.999`、`strictMaxVersion=8.*` 与宿主 contract 验证；Know Ur Zotero README 标注 Zotero 7，不能自动代表 Zotero 8 已充分验证。
- `Services.profiler`、`ChromeUtils.import("resource://gre/modules/AddonManager.jsm")`、`browsingContext.browserId` 都属于宿主/Firefox 内核敏感接口；若纳入模板，应补 host/profiler smoke，而不是只靠类型通过。
- `getTime()` 中 Windows 微秒换算是兼容细节，移植时应用真实 profile timestamp 单位复核。
- `callStack.includes(filter.key)` 是轻量归因，不是严格 ownership；用于开发诊断可以，作为发布阻断证据时需配合稳定复现脚本。
- 采样、分析和 UI 更新应默认 opt-in 或低频运行，避免性能监控本身干扰被测对象。
