import { createReadStream, promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  READER_SOURCE_HARNESS,
  WEB_LIBRARY_UI_HARNESS,
} from "../dev/zotero-surface-wind-tunnel/wind-tunnel-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const windTunnelRoot = path.join(projectRoot, "dev", "zotero-surface-wind-tunnel");
const zoteroPdfJsRequiredAssets = Object.freeze(["web/viewer.html", "build/pdf.mjs"]);
const readerSourceRequiredAnchors = READER_SOURCE_HARNESS.requiredAnchors;
const webLibraryRequiredAnchors = WEB_LIBRARY_UI_HARNESS.requiredAnchors;
const webLibraryFixtureFiles = Object.freeze({
  library: "test/fixtures/state/desktop-test-user-library-view.json",
  reader: "test/fixtures/state/desktop-test-user-reader-view.json",
});

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
});

function normalizePathList(value) {
  return String(value || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function parseArgs(argv) {
  const options = {
    host: "127.0.0.1",
    port: 4178,
    pdfJsRoots: normalizePathList(process.env.ZOTERO_PDFJS_ROOT),
    readerSourceRoots: normalizePathList(process.env.ZOTERO_READER_SOURCE_ROOT),
    webLibraryRoots: normalizePathList(process.env.ZOTERO_WEB_LIBRARY_ROOT),
    samplePDFPath: String(process.env.ZOTERO_WIND_TUNNEL_SAMPLE_PDF || "").trim()
      ? path.resolve(String(process.env.ZOTERO_WIND_TUNNEL_SAMPLE_PDF).trim())
      : null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--host") {
      options.host = String(argv[index + 1] || "").trim() || options.host;
      index += 1;
      continue;
    }
    if (token === "--port") {
      const port = Number(argv[index + 1]);
      if (!Number.isInteger(port) || port <= 0) {
        throw new Error("--port requires a positive integer");
      }
      options.port = port;
      index += 1;
      continue;
    }
    if (token === "--zotero-pdfjs-root") {
      const root = String(argv[index + 1] || "").trim();
      if (!root) {
        throw new Error("--zotero-pdfjs-root requires a path");
      }
      options.pdfJsRoots.push(path.resolve(root));
      index += 1;
      continue;
    }
    if (token === "--zotero-reader-source-root") {
      const root = String(argv[index + 1] || "").trim();
      if (!root) {
        throw new Error("--zotero-reader-source-root requires a path");
      }
      options.readerSourceRoots.push(path.resolve(root));
      index += 1;
      continue;
    }
    if (token === "--zotero-web-library-root") {
      const root = String(argv[index + 1] || "").trim();
      if (!root) {
        throw new Error("--zotero-web-library-root requires a path");
      }
      options.webLibraryRoots.push(path.resolve(root));
      index += 1;
      continue;
    }
    if (token === "--sample-pdf") {
      const filePath = String(argv[index + 1] || "").trim();
      if (!filePath) {
        throw new Error("--sample-pdf requires a path");
      }
      options.samplePDFPath = path.resolve(filePath);
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return options;
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/zotero-surface-wind-tunnel-server.mjs [--host 127.0.0.1] [--port 4178]",
      "       [--zotero-pdfjs-root /absolute/path/to/zotero-reader-pdf]",
      "       [--zotero-reader-source-root /absolute/path/to/extracted/zotero-app-root]",
      "       [--zotero-web-library-root /absolute/path/to/web-library]",
      "       [--sample-pdf /absolute/path/to/real-sample.pdf]",
      "",
      "You can also set ZOTERO_PDFJS_ROOT to one or more roots separated by the platform path delimiter.",
      "You can also set ZOTERO_READER_SOURCE_ROOT to one or more roots separated by the platform path delimiter.",
      "You can also set ZOTERO_WEB_LIBRARY_ROOT to one or more roots separated by the platform path delimiter.",
      "You can also set ZOTERO_WIND_TUNNEL_SAMPLE_PDF to a single local PDF path.",
    ].join("\n"),
  );
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(text);
}

function sendJSON(response, statusCode, payload) {
  sendText(response, statusCode, `${JSON.stringify(payload, null, 2)}\n`, "application/json; charset=utf-8");
}

function createSamplePDFBuffer() {
  const stream = "BT /F1 18 Tf 72 720 Td (Zotero PDF.js Wind Tunnel) Tj 0 -32 Td /F1 12 Tf (Text layer and overlay anchor sample.) Tj 0 -24 Td (Column A   Column B   annotation target) Tj ET";
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj\n`,
  ];
  const chunks = [];
  chunks.push("%PDF-1.4\n");
  let offset = Buffer.byteLength(chunks[0]);
  const offsets = [];
  objects.forEach((object) => {
    offsets.push(offset);
    chunks.push(object);
    offset += Buffer.byteLength(object);
  });
  const xrefOffset = offset;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  offsets.forEach((entryOffset) => {
    chunks.push(`${String(entryOffset).padStart(10, "0")} 00000 n \n`);
  });
  chunks.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`);
  chunks.push("startxref\n");
  chunks.push(`${xrefOffset}\n`);
  chunks.push("%%EOF\n");
  return Buffer.from(chunks.join(""), "utf-8");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getConfiguredSamplePDF(options) {
  if (!options.samplePDFPath) {
    return null;
  }
  let stat = null;
  try {
    stat = await fs.stat(options.samplePDFPath);
  } catch {
    return null;
  }
  if (!stat.isFile() || path.extname(options.samplePDFPath).toLowerCase() !== ".pdf") {
    return null;
  }
  return {
    path: options.samplePDFPath,
    name: path.basename(options.samplePDFPath),
    size: stat.size,
  };
}

async function findZoteroPdfJsRoot(candidates = []) {
  for (const candidate of candidates) {
    const assetStates = await Promise.all(
      zoteroPdfJsRequiredAssets.map(async (asset) => ({
        asset,
        exists: await pathExists(path.join(candidate, asset)),
      })),
    );
    if (assetStates.every((entry) => entry.exists)) {
      return { root: candidate, requiredAssets: assetStates };
    }
  }
  const firstCandidate = candidates[0] || null;
  return {
    root: null,
    requiredAssets: firstCandidate
      ? await Promise.all(
        zoteroPdfJsRequiredAssets.map(async (asset) => ({
          asset,
          exists: await pathExists(path.join(firstCandidate, asset)),
        })),
      )
      : zoteroPdfJsRequiredAssets.map((asset) => ({ asset, exists: false })),
  };
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((entry) => path.resolve(entry)))];
}

