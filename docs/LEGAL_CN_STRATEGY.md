# 中国法优先的法务治理策略

本文档用于说明模板在中国法律环境下的法务治理重心。它不是正式法律意见，也不替代律师审查。

## 目标口径

- 当前模板优先防范的不是“是否接触 Zotero 宿主接口”本身，而是来自其他开发者或交付相对方的著作权、开源许可与权利瑕疵风险。
- 因此，模板默认采用“宿主层可实现优先、第三方表达隔离严格、商业交付证据可审计”的策略。

## 风险优先级

### 1. 第三方开发者风险

重点防范：

- 复制或部分复制第三方插件源码
- 复制第三方 locale、图标、CSS/XHTML、README 文案、截图基线等受保护表达
- 使用附条件开源/免费材料但未履行声明、notice 或源码开放义务

### 2. 商业交付风险

重点防范：

- 委托开发或客户交付时的权利瑕疵
- 权利归属、再分发边界、第三方 notices 留档不足
- 交付包中混入 reference、分析材料或未披露的第三方资产

### 3. 宿主与商标风险

- Zotero 宿主接口适配允许按功能可实现优先推进，但不因此获得复制第三方实现的许可。
- Zotero 商标与著作权问题分开处理；本模板当前自动化门禁不把商标作为主阻断，而将其保留为产品命名与对外文案的单独审查项。

## 工程治理映射

- `npm run cleanroom:audit`
  - 开发态输出 clean-room 与中国法交付骨架摘要
  - China Commercial Delivery Gate 仅 advisory，不阻断日常开发
- `npm run release:preflight`
  - 发布态严格要求 similarity 可用
  - 发布态严格要求 `CODE_PROVENANCE.md`、`THIRD_PARTY_NOTICES.md`、`COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md`
  - 发布态严格要求 `LEGAL_RISK_CHECKLIST.md` 中 China Commercial Delivery Gate 已完成并带 Evidence
- `npm run export:project`
  - pure-project 导出会携带中国法法务骨架
  - 导出物继续排除 `reference/`、分析文档、截图基线与 agent 工件

## 交付默认动作

- 对外商业交付前，先补齐 `CODE_PROVENANCE.md`、`THIRD_PARTY_NOTICES.md`、`COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md`
- 以 `LEGAL_RISK_CHECKLIST.md` 作为唯一可勾选的法务门禁入口，不新开第二套检查清单
- 如需在客户项目中继续保持闭源或保留所有权利，应在项目合同与交付说明中单独确认授权边界；模板当前 `UNLICENSED` 不自动替代这些安排
