export const RELEASE_PLAN_RUN_NAME = "release-plan";
export const RELEASE_PLAN_RUN_DESCRIPTION = "执行本地发布计划（package + preflight + release notes + matrix）";

const RELEASE_GATE_CONTRACT = Object.freeze({
  requiredRunName: RELEASE_PLAN_RUN_NAME,
  requiredRunDescription: RELEASE_PLAN_RUN_DESCRIPTION,
  preferredPreparationCommand: "npm run agent:release",
  localPlanCommand: "npm run release:plan",
  installSmokeStableCommand: "npm run release:install-smoke:stable",
  installSmokeBetaCommand: "npm run release:install-smoke:beta",
  remoteVerificationCommand: "npm run release:preflight -- --verify-remote",
  refreshReleaseConsumersCommand: "npm run release:prepare && npm run release:matrix",
  releaseGateCommand: "npm run agent:gate:release",
});

function uniqueLines(entries = []) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

export function buildReleaseGateContract() {
  return {
    ...RELEASE_GATE_CONTRACT,
  };
}

export function buildReleaseWorkflowState(remoteVerification = null) {
  const status = String(remoteVerification?.status || "").trim() || "missing";
  const summary = String(remoteVerification?.summary || "").trim();
  const releaseReady = remoteVerification?.releaseReady === true;

  if (status === "passed" && releaseReady) {
    return {
      id: "remote-release-ready",
      label: "真实远端已验证",
      releaseReady: true,
      summary: summary || "远端 update.json 与 update_link 已完成真实 HTTP(S) 分发闭环验证。",
    };
  }
  if (status === "passed") {
    return {
      id: "remote-verification-synthetic",
      label: "仅测试型验证",
      releaseReady: false,
      summary: summary || "远端验证目前只覆盖 synthetic / 本地内联 URL，仍缺少真实 HTTP(S) 分发证据。",
    };
  }
  if (status === "pending") {
    return {
      id: "remote-verification-pending",
      label: "待真实远端验证",
      releaseReady: false,
      summary: summary || "远端 update.json 与 update_link 尚未校验。",
    };
  }
  if (status === "unconfigured") {
    return {
      id: "remote-verification-unconfigured",
      label: "远端发布未配置完成",
      releaseReady: false,
      summary: summary || "远端发布 URL 或 update_link 尚未配置完成。",
    };
  }
  if (status === "failed") {
    return {
      id: "remote-verification-failed",
      label: "远端验证失败",
      releaseReady: false,
      summary: summary || "远端 update.json 或 update_link 未通过校验。",
    };
  }
  return {
    id: "remote-verification-missing",
    label: "远端验证缺失",
    releaseReady: false,
    summary: summary || "当前缺少远端发布验证信息。",
  };
}

export function buildReleaseNextSteps(remoteVerification = null, gateContract = buildReleaseGateContract()) {
  const workflowState = buildReleaseWorkflowState(remoteVerification);
  const steps = [
    `进入 release gate 前，确认本轮已通过 \`${gateContract.preferredPreparationCommand}\` 记录 \`${gateContract.requiredRunName}\` 遥测；仅有 \`dist/release-plan.json\` 不足以通过闸门。`,
    `按顺序运行 \`${gateContract.installSmokeStableCommand}\` 与 \`${gateContract.installSmokeBetaCommand}\`，让 stable / beta 正式安装态 smoke 落盘到发布矩阵。`,
  ];

  if (workflowState.releaseReady !== true) {
    steps.push("手动上传远端 `update.json` 与 `.xpi`，并确保远端 URL 与当前 `release-manifest` 完全一致。");
    steps.push(`运行 \`${gateContract.remoteVerificationCommand}\` 记录真实 HTTP(S) 远端验证结果。`);
    steps.push(`运行 \`${gateContract.refreshReleaseConsumersCommand}\` 刷新 release-plan / release-matrix 消费链。`);
  }

  steps.push(`运行 \`${gateContract.releaseGateCommand}\` 确认发布档位 gate 通过。`);
  return uniqueLines(steps);
}