function inferReaderSourceRootsFromPdfJsRoots(pdfJsRoots = []) {
  const candidates = [];
  for (const root of pdfJsRoots) {
    let cursor = path.resolve(root);
    for (let depth = 0; depth < 8; depth += 1) {
      candidates.push(cursor);
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        break;
      }
      cursor = parent;
    }
  }
  return uniquePaths(candidates);
}

function getReaderSourceRootCandidates(options) {
  return uniquePaths([
    ...options.readerSourceRoots,
    ...inferReaderSourceRootsFromPdfJsRoots(options.pdfJsRoots),
  ]);
}

async function inspectReaderSourceAnchor(root, anchor) {
  const filePath = path.join(root, anchor.file);
  const exists = await pathExists(filePath);
  if (!exists) {
    return {
      id: anchor.id,
      file: anchor.file,
      exists: false,
      signals: anchor.signals.map((signal) => ({ signal, exists: false })),
    };
  }
  let source = "";
  try {
    source = await fs.readFile(filePath, "utf-8");
  } catch {
    source = "";
  }
  return {
    id: anchor.id,
    file: anchor.file,
    exists: true,
    signals: anchor.signals.map((signal) => ({
      signal,
      exists: source.includes(signal),
    })),
  };
}

function readerSourceAnchorPassed(anchorState) {
  return Boolean(anchorState.exists && anchorState.signals.every((signal) => signal.exists));
}

async function inspectReaderSourceRoot(root) {
  const anchors = await Promise.all(
    readerSourceRequiredAnchors.map((anchor) => inspectReaderSourceAnchor(root, anchor)),
  );
  return {
    root,
    anchors,
    available: anchors.every(readerSourceAnchorPassed),
  };
}

