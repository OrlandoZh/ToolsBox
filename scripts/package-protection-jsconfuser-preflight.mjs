import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import {
  BUILD_MODULE_ID_MODE_ANONYMIZED,
  BUILD_MODULE_ID_MODE_ENV,
  BUILD_SEMANTIC_SCRUB_ENV,
  BUILD_SEMANTIC_SCRUB_PROTECTED,
} from "./build.mjs";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  buildPackageProtectionAuditAnchors,
  scanBundleAnchors,
} from "./package-protection-anchor-audit.mjs";
import {
  assertNonEmptyString,
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const DEFAULT_REPORT_BASENAME = "package-protection-jsconfuser-preflight";
const TARGETED_STRING_REPORT_BASENAME = "package-protection-jsconfuser-string-preflight";
const SOURCE_PROXY_MODES = Object.freeze(["plain", "protected"]);
const PREFLIGHT_PROFILES = Object.freeze([
  "ast-scrambler",
  "targeted-string-concealing",
]);
const DEFAULT_TARGETED_STRING_CONCEALING_ANCHOR_IDS = Object.freeze([
  "plugin-api-agent-surface",
  "run-agent-action",
  "list-agent-capabilities",
  "package-protection-summary",
  "lifecycle-telemetry-summary",
  "capability-entrypoints",
  "capability-owned-by",
  "capability-success-signals",
  "service-registry",
  "optional-bundles",
  "optional-agent-runtime",
  "optional-ai-service",
]);
const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  failed: "失败",
});

