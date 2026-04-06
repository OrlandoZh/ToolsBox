/**
 * Services 模块类型定义
 */

import { Logger } from "./core";

// ========== Service Registry ==========

export interface ServiceHealthSnapshot {
  ok: boolean;
  status: string;
  details: unknown;
  checkedAt: string;
}

export interface ServiceSnapshot {
  id: string;
  label: string;
  enabled: boolean;
  running: boolean;
  status: string;
  startCount: number;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  lastError: string | null;
  health: ServiceHealthSnapshot;
}

export interface ServiceRegistrySummary {
  total: number;
  enabled: number;
  running: number;
  healthy: number;
  unhealthy: number;
  healthOK: boolean;
  status: string;
  services: ServiceSnapshot[];
}

export interface ServiceRegistryDefinition<TContext = unknown> {
  id: string;
  label?: string;
  enabledWhen?: (context: TContext) => boolean;
  start?: (context: TContext) => void | Promise<void>;
  stop?: (context: TContext) => void | Promise<void>;
  healthCheck?: (context: TContext) => boolean | {
    ok?: boolean;
    status?: string;
    details?: unknown;
    checkedAt?: string;
  } | Promise<boolean | {
    ok?: boolean;
    status?: string;
    details?: unknown;
    checkedAt?: string;
  }>;
}

export interface ServiceRegistry<TContext = unknown> {
  register(definition: ServiceRegistryDefinition<TContext>): string;
  startAll(context?: TContext): Promise<ServiceRegistrySummary>;
  stopAll(context?: TContext): Promise<ServiceRegistrySummary>;
  refreshHealth(context?: TContext): Promise<ServiceRegistrySummary>;
  getSummary(): ServiceRegistrySummary;
}

export function createServiceRegistry<TContext = unknown>(options?: {
  logger?: Logger;
}): ServiceRegistry<TContext>;

// ========== File State Store ==========

export interface FileStateStoreStatus {
  id: string;
  label: string;
  status: string;
  schemaVersion: number;
  dirty: boolean;
  loadCount: number;
  saveCount: number;
  lastLoadedAt: string | null;
  lastSavedAt: string | null;
  lastLoadedVersion: number | null;
  lastError: string | null;
  serializedBytes: number;
  hasPendingLoad: boolean;
  hasPendingSave: boolean;
  ready: boolean;
}

export interface FileStateStoreMigrationContext<TState = unknown, TContext = unknown> {
  state: TState;
  persisted: unknown;
  loadedVersion: number | null;
  schemaVersion: number;
  initialState: TState;
  context: TContext;
}

export interface FileStateStorePruneContext<TState = unknown, TContext = unknown> {
  state: TState;
  serializedBytes: number;
  maxBytes: number;
  schemaVersion: number;
  context: TContext;
}

export interface FileStateStore<TState = unknown, TContext = unknown> {
  init(context?: TContext): Promise<TState>;
  setState(
    nextState: TState,
    options?: {
      flush?: boolean;
      context?: TContext;
    }
  ): Promise<TState>;
  update(
    updater: (current: TState) => TState | Promise<TState | undefined> | undefined,
    options?: {
      flush?: boolean;
      context?: TContext;
    }
  ): Promise<TState>;
  reset(
    nextState?: TState,
    options?: {
      flush?: boolean;
      context?: TContext;
    }
  ): Promise<TState>;
  flush(context?: TContext): Promise<TState>;
  dispose(
    context?: TContext,
    options?: {
      flush?: boolean;
    }
  ): Promise<boolean>;
  getStatus(): FileStateStoreStatus;
  getState(): TState | null;
  isReady(): boolean;
}

export function createFileStateStore<TState = unknown, TContext = unknown>(options: {
  id: string;
  label?: string;
  readText: (context?: TContext) => Promise<string | null | undefined> | string | null | undefined;
  writeText: (source: string, context?: TContext) => Promise<void> | void;
  initialState?: TState | ((context?: TContext) => Promise<TState> | TState);
  logger?: Logger;
  debounceMs?: number;
  schemaVersion?: number;
  maxSerializedBytes?: number | null;
  serialize?: (value: {
    schemaVersion: number;
    savedAt: string;
    state: TState;
  }, context?: TContext) => Promise<string> | string;
  deserialize?: (source: string, context?: TContext) => Promise<unknown> | unknown;
  migrate?: (
    context: FileStateStoreMigrationContext<TState, TContext>
  ) => Promise<TState> | TState;
  prune?: (
    context: FileStateStorePruneContext<TState, TContext>
  ) => Promise<TState> | TState;
}): FileStateStore<TState, TContext>;

