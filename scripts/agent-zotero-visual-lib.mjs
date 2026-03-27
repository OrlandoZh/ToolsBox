import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";

export const VISUAL_BASELINE_THRESHOLDS = Object.freeze({
  library: Object.freeze({
    changedRatio: 0.35,
    meanChannelDiff: 18,
    pixelDiffTolerance: 2,
  }),
  reader: Object.freeze({
    changedRatio: 0.05,
    meanChannelDiff: 5,
    pixelDiffTolerance: 1,
  }),
});

function execFileText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
        maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const details = stderr?.trim() || stdout?.trim() || error.message;
          reject(new Error(details));
          return;
        }
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
        });
      },
    );
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildMaskInfo(mask) {
  const normalizedMask = (mask >>> 0);
  if (normalizedMask === 0) {
    return null;
  }

  let shift = 0;
  while (shift < 32 && ((normalizedMask >>> shift) & 1) === 0) {
    shift += 1;
  }

  let width = 0;
  while ((shift + width) < 32 && ((normalizedMask >>> (shift + width)) & 1) === 1) {
    width += 1;
  }

  return {
    mask: normalizedMask,
    shift,
    maxValue: (2 ** width) - 1,
  };
}

function extractMaskedChannel(value, maskInfo, fallback = 255) {
  if (!maskInfo) {
    return fallback;
  }
  const raw = ((value & maskInfo.mask) >>> maskInfo.shift);
  if (maskInfo.maxValue <= 0 || maskInfo.maxValue === 255) {
    return raw;
  }
  return Math.round((raw * 255) / maskInfo.maxValue);
}

export function getVisualBaselineFilename({ bootMode, kind }) {
  assert(bootMode, "bootMode is required for visual baseline filename");
  assert(kind, "kind is required for visual baseline filename");
  return `${bootMode}-${kind}.png`;
}

export function getVisualBaselineThreshold(kind) {
  return VISUAL_BASELINE_THRESHOLDS[kind] || VISUAL_BASELINE_THRESHOLDS.library;
}

export function pickVisualCanonicalCoverageKindLabel(kind) {
  switch (String(kind || "").trim()) {
    case "complete":
      return "canonical 基线覆盖完整";
    case "partial":
      return "canonical 基线覆盖部分";
    case "none":
      return "canonical 基线未覆盖";
    default:
      return "canonical 基线覆盖待补证";
  }
}

export async function readPNGAnalysis(filePath) {
  const buffer = await fs.readFile(filePath);
  if (buffer.length < 24) {
    throw new Error(`PNG too small: ${filePath}`);
  }

  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`Unsupported image format: ${filePath}`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    width,
    height,
    sizeBytes: buffer.length,
    sha256: hash,
  };
}

export function parseBMP(buffer) {
  assert(buffer.length >= 54, "BMP file too small");
  assert(buffer.subarray(0, 2).toString("ascii") === "BM", "Unsupported BMP signature");

  const pixelOffset = buffer.readUInt32LE(10);
  const dibSize = buffer.readUInt32LE(14);
  assert(dibSize >= 40, `Unsupported BMP DIB header size: ${dibSize}`);

  const width = buffer.readInt32LE(18);
  const heightRaw = buffer.readInt32LE(22);
  const planes = buffer.readUInt16LE(26);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  const topDown = heightRaw < 0;
  const height = Math.abs(heightRaw);

  assert(planes === 1, `Unsupported BMP planes value: ${planes}`);
  assert(width > 0 && height > 0, `Unsupported BMP dimensions: ${width}x${height}`);

  const rowStride = Math.floor(((bitsPerPixel * width) + 31) / 32) * 4;
  const requiredLength = pixelOffset + (rowStride * height);
  assert(buffer.length >= requiredLength, "BMP pixel data is truncated");

  const rgba = new Uint8Array(width * height * 4);

  if (bitsPerPixel === 24) {
    assert(compression === 0, `Unsupported 24-bit BMP compression: ${compression}`);

    for (let y = 0; y < height; y += 1) {
      const sourceY = topDown ? y : (height - 1 - y);
      const rowStart = pixelOffset + (sourceY * rowStride);
      for (let x = 0; x < width; x += 1) {
        const sourceOffset = rowStart + (x * 3);
        const targetOffset = ((y * width) + x) * 4;
        rgba[targetOffset] = buffer[sourceOffset + 2];
        rgba[targetOffset + 1] = buffer[sourceOffset + 1];
        rgba[targetOffset + 2] = buffer[sourceOffset];
        rgba[targetOffset + 3] = 255;
      }
    }
  } else if (bitsPerPixel === 32) {
    assert(
      compression === 0 || compression === 3 || compression === 6,
      `Unsupported 32-bit BMP compression: ${compression}`,
    );

    let redMask = 0x00FF0000;
    let greenMask = 0x0000FF00;
    let blueMask = 0x000000FF;
    let alphaMask = 0xFF000000;

    if ((compression === 3 || compression === 6) && dibSize >= 56) {
      const maskOffset = 14 + 40;
      redMask = buffer.readUInt32LE(maskOffset);
      greenMask = buffer.readUInt32LE(maskOffset + 4);
      blueMask = buffer.readUInt32LE(maskOffset + 8);
      alphaMask = dibSize >= 56 ? buffer.readUInt32LE(maskOffset + 12) : 0xFF000000;
    }

    const redInfo = buildMaskInfo(redMask);
    const greenInfo = buildMaskInfo(greenMask);
    const blueInfo = buildMaskInfo(blueMask);
    const alphaInfo = buildMaskInfo(alphaMask);

    for (let y = 0; y < height; y += 1) {
      const sourceY = topDown ? y : (height - 1 - y);
      const rowStart = pixelOffset + (sourceY * rowStride);
      for (let x = 0; x < width; x += 1) {
        const sourceOffset = rowStart + (x * 4);
        const pixelValue = buffer.readUInt32LE(sourceOffset);
        const targetOffset = ((y * width) + x) * 4;
        rgba[targetOffset] = extractMaskedChannel(pixelValue, redInfo, 0);
        rgba[targetOffset + 1] = extractMaskedChannel(pixelValue, greenInfo, 0);
        rgba[targetOffset + 2] = extractMaskedChannel(pixelValue, blueInfo, 0);
        rgba[targetOffset + 3] = extractMaskedChannel(pixelValue, alphaInfo, 255);
      }
    }
  } else {
    throw new Error(`Unsupported BMP bit depth: ${bitsPerPixel}`);
  }

  return {
    width,
    height,
    bitsPerPixel,
    compression,
    topDown,
    data: rgba,
  };
}

