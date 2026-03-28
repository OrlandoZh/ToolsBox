# Zotero Cleanroom Template Specification

本文件只描述当前模板基线的黑盒行为，不描述参考项目结构，也不把内部 agent 脚本实现细节写成插件产品契约。

## Product Identity

- Name: `Zotero Cleanroom Template`
- Package identity: `cleanroom-template@example.com` / `cleanroomtemplate`
- Zotero compatibility target: `Zotero 7/8`
- Current verified build: `8.0.2-beta.5+c35d7f21e`
- Current platform claim: `macOS 已验证，其他桌面平台为设计目标但未纳入当前基线声明`

## Product Goal

该模板为 Zotero 插件提供一套可运行、可验证、可扩展的 clean-room 起点。默认安装后应呈现一组最小但完整的演示能力，用于验证命令注册、菜单注入、偏好设置、Reader 接口、生命周期治理与可观测性链路已经接通。

## Baseline Capabilities

### 1. Startup And Shutdown

- Activation path: 插件被 Zotero 加载、启用、停用、重载或卸载。
- Required outcome:
  - 启动时完成一次初始化，并避免重复启动。
  - 停止时撤销窗口注入、命令、菜单、Notifier、Reader 监听与快捷键。
  - 当 Zotero 已存在主窗口时，插件应在启动后补挂当前窗口，而不只依赖后续窗口事件。
- Observable results:
  - 插件默认能力在现有主窗口中可见。
  - 停止后，模板注入的 UI 不应继续残留为活跃注册项。

### 2. Main Command And Feedback

- Activation path: 用户执行模板主命令、点击模板上下文菜单，或按下默认快捷键。
- Required outcome:
  - 主命令可在命令面板中出现并执行。
  - 主窗口上下文菜单在有条目上下文时可见。
  - 默认快捷键 `Ctrl+Shift+Y` 可触发模板演示反馈。
  - 执行动作后，用户可看到明确反馈，而不是静默失败。
- Error behavior:
  - 若插件被设置为禁用，依赖 `enabled` 的交互入口不应继续暴露为可执行动作。
  - 若运行环境缺少必要宿主对象，动作应失败得可诊断，而不是导致未受控崩溃。

### 3. Preferences And Settings Governance

- Inputs:
  - `enabled`
  - `menuLabel`
  - `logLevel`
- Persistence behavior:
  - 配置通过 Zotero 偏好系统持久化。
  - 偏好设置面板应作为原生 pane 注册并可打开。
- Validation:
  - `logLevel` 只接受模板声明的日志级别集合。
  - 偏好变更后，依赖这些值的窗口级功能可在不重启 Zotero 的情况下收敛到新状态。

### 4. Baseline UI Injection

- Activation path: 模板在主窗口完成挂载，且 `enabled=true`。
- Required outcome:
  - 主窗口样式资源被注入。
  - 命令面板出现模板主命令与 Reader 摘要命令。
  - 原生菜单接口可用时，主窗口上下文菜单与 Reader 菜单注册成功。
  - ItemPane 注册一个信息行和一个 section。
  - ItemTree 注册一个模板演示列。
- Accessibility / UX notes:
  - 所有用户可见标签应走 locale 资源，而不是硬编码英文文本。
  - 信息行与 section 在没有可用条目时应收起或禁用，而不是展示失效内容。

### 5. Reader Baseline

- Activation path: 存在活动 Reader 标签页或打开 PDF 附件。
- Required outcome:
  - Reader 摘要命令只在有活动 Reader 摘要时可执行。
  - 模板能够读取活动 Reader 的基本摘要信息。
  - 模板具备接入 Reader 事件桥与细粒度宿主注入点的基线能力。
- Current scope note:
  - 本基线承诺“Reader 接口与演示链路可接通并可观察”，不承诺具体业务型 Reader 功能。

### 6. Localized Static Runtime Baseline

- Activation path: 构建、打包、安装、启动。
- Required outcome:
  - `bootstrap.js`、`preferences.xhtml`、`main.css`、icons 与三套 locale 资源构成模板静态运行时基线。
  - 模板资源缺失或漂移时，应能被仓库校验或测试直接发现。
  - 中文简体、中文繁体与英文基线文案保持存在。

### 7. Observability

- Activation path: 启动、交互、场景验证、自动化检查。
- Required outcome:
  - 模板默认输出可诊断日志与健康摘要。
  - 运行时桥接状态可被读取。
  - 自动化验证链能观测命令、菜单、偏好设置、Reader、视觉截图和场景结果。
- Scope note:
  - 这些可观测输出属于开发与验证接口，不代表面向最终插件用户的业务功能。

## Non-Functional Baseline

- Clean-room requirement: 对外声明只基于行为规格和本仓库实现，不依赖 reference 代码副本作为运行前提。
- Reliability: 生命周期切换必须幂等，重复 startup/shutdown 不应产生重复注册。
- Recoverability: 缺失静态资源、locale 漂移、注册缺口等问题应可被脚本或测试快速定位。
- Packaging: 模板可构建为 Zotero 可安装的 `.xpi` 包，并生成 update / release 元数据。

## Acceptance Criteria (Black-Box)

- [x] 在 Zotero 主窗口中可以看到模板命令、上下文菜单、偏好设置面板、ItemPane 演示区和 ItemTree 演示列。
- [x] 默认主命令、Reader 摘要命令和快捷键可以触发可见反馈或可读结果。
- [x] 修改 `enabled`、`menuLabel`、`logLevel` 后，窗口级功能与日志行为会在当前会话中收敛。
- [x] 打开真实 PDF Reader 后，可以读到活动 Reader 摘要，并保留 Reader 宿主事件接入能力。
- [x] 构建、打包、发布元数据和本地发布预检可以产出完整工件。
- [x] 插件停用或重载后，注册项和监听器能够被清理，不留重复挂载痕迹。
