import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateWorkspaceInitGuard } from "./agent-workspace-guard-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const strict = process.argv.includes("--strict");

const result = await evaluateWorkspaceInitGuard(projectRoot, {
  strict,
  env: process.env,
});

console.log(`Workspace init guard (${strict ? "strict" : "warn"}): ${result.status}`);
console.log(result.message);
if (result.recommendation) {
  console.log(result.recommendation);
}

if (!result.ok) {
  process.exit(2);
}