export function compareBitmapImages(actualImage, baselineImage, options = {}) {
  const actualWidth = Number(actualImage?.width || 0);
  const actualHeight = Number(actualImage?.height || 0);
  const baselineWidth = Number(baselineImage?.width || 0);
  const baselineHeight = Number(baselineImage?.height || 0);
  const sameDimensions = actualWidth === baselineWidth && actualHeight === baselineHeight;
  const pixelDiffTolerance = Number.isFinite(Number(options?.pixelDiffTolerance))
    ? Math.max(0, Number(options.pixelDiffTolerance))
    : 0;

  if (!sameDimensions) {
    return {
      sameDimensions: false,
      actualWidth,
      actualHeight,
      baselineWidth,
      baselineHeight,
      comparedPixels: 0,
      changedPixels: 0,
      changedRatio: 1,
      meanChannelDiff: 255,
    };
  }

  const pixelCount = actualWidth * actualHeight;
  let changedPixels = 0;
  let totalChannelDiff = 0;

  for (let offset = 0; offset < actualImage.data.length; offset += 4) {
    const redDiff = Math.abs(actualImage.data[offset] - baselineImage.data[offset]);
    const greenDiff = Math.abs(actualImage.data[offset + 1] - baselineImage.data[offset + 1]);
    const blueDiff = Math.abs(actualImage.data[offset + 2] - baselineImage.data[offset + 2]);
    totalChannelDiff += redDiff + greenDiff + blueDiff;
    if (Math.max(redDiff, greenDiff, blueDiff) > pixelDiffTolerance) {
      changedPixels += 1;
    }
  }

  return {
    sameDimensions: true,
    actualWidth,
    actualHeight,
    baselineWidth,
    baselineHeight,
    comparedPixels: pixelCount,
    changedPixels,
    changedRatio: pixelCount > 0 ? changedPixels / pixelCount : 0,
    meanChannelDiff: pixelCount > 0 ? totalChannelDiff / (pixelCount * 3) : 0,
  };
}

async function convertImageToBMP(sourcePath, outputPath) {
  if (process.platform !== "darwin") {
    throw new Error("Visual baseline diff currently requires macOS sips");
  }
  await execFileText("sips", ["-s", "format", "bmp", sourcePath, "--out", outputPath]);
}

export async function comparePNGImagesWithSips({
  actualPath,
  baselinePath,
  tempRoot = os.tmpdir(),
  pixelDiffTolerance = 0,
}) {
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "cleanroom-agent-visual-"));
  const actualBMPPath = path.join(tempDir, "actual.bmp");
  const baselineBMPPath = path.join(tempDir, "baseline.bmp");

  try {
    await convertImageToBMP(actualPath, actualBMPPath);
    await convertImageToBMP(baselinePath, baselineBMPPath);

    const [actualBuffer, baselineBuffer] = await Promise.all([
      fs.readFile(actualBMPPath),
      fs.readFile(baselineBMPPath),
    ]);

    return compareBitmapImages(
      parseBMP(actualBuffer),
      parseBMP(baselineBuffer),
      {
        pixelDiffTolerance,
      },
    );
  }
  finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function evaluateVisualBaselineComparison({ kind, metrics, thresholds = getVisualBaselineThreshold(kind) }) {
  const issues = [];

  if (!metrics?.sameDimensions) {
    issues.push(
      `${kind} 截图与基线尺寸不一致：当前 ${metrics?.actualWidth || 0}x${metrics?.actualHeight || 0}，基线 ${metrics?.baselineWidth || 0}x${metrics?.baselineHeight || 0}`,
    );
  }

  if (Number(metrics?.changedRatio || 0) > Number(thresholds.changedRatio || 0)) {
    issues.push(
      `${kind} 截图与基线像素漂移过大：${(Number(metrics.changedRatio) * 100).toFixed(2)}% > ${(Number(thresholds.changedRatio) * 100).toFixed(2)}%`,
    );
  }

  if (Number(metrics?.meanChannelDiff || 0) > Number(thresholds.meanChannelDiff || 0)) {
    issues.push(
      `${kind} 截图与基线平均通道差异过大：${Number(metrics.meanChannelDiff).toFixed(2)} > ${Number(thresholds.meanChannelDiff).toFixed(2)}`,
    );
  }

  return {
    ok: issues.length === 0,
    issues,
    thresholds,
  };
}

