import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildScriptFailureInfo,
  isExecutedAsScript,
} from "./script-runtime-lib.mjs";
import {
  buildBalancedPdfCorpusSelection,
  loadPdfCorpusManifest,
  writePdfCorpusSelectionArtifacts,
} from "./pdf-test-corpus-curation-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function printUsage() {
  console.log(`Usage: node scripts/pdf-test-corpus-curate.mjs --manifest <manifest.json> [options]

Options:
  --manifest <path>         Source PDF corpus manifest (required)
  --output <path>           Output base path (default: dist/pdf-test-corpus-curated.balanced.json)
  --project-root <path>     Override project root for default output resolution
  --help                    Show this message
`);
}

function parseArgs(argv) {
  const options = {
    manifestPath: null,
    outputPath: null,
    projectRoot: defaultProjectRoot,
    help: false,
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
    if (arg === "--manifest") {
      options.manifestPath = path.resolve(String(argv[index + 1] || "").trim());
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
  if (!options.manifestPath) {
    printUsage();
    throw new Error("Missing required option: --manifest");
  }

  const manifest = await loadPdfCorpusManifest(options.manifestPath);
  const selection = buildBalancedPdfCorpusSelection(manifest, {
    sourceManifestPath: options.manifestPath,
  });
  const outputBasePath = options.outputPath
    || path.join(options.projectRoot, "dist", "pdf-test-corpus-curated.balanced.json");
  const artifacts = await writePdfCorpusSelectionArtifacts(outputBasePath, selection);

  console.log(`PDF curated selection written: ${artifacts.jsonPath}`);
  console.log(`- markdown: ${artifacts.markdownPath}`);
  console.log(`- selected entries: ${selection.summary.selectedEntryCount}`);
  console.log(`- selected families: ${selection.summary.selectedFamilyCount}`);
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`[pdf-test-corpus-curate] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}

