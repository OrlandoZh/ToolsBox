import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const lockDir = path.join(projectRoot, ".build-lock");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  }
  catch (error) {
    if (error?.code === "EPERM") {
      return true;
    }
    if (error?.code === "ESRCH") {
      return false;
    }
    return false;
  }
}

async function readLockOwner() {
  try {
    const content = await fs.readFile(path.join(lockDir, "owner.json"), "utf-8");
    return JSON.parse(content);
  }
  catch {
    return null;
  }
}

async function cleanupStaleLockIfNeeded() {
  const ownerInfo = await readLockOwner();
  if (!ownerInfo) {
    await fs.rm(lockDir, { recursive: true, force: true });
    return true;
  }

  if (isProcessAlive(Number(ownerInfo.pid))) {
    return false;
  }

  await fs.rm(lockDir, { recursive: true, force: true });
  return true;
}

export async function acquireBuildLock({
  timeoutMs = 30000,
  retryDelayMs = 150,
  owner = "unknown",
} = {}) {
  if (process.env.CLEANROOM_BUILD_LOCK_HELD === "1") {
    return {
      acquired: false,
      release: async () => {},
    };
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.mkdir(lockDir);
      await fs.writeFile(
        path.join(lockDir, "owner.json"),
        `${JSON.stringify({
          owner,
          pid: process.pid,
          acquiredAt: new Date().toISOString(),
        }, null, 2)}\n`,
        "utf-8",
      );
      return {
        acquired: true,
        release: async () => {
          await fs.rm(lockDir, { recursive: true, force: true });
        },
      };
    }
    catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      await cleanupStaleLockIfNeeded();
    }
    await sleep(retryDelayMs);
  }

  throw new Error(`Timed out acquiring build lock: ${lockDir}`);
}

export async function withBuildLock(owner, fn) {
  const lock = await acquireBuildLock({ owner });
  try {
    return await fn();
  }
  finally {
    await lock.release();
  }
}