async function findZoteroReaderSourceRoot(options) {
  const candidates = getReaderSourceRootCandidates(options);
  const inspected = [];
  for (const candidate of candidates) {
    const state = await inspectReaderSourceRoot(candidate);
    inspected.push(state);
    if (state.available) {
      return {
        root: candidate,
        candidates,
        inspected,
        anchors: state.anchors,
      };
    }
  }
  return {
    root: null,
    candidates,
    inspected,
    anchors: inspected[0]?.anchors || readerSourceRequiredAnchors.map((anchor) => ({
      id: anchor.id,
      file: anchor.file,
      exists: false,
      signals: anchor.signals.map((signal) => ({ signal, exists: false })),
    })),
  };
}

async function inspectWebLibraryAnchor(root, anchor) {
  const filePath = path.join(root, anchor.file);
  const exists = await pathExists(filePath);
  if (!exists) {
    return {
      id: anchor.id,
      file: anchor.file,
      exists: false,
      signals: anchor.signals.map((signal) => ({ signal, exists: false })),
    };
  }
  let source = "";
  try {
    source = await fs.readFile(filePath, "utf-8");
  } catch {
    source = "";
  }
  return {
    id: anchor.id,
    file: anchor.file,
    exists: true,
    signals: anchor.signals.map((signal) => ({
      signal,
      exists: source.includes(signal),
    })),
  };
}

function webLibraryAnchorPassed(anchorState) {
  return Boolean(anchorState.exists && anchorState.signals.every((signal) => signal.exists));
}

async function inspectWebLibraryRoot(root) {
  const packageJSON = path.join(root, "package.json");
  const packagePresent = await pathExists(packageJSON);
  const anchors = await Promise.all(webLibraryRequiredAnchors.map((anchor) => inspectWebLibraryAnchor(root, anchor)));
  return {
    root,
    packagePresent,
    anchors,
    available: packagePresent && anchors.every(webLibraryAnchorPassed),
  };
}

function asDisplayText(value, fallback = "") {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
  return text.replace(/\s+/gu, " ").trim().slice(0, 240);
}

function getDerivedField(record, field, fallback = "") {
  return asDisplayText(record?.["@@derived@@"]?.[field] ?? record?.[field], fallback);
}

function getFixtureLibrary(fixture) {
  const libraryKey = fixture?.config?.defaultLibraryKey || fixture?.current?.libraryKey;
  if (libraryKey && fixture?.libraries?.[libraryKey]) {
    return {
      key: libraryKey,
      bucket: fixture.libraries[libraryKey],
    };
  }
  const firstKey = Object.keys(fixture?.libraries || {})[0] || null;
  return {
    key: firstKey,
    bucket: firstKey ? fixture.libraries[firstKey] : null,
  };
}

function extractFixtureCollections(fixture, limit = 12) {
  const { bucket } = getFixtureLibrary(fixture);
  const dataObjects = bucket?.dataObjects || {};
  const orderedKeys = Array.isArray(bucket?.collections?.keys) ? bucket.collections.keys : Object.keys(dataObjects);
  const itemRecords = Object.values(dataObjects).filter((record) => record?.["@@type@@"] === "item");
  return orderedKeys
    .map((key) => dataObjects[key])
    .filter((record) => record?.["@@type@@"] === "collection" && !record.deleted)
    .slice(0, limit)
    .map((record) => {
      const itemCount = itemRecords.filter((item) => Array.isArray(item.collections) && item.collections.includes(record.key)).length;
      return {
        key: asDisplayText(record.key),
        title: getDerivedField(record, "title", asDisplayText(record.name, "Collection")),
        parentCollection: record.parentCollection ? asDisplayText(record.parentCollection) : null,
        itemCount,
      };
    });
}

