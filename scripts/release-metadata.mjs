import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function readJSON(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

function buildUpdateLink(updateURL, outputName) {
  const url = new URL(updateURL);
  const pathname = url.pathname.replace(/\/[^/]*$/, `/${outputName}`);
  url.pathname = pathname;
  return url.toString();
}

async function main() {
  const config = await readJSON(path.join(projectRoot, "config", "addon.config.json"));
  const distRoot = path.join(projectRoot, "dist");
  const outputName = `${config.addonRef}-${config.addonVersion}.xpi`;
  const updateLink = buildUpdateLink(config.updateURL, outputName);

  await fs.mkdir(distRoot, { recursive: true });

  const updateManifest = {
    addons: {
      [config.addonId]: {
        updates: [
          {
            version: config.addonVersion,
            update_link: updateLink,
            applications: {
              zotero: {
                strict_min_version: config.strictMinVersion,
                strict_max_version: config.strictMaxVersion,
              },
            },
          },
        ],
      },
    },
  };

  const releaseManifest = {
    generatedAt: new Date().toISOString(),
    addonId: config.addonId,
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    xpiName: outputName,
    xpiPath: path.join(distRoot, outputName),
    updateURL: config.updateURL,
    updateLink,
  };

  await fs.writeFile(
    path.join(distRoot, "update.json"),
    `${JSON.stringify(updateManifest, null, 2)}\n`,
    "utf-8",
  );
  await fs.writeFile(
    path.join(distRoot, "release-manifest.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
    "utf-8",
  );

  console.log(`Release metadata complete: ${path.join(distRoot, "update.json")}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
