/**
 * 运行所有测试
 */
import { runTests } from './test-framework.js';
import './logger.test.js';
import './prefs.test.js';
import './settings.test.js';
import './capability-manifest.test.js';
import './service-registry.test.js';
import './resource-loader.test.js';
import './lifecycle.test.js';
import './http.test.js';
import './host.test.js';
import './item-pane.test.js';
import './menu-manager.test.js';
import './main.test.js';
import './plugin.test.js';
import './runtime-capabilities.test.js';
import './kernel.test.js';
import './plugin-agent.test.js';
import './feature-composer.test.js';
import './reader.test.js';
import './build.test.js';
import './docs-consistency.test.js';
import './bootstrap-bridge.test.js';
import './zotero-runner-lib.test.js';
import './toolchain.test.js';
import './release-matrix-lib.test.js';
import './agent-capability-lib.test.js';
import './agent-frontpage-summary-lib.test.js';
import './agent-memory-lib.test.js';
import './agent-obsidian-handoff-lib.test.js';
import './agent-obsidian-workspace.test.js';
import './agent-telemetry.test.js';
import './agent-zotero-loop-lib.test.js';
import './agent-zotero-e2e-lib.test.js';
import './agent-zotero-static-runtime-lib.test.js';
import './agent-zotero-validation-lib.test.js';
import './agent-zotero-autofix-lib.test.js';
import './agent-zotero-patch-lib.test.js';
import './agent-delegation.test.js';
import './build-injection-lib.test.js';
import './zotero-agent-artifacts.test.js';
import './zotero-watch-report-lib.test.js';
import './zotero-watch-recovery-lib.test.js';
import './zotero-watch-recovery-regression-lib.test.js';

await runTests();