// ========== Resource Loader ==========

export interface ResourceLoaderStatus {
  id: string;
  label: string;
  status: string;
  loadCount: number;
  lastLoadedAt: string | null;
  lastDisposedAt: string | null;
  lastError: string | null;
  hasResource: boolean;
  hasPendingInit: boolean;
  ready: boolean;
}

export interface ResourceLoader<TResource = unknown, TContext = unknown> {
  init(context?: TContext): Promise<TResource>;
  dispose(context?: TContext): Promise<boolean>;
  getStatus(): ResourceLoaderStatus;
  getResource(): TResource | null;
  isReady(): boolean;
}

export function createResourceLoader<TResource = unknown, TContext = unknown>(options: {
  id: string;
  label?: string;
  load: (context?: TContext) => Promise<TResource> | TResource;
  validate?: (resource: TResource, context?: TContext) => Promise<void> | void;
  dispose?: (resource: TResource, context?: TContext) => Promise<void> | void;
  logger?: Logger;
}): ResourceLoader<TResource, TContext>;

// ========== Task Queue ==========

export interface TaskQueueSnapshot {
  id: string;
  status: string;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  metadata: unknown;
  lastProgress: unknown;
}

export interface TaskQueueSummary {
  id: string;
  label: string;
  running: boolean;
  concurrency: number;
  activeWorkerCount: number;
  counts: {
    total: number;
    pending: number;
    running: number;
    succeeded: number;
    failed: number;
  };
  tasks: TaskQueueSnapshot[];
}

export interface TaskQueueEvent {
  type: string;
  queueID: string;
  taskID: string | null;
  status: string | null;
  details: Record<string, unknown>;
}

export interface TaskQueueWorkerContext<TPayload = unknown, TMetadata = unknown> {
  queueID: string;
  taskID: string;
  payload: TPayload;
  attempt: number;
  maxAttempts: number;
  metadata: TMetadata | null;
  report(details?: Record<string, unknown>): void;
}

export interface TaskQueue<TPayload = unknown, TMetadata = unknown> {
  enqueue(
    payload: TPayload,
    options?: {
      id?: string;
      priority?: number;
      maxAttempts?: number;
      metadata?: TMetadata;
    }
  ): {
    taskID: string;
    accepted: boolean;
    duplicate: boolean;
    status: string | null;
  };
  start(): TaskQueueSummary;
  stop(): TaskQueueSummary;
  flush(): Promise<TaskQueueSummary>;
  clearFinished(): number;
  getTask(taskID: string): TaskQueueSnapshot | null;
  getSummary(): TaskQueueSummary;
  onEvent(listener: (event: TaskQueueEvent) => void): () => void;
  isRunning(): boolean;
  has(taskID: string): boolean;
}

export const TASK_QUEUE_STATUSES: {
  PENDING: "pending";
  RUNNING: "running";
  SUCCEEDED: "succeeded";
  FAILED: "failed";
};

export function createTaskQueue<TPayload = unknown, TMetadata = unknown>(options: {
  id: string;
  label?: string;
  worker: (
    context: TaskQueueWorkerContext<TPayload, TMetadata>
  ) => Promise<void> | void;
  logger?: Logger;
  concurrency?: number;
  autoStart?: boolean;
  defaultMaxAttempts?: number;
}): TaskQueue<TPayload, TMetadata>;

// ========== Task Runner ==========

export interface TaskRunnerDescriptor<TInput = unknown, TMetadata = unknown> {
  id?: string;
  type: string;
  input?: TInput;
  metadata?: TMetadata;
  priority?: number;
  maxAttempts?: number;
  [key: string]: unknown;
}

export interface TaskRunnerTaskSnapshot<
  TDescriptor extends TaskRunnerDescriptor = TaskRunnerDescriptor,
  TResult = unknown,