function extractFixtureItems(fixture, limit = 80) {
  const { bucket } = getFixtureLibrary(fixture);
  const dataObjects = bucket?.dataObjects || {};
  const topKeys = Array.isArray(bucket?.itemsTop?.keys) ? bucket.itemsTop.keys : Object.keys(dataObjects);
  const seen = new Set();
  const orderedRecords = [
    ...topKeys.map((key) => dataObjects[key]),
    ...Object.values(dataObjects),
  ].filter((record) => {
    if (!record || seen.has(record.key)) {
      return false;
    }
    seen.add(record.key);
    return record?.["@@type@@"] === "item" && record.itemType !== "attachment" && record.itemType !== "annotation";
  });
  return orderedRecords.slice(0, limit).map((record) => ({
    key: asDisplayText(record.key),
    itemType: asDisplayText(record.itemType, "journalArticle"),
    title: getDerivedField(record, "title", asDisplayText(record.title, "Untitled")),
    creator: getDerivedField(record, "creator"),
    year: getDerivedField(record, "year"),
    iconName: getDerivedField(record, "iconName", "journal-article"),
    collectionKeys: Array.isArray(record.collections) ? record.collections.map((key) => asDisplayText(key)).filter(Boolean) : [],
  }));
}

function extractReaderFixture(fixture) {
  const { bucket } = getFixtureLibrary(fixture);
  const dataObjects = bucket?.dataObjects || {};
  const attachmentKey = fixture?.current?.attachmentKey || fixture?.current?.itemKey || null;
  const attachment = attachmentKey ? dataObjects[attachmentKey] : null;
  const annotations = Object.values(dataObjects)
    .filter((record) => record?.itemType === "annotation")
    .slice(0, 12)
    .map((record) => ({
      key: asDisplayText(record.key),
      annotationType: asDisplayText(record.annotationType, "annotation"),
      color: asDisplayText(record.annotationColor),
      pageLabel: asDisplayText(record.annotationPageLabel),
      text: asDisplayText(record.annotationText || record.annotationComment),
      positionKind: record.annotationPosition?.includes("\"paths\"") ? "paths" : "rects",
    }));
  return {
    attachmentKey: attachmentKey ? asDisplayText(attachmentKey) : null,
    attachmentTitle: getDerivedField(attachment, "title", asDisplayText(attachment?.title, "PDF attachment")),
    attachmentIconName: getDerivedField(attachment, "iconName", "attachment-pdf"),
    annotationCount: annotations.length,
    annotations,
  };
}

async function readJSONFile(filePath) {
  const source = await fs.readFile(filePath, "utf-8");
  return JSON.parse(source);
}

async function buildWebLibraryFixture(root) {
  const libraryPath = path.join(root, webLibraryFixtureFiles.library);
  const readerPath = path.join(root, webLibraryFixtureFiles.reader);
  const [libraryFixture, readerFixture] = await Promise.all([
    readJSONFile(libraryPath),
    readJSONFile(readerPath),
  ]);
  return {
    schemaVersion: 1,
    fixtureMode: "zotero-web-library-fixture",
    sourceFiles: Object.values(webLibraryFixtureFiles),
    redactionPolicy: "Only display-safe collection, item, attachment, and annotation fields are exposed; API keys, request options, links, and file URLs are omitted.",
    collections: extractFixtureCollections(libraryFixture),
    items: extractFixtureItems(libraryFixture),
    reader: extractReaderFixture(readerFixture),
  };
}

async function findWebLibraryRoot(candidates = []) {
  const inspected = [];
  for (const candidate of candidates) {
    const state = await inspectWebLibraryRoot(candidate);
    inspected.push(state);
    if (state.available) {
      return {
        root: candidate,
        inspected,
        anchors: state.anchors,
      };
    }
  }
  return {
    root: null,
    inspected,
    anchors: inspected[0]?.anchors || webLibraryRequiredAnchors.map((anchor) => ({
      id: anchor.id,
      file: anchor.file,
      exists: false,
      signals: anchor.signals.map((signal) => ({ signal, exists: false })),
    })),
  };
}

async function sendZoteroPdfJsManifest(response, options) {
  const resolved = await findZoteroPdfJsRoot(options.pdfJsRoots);
  const available = Boolean(resolved.root);
  const samplePDF = await getConfiguredSamplePDF(options);
  sendJSON(response, 200, {
    schemaVersion: 1,
    adapterMode: available ? "zotero-pdfjs" : "contract-fallback",
    available,
    root: resolved.root,
    rootCandidates: options.pdfJsRoots,
    requiredAssets: resolved.requiredAssets,
    viewerURL: "/zotero-pdfjs/web/viewer.html",
    samplePDFURL: "/zotero-pdfjs/sample.pdf",
    samplePDFMode: samplePDF ? "configured-file" : "synthetic-fixture",
    samplePDFLabel: samplePDF?.name || "synthetic-zotero-pdfjs-wind-tunnel.pdf",
    samplePDFBytes: samplePDF?.size || createSamplePDFBuffer().length,
    details: available
      ? "Serving the configured Zotero Reader PDF.js build for the wind tunnel document-analysis harness."
      : "No configured Zotero Reader PDF.js root with the required viewer assets was found; the wind tunnel is using its explicit contract fallback.",
  });
}

