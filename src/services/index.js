import { createServiceRegistry } from "./registry.js";
import { createFileStateStore } from "./file-state-store.js";
import { createResourceLoader } from "./resource-loader.js";
import { createTaskQueue, TASK_QUEUE_STATUSES } from "./task-queue.js";
import { createTaskRunner } from "./task-runner.js";
import {
  createWasmModuleLoader,
  fetchWasmBytes,
  instantiateWasmModule,
  resolveWasmAssetURL,
} from "./wasm-loader.js";
import { createWasmWorkerController } from "./wasm-worker.js";
import { createEntitlementIdentityProvider } from "./entitlement-identity-provider.js";
import { createEntitlementLegacyAdapter } from "./entitlement-legacy-adapter.js";
import { createEntitlementControlPlane } from "./entitlement-control-plane.js";

export { createServiceRegistry };
export { createFileStateStore };
export { createResourceLoader };
export { createTaskRunner };
export { createTaskQueue };
export { TASK_QUEUE_STATUSES };
export { createWasmModuleLoader };
export { createWasmWorkerController };
export { fetchWasmBytes };
export { instantiateWasmModule };
export { resolveWasmAssetURL };
export { createEntitlementIdentityProvider };
export { createEntitlementLegacyAdapter };
export { createEntitlementControlPlane };