> {
  taskID: string;
  descriptorID: string | null;
  type: string | null;
  status: string | null;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  enqueuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  descriptor: TDescriptor | null;
  queueMetadata: unknown;
  lastProgress: unknown;
  result: TResult | null;
}

export interface TaskRunnerSummary<
  TDescriptor extends TaskRunnerDescriptor = TaskRunnerDescriptor,
  TResult = unknown,
> {
  id: string;
  label: string;
  running: boolean;
  concurrency: number;
  activeWorkerCount: number;
  handlerTypes: string[];
  counts: {
    total: number;
    pending: number;
    running: number;
    succeeded: number;
    failed: number;
  };
  tasks: Array<TaskRunnerTaskSnapshot<TDescriptor, TResult>>;
}

export interface TaskRunnerEvent {
  type: string;
  runnerID: string;
  taskID: string | null;
  taskType: string | null;
  status: string | null;
  details: Record<string, unknown>;
}

export interface TaskRunnerHandlerContext<
  TDescriptor extends TaskRunnerDescriptor = TaskRunnerDescriptor,
> {
  runnerID: string;
  taskID: string;
  descriptor: TDescriptor;
  input: TDescriptor["input"] | null;
  metadata: TDescriptor["metadata"] | null;
  attempt: number;
  maxAttempts: number;
  report(details?: Record<string, unknown>): void;
}

export interface TaskRunnerSubmitResult {
  taskID: string | null;
  accepted: boolean;
  duplicate: boolean;
  status: string | null;
  reason: string | null;
}

export interface TaskRunnerRunResult<
  TDescriptor extends TaskRunnerDescriptor = TaskRunnerDescriptor,
  TResult = unknown,
> extends TaskRunnerSubmitResult {
  task: TaskRunnerTaskSnapshot<TDescriptor, TResult> | null;
}

export interface TaskRunner<
  TDescriptor extends TaskRunnerDescriptor = TaskRunnerDescriptor,
  TResult = unknown,
> {
  register(
    type: string,
    handler: (
      context: TaskRunnerHandlerContext<TDescriptor>
    ) => Promise<TResult> | TResult
  ): string;
  unregister(type: string): boolean;
  submit(
    descriptor: TDescriptor,
    options?: {
      id?: string;
      priority?: number;
      maxAttempts?: number;
      queueMetadata?: unknown;
    }
  ): TaskRunnerSubmitResult;
  run(
    descriptor: TDescriptor,
    options?: {
      id?: string;
      priority?: number;
      maxAttempts?: number;
      queueMetadata?: unknown;
    }
  ): Promise<TaskRunnerRunResult<TDescriptor, TResult>>;
  start(): TaskRunnerSummary<TDescriptor, TResult>;
  stop(): TaskRunnerSummary<TDescriptor, TResult>;
  flush(): Promise<TaskRunnerSummary<TDescriptor, TResult>>;
  clearFinished(): number;
  getTask(taskID: string): TaskRunnerTaskSnapshot<TDescriptor, TResult> | null;
  getSummary(): TaskRunnerSummary<TDescriptor, TResult>;
  onEvent(listener: (event: TaskRunnerEvent) => void): () => void;
  isRunning(): boolean;
  has(taskID: string): boolean;
  hasHandler(type: string): boolean;
  listHandlers(): string[];
}

export function createTaskRunner<
  TDescriptor extends TaskRunnerDescriptor = TaskRunnerDescriptor,
  TResult = unknown,
>(options: {
  id: string;
  label?: string;
  handlers?:
    | Record<
        string,
        (context: TaskRunnerHandlerContext<TDescriptor>) => Promise<TResult> | TResult
      >
    | Array<{
        type: string;
        handler?: (
          context: TaskRunnerHandlerContext<TDescriptor>
        ) => Promise<TResult> | TResult;
        run?: (
          context: TaskRunnerHandlerContext<TDescriptor>
        ) => Promise<TResult> | TResult;
      }>;
  logger?: Logger;
  concurrency?: number;
  autoStart?: boolean;
  defaultMaxAttempts?: number;
}): TaskRunner<TDescriptor, TResult>;
