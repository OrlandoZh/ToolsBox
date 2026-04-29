import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildScriptFailureInfo,
  isExecutedAsScript,
} from "./script-runtime-lib.mjs";
import {
  scanPdfTestCorpus,
  writePdfTestCorpusManifest,
} from "./pdf-test-corpus-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function printUsage() {
  console.log(`Usage: node scripts/pdf-test-corpus.mjs --root <pdf-dir> [options]

Options:
  --root <path>              PDF corpus root directory (required)
  --output <path>            Output manifest path (default: dist/pdf-test-corpus-manifest.json)
  --project-root <path>      Override project root for default output resolution
  --enrich-online            Query Crossref for missing metadata
  --crossref-mailto <email>  Mailto identifier for Crossref polite pool
  --request-timeout-ms <n>   Per-request timeout for online metadata lookup (default: 5000)
  --skip-sha256              Skip SHA-256 hashing
  --help                     Show this message
`);
}

function parseArgs(argv) {
  const options = {
    projectRoot: defaultProjectRoot,
    rootDir: null,
    outputPath: null,
    enrichOnline: false,
    crossrefMailto: null,
    includeSha256: true,
    help: false,
    requestTimeoutMs: 5000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "").trim();
    if (!arg) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
    if (arg === "--output") {
      options.outputPath = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
    if (arg === "--project-root") {
      options.projectRoot = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
    if (arg === "--enrich-online") {
      options.enrichOnline = true;
      continue;
    }
    if (arg === "--crossref-mailto") {
      options.crossrefMailto = String(argv[index + 1] || "").trim() || null;
      index += 1;
      continue;
    }
    if (arg === "--skip-sha256") {
      options.includeSha256 = false;
      continue;
    }
    if (arg === "--request-timeout-ms") {
      options.requestTimeoutMs = Number.parseInt(String(argv[index + 1] || "").trim(), 10);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.rootDir) {
    printUsage();
    throw new Error("Missing required option: --root");
  }

  const outputPath = options.outputPath
    || path.join(options.projectRoot, "dist", "pdf-test-corpus-manifest.json");

  const report = await scanPdfTestCorpus({
    rootDir: options.rootDir,
    enrichOnline: options.enrichOnline,
    crossrefMailto: options.crossrefMailto,
    includeSha256: options.includeSha256,
    requestTimeoutMs: options.requestTimeoutMs,
  });
  const writtenPath = await writePdfTestCorpusManifest(outputPath, report);

  console.log(`PDF corpus manifest written: ${writtenPath}`);
  console.log(`- entries: ${report.summary.totalEntries}`);
  console.log(`- duplicate families: ${report.summary.duplicateFamilyCount}`);
  console.log(`- title coverage: ${report.summary.titleCount}/${report.summary.totalEntries}`);
  console.log(`- author coverage: ${report.summary.authorCount}/${report.summary.totalEntries}`);
  console.log(`- online matches: ${report.summary.onlineMatchedCount}/${report.summary.totalEntries}`);
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`[pdf-test-corpus] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