async function sendZoteroReaderManifest(response, options) {
  const resolved = await findZoteroReaderSourceRoot(options);
  const available = Boolean(resolved.root);
  sendJSON(response, 200, {
    schemaVersion: 1,
    adapterMode: available ? "zotero-reader-source" : READER_SOURCE_HARNESS.fallbackMode,
    available,
    root: resolved.root,
    rootCandidates: resolved.candidates,
    requiredAnchors: resolved.anchors,
    adaptationPolicy: READER_SOURCE_HARNESS.adaptationPolicy,
    details: available
      ? "Serving source-anchor evidence from the configured Zotero Reader tree; the browser app still uses a source-derived adapter around real PDF.js rendering."
      : "No configured Zotero Reader source tree with the required anchors was found; Reader chrome remains an explicit browser contract fallback.",
  });
}

async function sendWebLibraryManifest(response, options) {
  const resolved = await findWebLibraryRoot(options.webLibraryRoots);
  const available = Boolean(resolved.root);
  sendJSON(response, 200, {
    schemaVersion: 1,
    adapterMode: available ? "zotero-web-library" : WEB_LIBRARY_UI_HARNESS.fallbackMode,
    available,
    root: resolved.root,
    rootCandidates: options.webLibraryRoots,
    requiredAnchors: resolved.anchors,
    iconBaseURL: WEB_LIBRARY_UI_HARNESS.iconBaseURL,
    adaptationPolicy: WEB_LIBRARY_UI_HARNESS.adaptationPolicy,
    details: available
      ? "Serving selected static Zotero Web Library assets and using its component anchors as browser UI fidelity evidence."
      : "No configured Zotero Web Library root with the required anchors was found; the wind tunnel is using its browser contract fallback.",
  });
}

