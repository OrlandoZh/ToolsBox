import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  AGENT_CONTEXT_SCHEMA_VERSION,
  buildAgentContext,
  buildRuntimeCompactView,
  loadAgentContextSources,
  writeAgentContextArtifacts,
} from "./agent-context-lib.mjs";
import {
  buildScriptFailureInfo,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";
import { resolveAgentContextArtifacts } from "./agent-artifacts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

async function main() {
  const sources = await loadAgentContextSources(projectRoot);
  const context = buildAgentContext(sources);
  const outputs = await writeAgentContextArtifacts(projectRoot, context);
  console.log(`Agent context generated: ${outputs.reportJSON}`);
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const artifacts = resolveAgentContextArtifacts(projectRoot);
  try {
    await fs.mkdir(path.dirname(artifacts.reportJSON), { recursive: true });
    const failureContext = {
      schemaVersion: AGENT_CONTEXT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      sourceFreshness: {
        currentTruthUpdatedAt: null,
        monitorGeneratedAt: null,
        gateGeneratedAt: null,
        memoryGeneratedAt: null,
      },
      stableContext: {
        stableContextKey: null,
      },
      dynamicContext: {
        dynamicFingerprint: null,
      },
      sourceAlignment: {
        status: "repair-required",
        generationStage: "standalone",
        preferredRepairCommand: "npm run agent:context",
        warningKinds: ["missing-required-section"],
        summary: failureInfo.errorMessage,
      },
      decisionHints: {
        nextAction: "npm run agent:monitor",
        nextActionCommand: "npm run agent:monitor",
        mainBlocker: failureInfo.errorMessage,
        recommendedEvidence: [],
        summary: failureInfo.errorMessage,
      },
      driftSignals: {
        status: "warning",
        warningCount: 1,
        summary: failureInfo.errorMessage,
        signals: [
          {
            id: "agent-context-script-failure",
            kind: "execution-failure",
            status: "warning",
            severity: "warning",
            message: failureInfo.errorMessage,
            recommendation: "先修复 agent-context 脚本异常，再重新执行 `npm run agent:context`。",
          },
        ],
      },
      durationMs: failureInfo.durationMs,
      ...failureInfo,
    };
    failureContext.runtimeCompact = buildRuntimeCompactView(failureContext);
    await writeJSONArtifact(artifacts.reportJSON, failureContext);
    await fs.writeFile(
      artifacts.reportMD,
      [
        "# Agent Context",
        "",
        "- 状态: 失败",
        `- 分类: \`${failureInfo.errorCategoryLabel}\``,
        `- 阶段: \`${failureInfo.failedStage}\``,
        `- 信息: ${failureInfo.errorMessage}`,
        `- 耗时: \`${failureInfo.durationMs}ms\``,
        "",
      ].join("\n"),
      "utf-8",
    );
  } catch {
    // ignore secondary failure
  }
  console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