function truncateOutput(value, maxChars = 1200) {
  const text = String(value || "");
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n...[truncated]`
    : text;
}

function resolveJSConfuserProfileLabel(profile = {}) {
  return profile?.stringConcealing === "substring-match-targeted"
    ? "targeted stringConcealing"
    : "astScrambler";
}

function formatBytes(bytes) {
  const numeric = Math.max(0, Number(bytes || 0));
  if (numeric >= 1024 * 1024) {
    return `${(numeric / (1024 * 1024)).toFixed(2)}MB`;
  }
  if (numeric >= 1024) {
    return `${(numeric / 1024).toFixed(2)}KB`;
  }
  return `${numeric}B`;
}

function computeGrowthRatio(inputBytes, outputBytes) {
  const input = Number(inputBytes || 0);
  const output = Number(outputBytes || 0);
  if (!(input > 0) || !(output > 0)) {
    return null;
  }
  return Number((output / input).toFixed(2));
}

function normalizeSourceProxyMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SOURCE_PROXY_MODES.includes(normalized) ? normalized : null;
}

function normalizePreflightProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "ast-scrambler";
  }
  if (normalized === "string-concealing-targeted") {
    return "targeted-string-concealing";
  }
  return PREFLIGHT_PROFILES.includes(normalized) ? normalized : null;
}

function buildSourceProxyBuildEnv(mode) {
  if (mode === "protected") {
    return {
      [BUILD_MODULE_ID_MODE_ENV]: BUILD_MODULE_ID_MODE_ANONYMIZED,
      [BUILD_SEMANTIC_SCRUB_ENV]: BUILD_SEMANTIC_SCRUB_PROTECTED,
    };
  }
  return {};
}

function runNodeProcess(args = [], options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: options.cwd || projectRoot,
    env: {
      ...process.env,
      ...(options.env && typeof options.env === "object" ? options.env : {}),
    },
    encoding: "utf-8",
    stdio: "pipe",
  });

  return {
    ok: result.status === 0 && !result.error,
    exitCode: Number(result.status ?? 1),
    durationMs: Math.max(0, Date.now() - startedAt),
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    errorMessage: result.error ? String(result.error.message || result.error) : null,
  };
}

function getPresentAnchors(scan = {}, allowedCategories = null) {
  const categories = allowedCategories instanceof Set ? allowedCategories : null;
  return (Array.isArray(scan?.anchors) ? scan.anchors : [])
    .filter((anchor) => anchor.present === true)
    .filter((anchor) => !categories || categories.has(String(anchor.category || "")));
}

export function buildJSConfuserAstScramblerProfile() {
  return {
    target: "browser",
    astScrambler: true,
    stringConcealing: false,
    pack: false,
    rgf: false,
    lock: {
      antiDebug: false,
      tamperProtection: false,
    },
  };
}

export function buildJSConfuserTargetedStringConcealingProfile({
  targetAnchors = [],
  targetStrings = [],
} = {}) {
  return {
    target: "browser",
    astScrambler: false,
    stringConcealing: "substring-match-targeted",
    stringConcealingTargetAnchors: [...targetAnchors],
    stringConcealingTargetStrings: [...targetStrings],
    pack: false,
    rgf: false,
    lock: {
      antiDebug: false,
      tamperProtection: false,
    },
  };
}

export function parsePackageProtectionJSConfuserPreflightArgs(argv = process.argv.slice(2)) {
  const options = {
    toolPath: null,
    toolEntry: null,
    bundlePath: null,
    profile: "ast-scrambler",
    sourceProxyMode: "plain",
    targetAnchors: [],
    targetStrings: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--tool-path":
        options.toolPath = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--tool-entry":
        options.toolEntry = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--profile": {
        const profile = normalizePreflightProfile(argv[index + 1]);
        assertScript(Boolean(profile), "--profile must be one of ast-scrambler|targeted-string-concealing", {
          category: "args",
          failedStage: "parse-args",
        });
        options.profile = profile;
        index += 1;
        break;
      }
      case "--bundle-path":
        options.bundlePath = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--source-proxy-mode": {
        const mode = normalizeSourceProxyMode(argv[index + 1]);
        assertScript(Boolean(mode), "--source-proxy-mode must be one of plain|protected", {
          category: "args",
          failedStage: "parse-args",
        });
        options.sourceProxyMode = mode;
        index += 1;
        break;
      }
      case "--target-anchor": {
        const targetAnchor = String(argv[index + 1] || "").trim();
        assertScript(Boolean(targetAnchor), "--target-anchor requires a non-empty anchor id", {
          category: "args",
          failedStage: "parse-args",
        });
        options.targetAnchors.push(targetAnchor);
        index += 1;
        break;
      }
      case "--target-string": {
        const targetString = String(argv[index + 1] || "").trim();
        assertScript(Boolean(targetString), "--target-string requires a non-empty string", {
          category: "args",
          failedStage: "parse-args",
        });
        options.targetStrings.push(targetString);
        index += 1;
        break;
      }
      default:
        throw createScriptError("args", `Unknown option: ${token}`, {
          failedStage: "parse-args",
          details: {
            option: token,
          },
        });
    }
  }

  assertScript(Boolean(options.toolPath), "--tool-path is required", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

export function resolveJSConfuserTargetAnchorNeedles(anchorIds = [], anchors = []) {
  const anchorMap = new Map(
    (Array.isArray(anchors) ? anchors : []).map((anchor) => [String(anchor?.id || ""), anchor]),
  );
  const resolvedAnchors = [];
  const resolvedTargetStrings = [];

  for (const anchorId of anchorIds) {
    const normalizedId = String(anchorId || "").trim();
    const anchor = anchorMap.get(normalizedId) || null;
    assertScript(Boolean(anchor?.needle), `unknown --target-anchor: ${normalizedId}`, {
      category: "args",
      failedStage: "resolve-target-anchors",
      details: {
        anchorId: normalizedId,
      },
    });
    if (!resolvedAnchors.includes(normalizedId)) {
      resolvedAnchors.push(normalizedId);
    }
    if (!resolvedTargetStrings.includes(anchor.needle)) {
      resolvedTargetStrings.push(anchor.needle);
    }
  }

  return {
    resolvedAnchors,
    resolvedTargetStrings,
  };
}

export function resolveJSConfuserPreflightProfile(options = {}, anchors = []) {
  const profile = normalizePreflightProfile(options.profile) || "ast-scrambler";
  if (profile === "ast-scrambler") {
    return buildJSConfuserAstScramblerProfile();
  }

  const explicitTargetAnchors = Array.isArray(options.targetAnchors) ? options.targetAnchors : [];
  const effectiveTargetAnchors = explicitTargetAnchors.length > 0
    ? explicitTargetAnchors
    : DEFAULT_TARGETED_STRING_CONCEALING_ANCHOR_IDS;
  const { resolvedAnchors, resolvedTargetStrings } = resolveJSConfuserTargetAnchorNeedles(
    effectiveTargetAnchors,
    anchors,
  );
  const explicitTargetStrings = (Array.isArray(options.targetStrings) ? options.targetStrings : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const combinedTargetStrings = [...resolvedTargetStrings];
  for (const value of explicitTargetStrings) {
    if (!combinedTargetStrings.includes(value)) {
      combinedTargetStrings.push(value);
    }
  }

  return buildJSConfuserTargetedStringConcealingProfile({
    targetAnchors: resolvedAnchors,
    targetStrings: combinedTargetStrings,
  });
}

export function resolveJSConfuserEntryRelativePath(packageJSON = {}) {
  const candidates = [];
  const exportsField = packageJSON?.exports;
  const dotExport = exportsField && typeof exportsField === "object" && !Array.isArray(exportsField)
    ? exportsField["."]
    : null;

  [
    packageJSON?.module,
    packageJSON?.main,
    typeof exportsField === "string" ? exportsField : null,
    typeof dotExport === "string" ? dotExport : null,
    dotExport?.import,
    dotExport?.default,
    dotExport?.require,
    "dist/index.js",
    "dist/index.cjs",
    "src/index.js",
    "index.js",
  ].forEach((candidate) => {
    const normalized = String(candidate || "").trim();
    if (!normalized || candidates.includes(normalized)) {
      return;
    }
    candidates.push(normalized);
  });

  return candidates;
}

async function resolveExistingEntryPath(toolPath, packageJSON, overrideEntry = null) {
  const candidates = overrideEntry
    ? [String(overrideEntry || "").trim()]
    : resolveJSConfuserEntryRelativePath(packageJSON);

  for (const candidate of candidates) {
    const entryPath = path.resolve(toolPath, candidate);
    const stats = await fs.stat(entryPath).catch(() => null);
    if (stats?.isFile()) {
      return {
        entryPath,
        entryRelativePath: candidate,
      };
    }
  }

  throw createScriptError("environment", "unable to resolve js-confuser entry from toolPath", {
    failedStage: "resolve-tool-entry",
    details: {
      toolPath,
      candidates,
    },
  });
}

export async function ensureJSConfuserToolReady(toolPath, overrideEntry = null) {
  const resolvedToolPath = path.resolve(toolPath);
  const packagePath = path.join(resolvedToolPath, "package.json");
  const nodeModulesPath = path.join(resolvedToolPath, "node_modules");

  const [packageStats, nodeModulesStats] = await Promise.all([
    fs.stat(packagePath).catch(() => null),
    fs.stat(nodeModulesPath).catch(() => null),
  ]);

  assertScript(Boolean(packageStats?.isFile()), "toolPath must contain package.json", {
    category: "environment",
    failedStage: "validate-tool-path",
    details: {
      packagePath,
    },
  });
  assertScript(Boolean(nodeModulesStats?.isDirectory()), "toolPath must have installed dependencies in node_modules", {
    category: "environment",
    failedStage: "validate-tool-path",
    details: {
      nodeModulesPath,
    },
  });

  const packageJSON = await readJSONFile(packagePath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-tool-package",
    label: "js-confuser package.json",
  });
  const entryInfo = await resolveExistingEntryPath(resolvedToolPath, packageJSON, overrideEntry);

  return {
    toolPath: resolvedToolPath,
    packagePath,
    nodeModulesPath,
    packageJSON,
    ...entryInfo,
  };
}

async function ensureSourceProxyBundle({ sourceProxyMode, config, bundlePath = null }) {
  if (bundlePath) {
    return path.resolve(bundlePath);
  }

  const result = runNodeProcess(["scripts/build.mjs"], {
    cwd: projectRoot,
    env: {
      CLEANROOM_BUILD_LOCK_HELD: "1",
      ...buildSourceProxyBuildEnv(sourceProxyMode),
    },
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (!result.ok) {
    throw createScriptError("execution", "source proxy build failed", {
      failedStage: "build-source-proxy-bundle",
      details: {
        sourceProxyMode,
        exitCode: result.exitCode,
        stderr: truncateOutput(result.stderr),
      },
    });
  }

  return path.join(projectRoot, "build", config.addonRef, "content", "scripts", `${config.addonRef}.js`);
}

function buildJSConfuserRunnerSource() {
  return `import { promises as fs } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

function pickObfuscate(mod) {
  const candidates = [
    ["named-obfuscate", mod?.obfuscate],
    ["default-obfuscate", mod?.default?.obfuscate],
    ["default-function", mod?.default],
    ["module-function", mod],
    ["named-jsconfuser-obfuscate", mod?.JsConfuser?.obfuscate],
  ];
  return candidates.find(([, value]) => typeof value === "function") || null;
}

const [, , entryPath, inputPath, outputPath, profilePath] = process.argv;
if (!entryPath || !inputPath || !outputPath || !profilePath) {
  throw new Error("missing runner args");
}

function buildProfile(profileSpec) {
  if (profileSpec?.stringConcealing === "substring-match-targeted") {
    const targetStrings = Array.isArray(profileSpec?.stringConcealingTargetStrings)
      ? profileSpec.stringConcealingTargetStrings
        .map((value) => String(value || "").trim())
        .filter(Boolean)
      : [];
    return {
      target: profileSpec?.target || "browser",
      astScrambler: Boolean(profileSpec?.astScrambler),
      stringConcealing(strValue) {
        const value = String(strValue || "");
        return targetStrings.some((token) => value.includes(token));
      },
      pack: Boolean(profileSpec?.pack),
      rgf: Boolean(profileSpec?.rgf),
      lock: {
        antiDebug: Boolean(profileSpec?.lock?.antiDebug),
        tamperProtection: Boolean(profileSpec?.lock?.tamperProtection),
      },
    };
  }
  return profileSpec;
}

const profile = buildProfile(JSON.parse(await fs.readFile(profilePath, "utf-8")));
const source = await fs.readFile(inputPath, "utf-8");
const mod = await import(pathToFileURL(entryPath).href);
const picked = pickObfuscate(mod);
if (!picked) {
  throw new Error("no supported obfuscate API found in tool entry");
}

const [apiShape, obfuscate] = picked;
const result = await obfuscate(source, profile);
const output = typeof result === "string" ? result : result?.code;
if (typeof output !== "string") {
  throw new Error("tool did not return string code");
}
await fs.writeFile(outputPath, output, "utf-8");
process.stdout.write(JSON.stringify({ apiShape }) + "\\n");
`;
}

function tryParseFirstJSONLine(stdout = "") {
  const lines = String(stdout || "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      // ignore
    }
  }
  return null;
}

export async function applyPackageProtectionJSConfuserTransform({
  toolInfo,
  bundlePath,
  profile,
  outputPath = bundlePath,
} = {}) {
  assertScript(Boolean(toolInfo?.entryPath), "js-confuser toolInfo.entryPath is required", {
    category: "args",
    failedStage: "jsconfuser-transform",
  });
  assertNonEmptyString(bundlePath, "bundlePath", {
    category: "args",
    failedStage: "jsconfuser-transform",
  });
  assertScript(Boolean(profile && typeof profile === "object"), "js-confuser profile is required", {
    category: "args",
    failedStage: "jsconfuser-transform",
  });

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jsconfuser-transform-"));
  const inputPath = path.join(tempRoot, "input.js");
  const stagedOutputPath = path.join(tempRoot, "output.js");
  const profilePath = path.join(tempRoot, "profile.json");
  const runnerPath = path.join(tempRoot, "runner.mjs");

  try {
    const inputSource = await fs.readFile(bundlePath, "utf-8");
    const inputBytes = Buffer.byteLength(inputSource);
    await Promise.all([
      fs.writeFile(inputPath, inputSource, "utf-8"),
      fs.writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf-8"),
      fs.writeFile(runnerPath, buildJSConfuserRunnerSource(), "utf-8"),
    ]);

    const execution = runNodeProcess(
      [runnerPath, toolInfo.entryPath, inputPath, stagedOutputPath, profilePath],
      { cwd: toolInfo.toolPath },
    );
    const parsedMeta = tryParseFirstJSONLine(execution.stdout);
    const syntaxCheck = execution.ok
      ? runNodeProcess(["--check", stagedOutputPath], { cwd: toolInfo.toolPath })
      : null;

    let outputBytes = 0;
    if (execution.ok && syntaxCheck?.ok) {
      const outputSource = await fs.readFile(stagedOutputPath, "utf-8");
      outputBytes = Buffer.byteLength(outputSource);
      await fs.writeFile(path.resolve(outputPath), outputSource, "utf-8");
    }

    return {
      succeeded: execution.ok,
      exitCode: execution.exitCode,
      durationMs: execution.durationMs,
      stdout: truncateOutput(execution.stdout),
      stderr: truncateOutput(execution.stderr),
      errorMessage: execution.errorMessage,
      apiShape: String(parsedMeta?.apiShape || ""),
      syntaxCheckPassed: syntaxCheck ? syntaxCheck.ok : false,
      syntaxCheckStderr: syntaxCheck ? truncateOutput(syntaxCheck.stderr) : "",
      inputBytes,
      outputBytes,
      growthRatio: computeGrowthRatio(inputBytes, outputBytes),
      outputPath: path.resolve(outputPath),
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function runJSConfuserAttempt({
  toolInfo,
  bundlePath,
  profile,
  anchors,
}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jsconfuser-preflight-"));
  const inputPath = path.join(tempRoot, "input.js");
  const outputPath = path.join(tempRoot, "output.js");
  const profilePath = path.join(tempRoot, "profile.json");
  const runnerPath = path.join(tempRoot, "runner.mjs");

  try {
    const inputSource = await fs.readFile(bundlePath, "utf-8");
    const inputBytes = Buffer.byteLength(inputSource);
    await Promise.all([
      fs.writeFile(inputPath, inputSource, "utf-8"),
      fs.writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf-8"),
      fs.writeFile(runnerPath, buildJSConfuserRunnerSource(), "utf-8"),
    ]);

    const execution = runNodeProcess(
      [runnerPath, toolInfo.entryPath, inputPath, outputPath, profilePath],
      { cwd: toolInfo.toolPath },
    );
    const parsedMeta = tryParseFirstJSONLine(execution.stdout);
    const syntaxCheck = execution.ok
      ? runNodeProcess(["--check", outputPath], { cwd: toolInfo.toolPath })
      : null;

    let output = null;
    if (execution.ok) {
      const outputSource = await fs.readFile(outputPath, "utf-8");
      const outputBytes = Buffer.byteLength(outputSource);
      const inputScan = scanBundleAnchors(inputSource, anchors);
      const outputScan = scanBundleAnchors(outputSource, anchors);
      output = {
        path: outputPath,
        bytes: outputBytes,
        inputScan,
        outputScan,
      };
    }

    return {
      succeeded: execution.ok,
      exitCode: execution.exitCode,
      durationMs: execution.durationMs,
      stdout: truncateOutput(execution.stdout),
      stderr: truncateOutput(execution.stderr),
      errorMessage: execution.errorMessage,
      apiShape: String(parsedMeta?.apiShape || ""),
      syntaxCheckPassed: syntaxCheck ? syntaxCheck.ok : false,
      syntaxCheckStderr: syntaxCheck ? truncateOutput(syntaxCheck.stderr) : "",
      inputBytes,
      output,
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export function buildJSConfuserSemanticDelta(inputScan = {}, outputScan = {}) {
  const semanticCategories = new Set(["inner-bundle-semantics", "bundle-label"]);
  const inputPresent = getPresentAnchors(inputScan, semanticCategories);
  const outputPresent = getPresentAnchors(outputScan, semanticCategories);
  const outputIds = new Set(outputPresent.map((anchor) => anchor.id));
  const inputMatchCount = inputPresent.reduce((sum, anchor) => sum + Number(anchor.count || 0), 0);
  const outputMatchCount = outputPresent.reduce((sum, anchor) => sum + Number(anchor.count || 0), 0);

  return {
    inputAnchorCount: inputPresent.length,
    inputMatchCount,
    outputAnchorCount: outputPresent.length,
    outputMatchCount,
    reducedAnchorCount: Math.max(0, inputPresent.length - outputPresent.length),
    reducedMatchCount: Math.max(0, inputMatchCount - outputMatchCount),
    removedAnchorIds: inputPresent
      .map((anchor) => anchor.id)
      .filter((id) => !outputIds.has(id)),
    remainingAnchorIds: outputPresent.map((anchor) => anchor.id),
  };
}

export function buildPackageProtectionJSConfuserAttemptStatus({
  succeeded = false,
  syntaxCheckPassed = false,
  inputBytes = 0,
  outputBytes = 0,
  semanticDelta = null,
}) {
  if (!succeeded || !syntaxCheckPassed) {
    return "failed";
  }

  const growthRatio = computeGrowthRatio(inputBytes, outputBytes);
  if (growthRatio !== null && growthRatio > 3) {
    return "attention";
  }

  if (Number(semanticDelta?.reducedAnchorCount || 0) <= 0 && Number(semanticDelta?.reducedMatchCount || 0) <= 0) {
    return "attention";
  }

  return "passed";
}

export function summarizePackageProtectionJSConfuserPreflight({
  toolInfo,
  sourceProxyMode,
  bundlePath,
  profile,
  attempt,
}) {
  const profileLabel = resolveJSConfuserProfileLabel(profile);
  const semanticDelta = attempt?.output
    ? buildJSConfuserSemanticDelta(attempt.output.inputScan, attempt.output.outputScan)
    : {
      inputAnchorCount: 0,
      inputMatchCount: 0,
      outputAnchorCount: 0,
      outputMatchCount: 0,
      reducedAnchorCount: 0,
      reducedMatchCount: 0,
      removedAnchorIds: [],
      remainingAnchorIds: [],
    };
  const status = buildPackageProtectionJSConfuserAttemptStatus({
    succeeded: attempt?.succeeded === true,
    syntaxCheckPassed: attempt?.syntaxCheckPassed === true,
    inputBytes: attempt?.inputBytes || 0,
    outputBytes: attempt?.output?.bytes || 0,
    semanticDelta,
  });

  let nextAction = "inspect-tool-api";
  let summary = `js-confuser ${profileLabel} 预检尚未成功产出可解析输出，先确认外部 tool checkout 与 API 入口。`;

  if (status === "attention") {
    const growthRatio = computeGrowthRatio(attempt?.inputBytes || 0, attempt?.output?.bytes || 0);
    if (growthRatio !== null && growthRatio > 3) {
      nextAction = "reject-for-loader-lite-route";
      summary = `${profileLabel} 已能产出结果，但体积膨胀超过当前 loader-lite 路线可接受门槛，不建议直接进入下一轮 XPI A/B。`;
    } else {
      nextAction = "not-promising-for-semantics";
      summary = `${profileLabel} 已能产出结果，但对当前高层语义锚点压缩不明显，暂不足以证明它值得进入更重的集成实验。`;
    }
  } else if (status === "passed") {
    nextAction = "run-zotero-smoke-ab";
    summary = `${profileLabel} 预检初步通过，兼容与体积仍在可控范围内，且对高层语义锚点有实际压缩，可进入更完整的手动 A/B。`;
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.attention,
    summary,
    nextAction,
    tool: {
      path: toolInfo?.toolPath || null,
      name: String(toolInfo?.packageJSON?.name || ""),
      version: String(toolInfo?.packageJSON?.version || ""),
      entryPath: toolInfo?.entryPath || null,
      entryRelativePath: toolInfo?.entryRelativePath || null,
      apiShape: attempt?.apiShape || "",
    },
    input: {
      sourceProxyMode,
      bundlePath,
      bytes: Number(attempt?.inputBytes || 0),
    },
    requestedProfile: { ...profile },
    attempt: {
      status,
      succeeded: attempt?.succeeded === true,
      durationMs: Number(attempt?.durationMs || 0),
      exitCode: Number(attempt?.exitCode || 0),
      syntaxCheckPassed: attempt?.syntaxCheckPassed === true,
      stdout: attempt?.stdout || "",
      stderr: attempt?.stderr || "",
      syntaxCheckStderr: attempt?.syntaxCheckStderr || "",
      outputBytes: Number(attempt?.output?.bytes || 0),
      growthRatio: computeGrowthRatio(attempt?.inputBytes || 0, attempt?.output?.bytes || 0),
    },
    semanticDelta,
  };
}

export function renderPackageProtectionJSConfuserPreflightMarkdown(report = {}) {
  const lines = [
    "# Package Protection JS-Confuser Preflight",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- nextAction: \`${report.nextAction || "-"}\``,
    `- 摘要: ${report.summary || "-"}`,
    "",
    "## Tool",
    "",
    `- 路径: \`${report.tool?.path || "-"}\``,
    `- 包名: \`${report.tool?.name || "-"}\``,
    `- 版本: \`${report.tool?.version || "-"}\``,
    `- entry: \`${report.tool?.entryRelativePath || report.tool?.entryPath || "-"}\``,
    `- apiShape: \`${report.tool?.apiShape || "-"}\``,
    "",
    "## Input",
    "",
    `- sourceProxyMode: \`${report.input?.sourceProxyMode || "-"}\``,
    `- bundle: \`${report.input?.bundlePath || "-"}\``,
    `- bytes: \`${formatBytes(report.input?.bytes || 0)}\``,
    "",
    "## Requested Profile",
    "",
    `- profile: \`${report.requestedProfile?.stringConcealing === "substring-match-targeted" ? "targeted-string-concealing" : "ast-scrambler"}\``,
    `- target: \`${report.requestedProfile?.target || "-"}\``,
    `- astScrambler: \`${report.requestedProfile?.astScrambler ? "true" : "false"}\``,
    `- stringConcealing: \`${report.requestedProfile?.stringConcealing || "false"}\``,
    `- stringConcealing targets: \`${(report.requestedProfile?.stringConcealingTargetStrings || []).join(" | ") || "-"}\``,
    `- lock.antiDebug: \`${report.requestedProfile?.lock?.antiDebug ? "true" : "false"}\``,
    `- lock.tamperProtection: \`${report.requestedProfile?.lock?.tamperProtection ? "true" : "false"}\``,
    `- pack: \`${report.requestedProfile?.pack ? "true" : "false"}\``,
    `- rgf: \`${report.requestedProfile?.rgf ? "true" : "false"}\``,
    "",
    "## Attempt",
    "",
    `- 状态: \`${report.attempt?.status || "-"}\``,
    `- 成功: \`${report.attempt?.succeeded ? "yes" : "no"}\``,
    `- durationMs: \`${Number(report.attempt?.durationMs || 0)}\``,
    `- exitCode: \`${Number(report.attempt?.exitCode || 0)}\``,
    `- syntaxCheckPassed: \`${report.attempt?.syntaxCheckPassed ? "yes" : "no"}\``,
    `- output bytes: \`${formatBytes(report.attempt?.outputBytes || 0)}\``,
    `- growth ratio: \`${report.attempt?.growthRatio ?? "-"}\``,
    `- stderr: \`${report.attempt?.stderr || "-"}\``,
    `- syntaxCheck stderr: \`${report.attempt?.syntaxCheckStderr || "-"}\``,
    "",
    "## Semantic Delta",
    "",
    `- inputAnchorCount: \`${Number(report.semanticDelta?.inputAnchorCount || 0)}\``,
    `- inputMatchCount: \`${Number(report.semanticDelta?.inputMatchCount || 0)}\``,
    `- outputAnchorCount: \`${Number(report.semanticDelta?.outputAnchorCount || 0)}\``,
    `- outputMatchCount: \`${Number(report.semanticDelta?.outputMatchCount || 0)}\``,
    `- reducedAnchorCount: \`${Number(report.semanticDelta?.reducedAnchorCount || 0)}\``,
    `- reducedMatchCount: \`${Number(report.semanticDelta?.reducedMatchCount || 0)}\``,
    `- removedAnchorIds: \`${(report.semanticDelta?.removedAnchorIds || []).join(" | ") || "-"}\``,
    `- remainingAnchorIds: \`${(report.semanticDelta?.remainingAnchorIds || []).join(" | ") || "-"}\``,
    "",
  ];

  return lines.join("\n");
}