async function sendWebLibraryFixture(response, options) {
  const resolved = await findWebLibraryRoot(options.webLibraryRoots);
  if (!resolved.root) {
    sendJSON(response, 200, {
      schemaVersion: 1,
      fixtureMode: "contract-fallback",
      available: false,
      root: null,
      collections: [],
      items: [],
      reader: null,
      details: "No configured Zotero Web Library root is available; fixture sampling is disabled.",
    });
    return;
  }
  try {
    const fixture = await buildWebLibraryFixture(resolved.root);
    sendJSON(response, 200, {
      ...fixture,
      available: true,
      root: resolved.root,
      details: "Serving a redacted display-field sample from Zotero Web Library fixtures.",
    });
  } catch (error) {
    sendJSON(response, 200, {
      schemaVersion: 1,
      fixtureMode: "fixture-unavailable",
      available: false,
      root: resolved.root,
      collections: [],
      items: [],
      reader: null,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleZoteroPdfJsRequest(request, response, pathname, options) {
  if (pathname === "/zotero-pdfjs/manifest.json") {
    await sendZoteroPdfJsManifest(response, options);
    return true;
  }
  if (pathname === "/zotero-pdfjs/sample.pdf") {
    const samplePDF = await getConfiguredSamplePDF(options);
    if (samplePDF) {
      response.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": samplePDF.size,
        "cache-control": "no-store",
      });
      if (request.method === "HEAD") {
        response.end();
        return true;
      }
      createReadStream(samplePDF.path).pipe(response);
      return true;
    }
    const pdf = createSamplePDFBuffer();
    response.writeHead(200, {
      "content-type": "application/pdf",
      "content-length": pdf.length,
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") {
      response.end();
      return true;
    }
    response.end(pdf);
    return true;
  }
  if (!pathname.startsWith("/zotero-pdfjs/")) {
    return false;
  }
  const resolved = await findZoteroPdfJsRoot(options.pdfJsRoots);
  if (!resolved.root) {
    sendText(response, 404, "Zotero PDF.js build not found");
    return true;
  }
  const relativePath = pathname.replace(/^\/zotero-pdfjs\/+/, "");
  const absolutePath = path.resolve(resolved.root, relativePath);
  if (!absolutePath.startsWith(`${resolved.root}${path.sep}`) && absolutePath !== resolved.root) {
    sendText(response, 403, "Forbidden");
    return true;
  }
  let stat = null;
  try {
    stat = await fs.stat(absolutePath);
  } catch {
    sendText(response, 404, "Not Found");
    return true;
  }
  if (!stat.isFile()) {
    sendText(response, 404, "Not Found");
    return true;
  }
  const contentType = MIME_TYPES[path.extname(absolutePath)] || "application/octet-stream";
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": stat.size,
    "cache-control": "no-store",
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  createReadStream(absolutePath).pipe(response);
  return true;
}

async function handleZoteroReaderRequest(request, response, pathname, options) {
  if (pathname === "/zotero-reader/manifest.json") {
    await sendZoteroReaderManifest(response, options);
    return true;
  }
  return false;
}

async function handleWebLibraryRequest(request, response, pathname, options) {
  if (pathname === "/zotero-web-library/manifest.json") {
    await sendWebLibraryManifest(response, options);
    return true;
  }
  if (pathname === "/zotero-web-library/fixture.json") {
    await sendWebLibraryFixture(response, options);
    return true;
  }
  if (!pathname.startsWith("/zotero-web-library/static/")) {
    return false;
  }
  const resolved = await findWebLibraryRoot(options.webLibraryRoots);
  if (!resolved.root) {
    sendText(response, 404, "Zotero Web Library root not found");
    return true;
  }
  const staticRoot = path.join(resolved.root, "src", "static");
  const relativePath = pathname.replace(/^\/zotero-web-library\/static\/+/, "");
  const absolutePath = path.resolve(staticRoot, relativePath);
  if (!absolutePath.startsWith(`${staticRoot}${path.sep}`) && absolutePath !== staticRoot) {
    sendText(response, 403, "Forbidden");
    return true;
  }
  let stat = null;
  try {
    stat = await fs.stat(absolutePath);
  } catch {
    sendText(response, 404, "Not Found");
    return true;
  }
  if (!stat.isFile()) {
    sendText(response, 404, "Not Found");
    return true;
  }
  const contentType = MIME_TYPES[path.extname(absolutePath)] || "application/octet-stream";
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": stat.size,
    "cache-control": "no-store",
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  createReadStream(absolutePath).pipe(response);
  return true;
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" || pathname === "/index.html"
    ? path.join("static", "index.html")
    : pathname.replace(/^\/+/, "");
  const absolutePath = path.resolve(windTunnelRoot, relativePath);
  if (!absolutePath.startsWith(`${windTunnelRoot}${path.sep}`) && absolutePath !== windTunnelRoot) {
    return null;
  }
  return absolutePath;
}

async function handleRequest(request, response, options) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method Not Allowed");
    return;
  }
  const requestURL = new URL(request.url || "/", "http://127.0.0.1");
  if (await handleZoteroPdfJsRequest(request, response, decodeURIComponent(requestURL.pathname), options)) {
    return;
  }
  if (await handleZoteroReaderRequest(request, response, decodeURIComponent(requestURL.pathname), options)) {
    return;
  }
  if (await handleWebLibraryRequest(request, response, decodeURIComponent(requestURL.pathname), options)) {
    return;
  }
  const filePath = resolveRequestPath(request.url || "/");
  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }
  let stat = null;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    sendText(response, 404, "Not Found");
    return;
  }
  if (!stat.isFile()) {
    sendText(response, 404, "Not Found");
    return;
  }
  const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": stat.size,
    "cache-control": "no-store",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  await fs.access(path.join(windTunnelRoot, "static", "index.html"));
  const server = http.createServer((request, response) => {
    void handleRequest(request, response, options).catch((error) => {
      sendText(response, 500, error instanceof Error ? error.message : String(error));
    });
  });
  server.listen(options.port, options.host, () => {
    console.log(`Zotero Surface Wind Tunnel: http://${options.host}:${options.port}/`);
  });
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
