import type { SurfaceEvidenceTarget } from "./platform";

export interface HostActionDescriptor {
  id: string;
  label: string;
  status: "ready" | "probe-only" | "manual-only" | "unsafe";
  category: string;
  summary: string;
  authoritativeSource: Array<{
    file: string;
    anchor: string;
  }>;
  preconditions: string[];
  executionEntry: string;
  readinessAssertions: string[];
  evidenceTargets: string[];
  ownerModules: string[];
  executable: boolean;
}

export interface HostActionPayloadMap {
  "preferences.openPane": {
    paneID?: string;
    scrollTo?: string;
    windowWidth?: number;
    windowHeight?: number;
    timeoutMs?: number;
  };
  "preferences.selectTab": {
    paneID?: string;
    tabID: string;
    windowWidth?: number;
    windowHeight?: number;
    timeoutMs?: number;
  };
  "preferences.setCheckbox": {
    paneID?: string;
    controlID?: string;
    preferenceID?: string;
    selector?: string;
    checked: boolean;
    windowWidth?: number;
    windowHeight?: number;
    timeoutMs?: number;
  };
  "preferences.setTextbox": {
    paneID?: string;
    controlID?: string;
    preferenceID?: string;
    selector?: string;
    value: string;
    windowWidth?: number;
    windowHeight?: number;
    timeoutMs?: number;
  };
  "preferences.selectMenulist": {
    paneID?: string;
    controlID?: string;
    preferenceID?: string;
    selector?: string;
    value: string;
    windowWidth?: number;
    windowHeight?: number;
    timeoutMs?: number;
  };
  "contextPane.setOpen": {
    open?: boolean;
    timeoutMs?: number;
  };
  "itemPane.selectPane": {
    paneID: string;
    behavior?: string;
    activationPolicy?: "host-first" | "ui-required";
    timeoutMs?: number;
  };
  "contextPane.selectPane": {
    paneID: string;
    tabID?: string;
    behavior?: string;
    activationPolicy?: "host-first" | "ui-required";
    timeoutMs?: number;
  };
  "reader.open": {
    itemID: number;
    location?: unknown;
    openInBackground?: boolean;
    openInWindow?: boolean;
    allowDuplicate?: boolean;
    timeoutMs?: number;
  };
  "reader.contextPane.setOpen": {
    target?: unknown;
    itemID?: number;
    tabID?: string;
    open?: boolean;
    timeoutMs?: number;
  };
  "reader.sidebar.selectView": {
    target?: unknown;
    itemID?: number;
    tabID?: string;
    view: string;
    activationPolicy?: "host-first" | "ui-required";
    timeoutMs?: number;
  };
  "reader.toolbar.triggerButton": {
    target?: unknown;
    itemID?: number;
    tabID?: string;
    selector: string;
    timeoutMs?: number;
  };
  "menu.show": {
    menuID: string;
    target: string;
    menuPath?: string;
    rowSelector?: string;
    tabID?: string;
    reader?: unknown;
    timeoutMs?: number;
  };
  "menu.trigger": HostActionPayloadMap["menu.show"];
}

export interface HostActionCheck {
  name: string;
  ok: boolean;
  details: Record<string, unknown>;
}

export interface HostActionReadiness {
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
  checks: HostActionCheck[];
}

export interface HostActionResult {
  actionId: string;
  ok: boolean;
  preconditions: HostActionCheck[];
  observedState: Record<string, unknown>;
  readiness: HostActionReadiness;
  surfaceTarget: SurfaceEvidenceTarget | null;
  failureKind: string | null;
}

export interface SurfaceSmokeResult {
  ok: boolean;
  actionId: string;
  readiness: HostActionReadiness;
  observedState: Record<string, unknown>;
  surfaceEvidenceTargets: SurfaceEvidenceTarget[];
  failureKind: string | null;
}