export function resolvePackageProtectionJSConfuserReportBasename(report = {}) {
  return report?.requestedProfile?.stringConcealing === "substring-match-targeted"
    ? TARGETED_STRING_REPORT_BASENAME
    : DEFAULT_REPORT_BASENAME;
}

export async function persistPackageProtectionJSConfuserPreflight(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportBasename = resolvePackageProtectionJSConfuserReportBasename(report);
  const reportPath = resolveAgentArtifactPath(projectRootPath, `${reportBasename}.json`);
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, `${reportBasename}.md`);
  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionJSConfuserPreflightMarkdown(report)}\n`, "utf-8"),
  ]);
  return {
    reportPath,
    reportMDPath,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionJSConfuserPreflightArgs(argv);

  await withBuildLock("package-protection-jsconfuser-preflight.mjs", async () => {
    const configPath = path.join(projectRoot, "config", "addon.config.json");
    const config = await readJSONFile(configPath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-config",
      label: "config/addon.config.json",
    });
    assertNonEmptyString(config?.addonRef, "addon.config.json:addonRef", {
      category: "config",
      failedStage: "validate-config",
      details: {
        configPath,
        field: "addonRef",
      },
    });
    assertNonEmptyString(config?.addonVersion, "addon.config.json:addonVersion", {
      category: "config",
      failedStage: "validate-config",
      details: {
        configPath,
        field: "addonVersion",
      },
    });

    const toolInfo = await ensureJSConfuserToolReady(options.toolPath, options.toolEntry);
    const anchors = buildPackageProtectionAuditAnchors(config);
    const bundlePath = await ensureSourceProxyBundle({
      sourceProxyMode: options.sourceProxyMode,
      config,
      bundlePath: options.bundlePath,
    });
    const profile = resolveJSConfuserPreflightProfile(options, anchors);
    const attempt = await runJSConfuserAttempt({
      toolInfo,
      bundlePath,
      profile,
      anchors,
    });
    const report = summarizePackageProtectionJSConfuserPreflight({
      toolInfo,
      sourceProxyMode: options.sourceProxyMode,
      bundlePath,
      profile,
      attempt,
    });
    const paths = await persistPackageProtectionJSConfuserPreflight(report);
    console.log(`Package protection js-confuser preflight generated: ${paths.reportPath}`);
  });
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