export function summarizeVisualBaselineEntries(entries = []) {
  const summary = {
    total: 0,
    comparedCount: 0,
    missingCount: 0,
    createdCount: 0,
    updatedCount: 0,
    driftCount: 0,
    errorCount: 0,
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    summary.total += 1;

    if (entry?.status === "compared") {
      summary.comparedCount += 1;
      if (entry.ok === false) {
        summary.driftCount += 1;
      }
      continue;
    }

    if (entry?.status === "missing") {
      summary.missingCount += 1;
      continue;
    }

    if (entry?.status === "created") {
      summary.createdCount += 1;
      continue;
    }

    if (entry?.status === "updated") {
      summary.updatedCount += 1;
      continue;
    }

    if (entry?.status === "error") {
      summary.errorCount += 1;
    }
  }

  return summary;
}

export function summarizeVisualCanonicalCoverage(entries = [], expectedTargets = []) {
  const normalizedExpectedTargets = Array.from(new Set(
    (Array.isArray(expectedTargets) ? expectedTargets : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
  const entryMap = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const canonicalTarget = String(entry?.canonicalTarget || entry?.target || "").trim();
    if (!canonicalTarget) {
      continue;
    }
    entryMap.set(canonicalTarget, {
      canonicalTarget,
      geometryMatched: typeof entry?.geometryMatched === "boolean"
        ? entry.geometryMatched
        : null,
    });
  }

  const expectedEntries = normalizedExpectedTargets.map((canonicalTarget) => {
    const matched = entryMap.get(canonicalTarget);
    return {
      canonicalTarget,
      geometryMatched: matched?.geometryMatched ?? null,
    };
  });

  const matchedTargets = expectedEntries
    .filter((entry) => entry.geometryMatched === true)
    .map((entry) => entry.canonicalTarget);
  const mismatchedTargets = expectedEntries
    .filter((entry) => entry.geometryMatched === false)
    .map((entry) => entry.canonicalTarget);
  const unresolvedTargets = expectedEntries
    .filter((entry) => entry.geometryMatched !== true && entry.geometryMatched !== false)
    .map((entry) => entry.canonicalTarget);

  let visualCanonicalCoverageKind = "unknown";
  if (normalizedExpectedTargets.length > 0 && unresolvedTargets.length === 0) {
    if (matchedTargets.length === normalizedExpectedTargets.length) {
      visualCanonicalCoverageKind = "complete";
    } else if (mismatchedTargets.length === normalizedExpectedTargets.length) {
      visualCanonicalCoverageKind = "none";
    } else if (matchedTargets.length > 0 && mismatchedTargets.length > 0) {
      visualCanonicalCoverageKind = "partial";
    }
  }

  const visualCanonicalCoverageKindLabel = pickVisualCanonicalCoverageKindLabel(
    visualCanonicalCoverageKind,
  );
  let visualCanonicalCoverageSummary = `${visualCanonicalCoverageKindLabel}（期望 ${normalizedExpectedTargets.length} 项）`;
  if (visualCanonicalCoverageKind === "complete") {
    visualCanonicalCoverageSummary = `${visualCanonicalCoverageKindLabel}：${matchedTargets.length}/${normalizedExpectedTargets.length} 已对齐`;
  } else if (visualCanonicalCoverageKind === "partial") {
    visualCanonicalCoverageSummary = `${visualCanonicalCoverageKindLabel}：已对齐 ${matchedTargets.length}/${normalizedExpectedTargets.length}；仍不匹配 ${mismatchedTargets.join("、")}`;
  } else if (visualCanonicalCoverageKind === "none") {
    visualCanonicalCoverageSummary = `${visualCanonicalCoverageKindLabel}：${normalizedExpectedTargets.length}/${normalizedExpectedTargets.length} 仍不匹配（${mismatchedTargets.join("、")}）`;
  } else if (unresolvedTargets.length > 0) {
    visualCanonicalCoverageSummary = `${visualCanonicalCoverageKindLabel}：缺少可靠几何证据（${unresolvedTargets.join("、")}）`;
  }

  return {
    visualCanonicalCoverageKind,
    visualCanonicalCoverageKindLabel,
    visualCanonicalExpectedTargets: normalizedExpectedTargets,
    visualCanonicalMismatchedTargets: mismatchedTargets,
    visualCanonicalCoverageSummary,
  };
}
