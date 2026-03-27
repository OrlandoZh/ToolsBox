import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function readConfig() {
  const content = await fs.readFile(
    path.join(projectRoot, "config", "addon.config.json"),
    "utf-8",
  );
  return JSON.parse(content);
}

function runNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CLEANROOM_BUILD_LOCK_HELD: "1",
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  await withBuildLock("package.mjs", async () => {
    const config = await readConfig();
    const buildRoot = path.join(projectRoot, "build", config.addonRef);
    const distRoot = path.join(projectRoot, "dist");

    runNodeScript(path.join(projectRoot, "scripts", "build.mjs"));
    await fs.mkdir(distRoot, { recursive: true });

    const outputName = `${config.addonRef}-${config.addonVersion}.xpi`;
    const outputPath = path.join(distRoot, outputName);
    await fs.rm(outputPath, { force: true });

    const zip = spawnSync("zip", ["-r", outputPath, "."], {
      cwd: buildRoot,
      stdio: "inherit",
    });

    if (zip.status !== 0) {
      process.exit(zip.status ?? 1);
    }

    runNodeScript(path.join(projectRoot, "scripts", "release-metadata.mjs"));

    console.log(`Package complete: ${outputPath}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
