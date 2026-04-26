(function initializeAgentReviewWorkbenchWindow() {
  const state = {
    api: null,
    snapshot: null,
    selectedStage: "scope",
    selectedPath: "",
    editingAnnotationId: null,
    busy: false,
    statusMessage: "等待运行时桥接...",
  };

  const stageLabels = {
    scope: "范围",
    route: "路线",
    hostAction: "宿主动作",
    evidence: "证据",
    patchPlan: "补丁计划",
    gate: "门禁",
  };

  const actionLabels = {
    "rerun-host-action": "重新执行宿主动作",
    "refresh-evidence": "刷新证据",
    "draft-doc-update": "起草文档更新",
    "review-existing-patch-plan": "审查既有补丁计划",
    "manual-investigation": "人工调查",
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeText(value) {
    return String(value ?? "");
  }

  function setStatus(message) {
    state.statusMessage = escapeText(message || "");
    const summaryNode = byId("review-workbench-summary");
    if (summaryNode) {
      summaryNode.textContent = state.statusMessage;
    }
  }

  function setBusy(busy) {
    state.busy = busy === true;
    const buttons = [
      byId("review-workbench-generate-plan"),
      byId("review-workbench-refresh-stage"),
      byId("review-workbench-save-annotation"),
      byId("review-workbench-clear-annotation"),
    ];
    buttons.forEach((button) => {
      if (button) {
        button.disabled = state.busy;
      }
    });
  }

  function getSelectedStage() {
    const snapshotStage = state.snapshot?.session?.activeStage || "scope";
    return state.selectedStage || snapshotStage;
  }

  function getStepResult(stage) {
    return state.snapshot?.stepResults?.[stage] || null;
  }

  function getStageAnnotations(stage) {
    const annotations = Array.isArray(state.snapshot?.annotations) ? state.snapshot.annotations : [];
    return annotations.filter((entry) => entry.stage === stage);
  }

  function formatStageLabel(stage, fallback) {
    return stageLabels[stage] || fallback || stage;
  }

  function formatActionLabel(action) {
    return actionLabels[action] || action;
  }

  function formatRefreshedAt(value) {
    return value ? `已刷新 ${value}` : "尚未刷新";
  }

  function getOpenStageAnnotations(stage) {
    return getStageAnnotations(stage).filter((entry) => entry.status === "open");
  }

  function clearForm(options = {}) {
    state.editingAnnotationId = null;
    if (options.keepPath !== true) {
      state.selectedPath = "";
      const targetPathInput = byId("review-workbench-target-path");
      if (targetPathInput) {
        targetPathInput.value = "";
      }
    }
    const contentInput = byId("review-workbench-annotation-content");
    if (contentInput) {
      contentInput.value = "";
    }
  }

  function fillFormFromAnnotation(annotation) {
    if (!annotation) {
      clearForm();
      return;
    }
    state.editingAnnotationId = annotation.id;
    state.selectedPath = annotation.targetPath || "";
    const targetPathInput = byId("review-workbench-target-path");
    const contentInput = byId("review-workbench-annotation-content");
    if (targetPathInput) {
      targetPathInput.value = annotation.targetPath || "";
    }
    if (contentInput) {
      contentInput.value = annotation.content || "";
    }
  }

  function renderStepper() {
    const stepperNode = byId("review-workbench-stepper");
    if (!stepperNode) {
      return;
    }
    const steps = Array.isArray(state.snapshot?.steps) ? state.snapshot.steps : [];
    const selectedStage = getSelectedStage();
    stepperNode.textContent = "";
    steps.forEach((step) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "review-workbench-step-button";
      button.dataset.active = String(selectedStage === step.key);
      button.addEventListener("click", () => {
        void selectStage(step.key);
      });

      const topLine = document.createElement("div");
      topLine.className = "review-workbench-step-topline";
      const title = document.createElement("strong");
      title.textContent = formatStageLabel(step.key, step.label);
      topLine.appendChild(title);
      if (step.stale) {
        const staleBadge = document.createElement("span");
        staleBadge.className = "review-workbench-step-stale";
        staleBadge.textContent = "待刷新";
        topLine.appendChild(staleBadge);
      }

      const meta = document.createElement("div");
      meta.className = "review-workbench-step-meta";
      meta.textContent = formatRefreshedAt(step.refreshedAt);

      button.appendChild(topLine);
      button.appendChild(meta);
      stepperNode.appendChild(button);
    });
  }

  function createViewerRow(path, value, depth) {
    const row = document.createElement("div");
    row.className = "review-workbench-viewer-row";
    row.style.marginLeft = `${Math.max(0, depth) * 14}px`;

    const pickButton = document.createElement("button");
    pickButton.type = "button";
    pickButton.textContent = path || "<根>";
    pickButton.addEventListener("click", () => {
      state.selectedPath = path || "";
      const targetPathInput = byId("review-workbench-target-path");
      if (targetPathInput) {
        targetPathInput.value = state.selectedPath;
      }
    });

    const pathNode = document.createElement("div");
    pathNode.className = "review-workbench-viewer-path";
    pathNode.textContent = path || "<根>";

    const valueNode = document.createElement("div");
    valueNode.className = "review-workbench-viewer-value";
    valueNode.textContent = typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);

    row.appendChild(pickButton);
    row.appendChild(pathNode);
    row.appendChild(valueNode);
    return row;
  }

  function appendStructuredRows(container, value, pathPrefix, depth) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        container.appendChild(createViewerRow(pathPrefix, [], depth));
        return;
      }
      value.forEach((entry, index) => {
        const nextPath = pathPrefix ? `${pathPrefix}[${index}]` : `[${index}]`;
        if (entry && typeof entry === "object") {
          container.appendChild(createViewerRow(nextPath, Array.isArray(entry) ? "[...]" : "{...}", depth));
          appendStructuredRows(container, entry, nextPath, depth + 1);
        } else {
          container.appendChild(createViewerRow(nextPath, entry, depth));
        }
      });
      return;
    }

    if (value && typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        container.appendChild(createViewerRow(pathPrefix, {}, depth));
        return;
      }
      keys.forEach((key) => {
        const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const nextValue = value[key];
        if (nextValue && typeof nextValue === "object") {
          container.appendChild(createViewerRow(nextPath, Array.isArray(nextValue) ? "[...]" : "{...}", depth));
          appendStructuredRows(container, nextValue, nextPath, depth + 1);
        } else {
          container.appendChild(createViewerRow(nextPath, nextValue, depth));
        }
      });
      return;
    }

    container.appendChild(createViewerRow(pathPrefix, value, depth));
  }

  function renderViewer() {
    const viewerNode = byId("review-workbench-viewer");
    const stageTitle = byId("review-workbench-stage-title");
    if (!viewerNode || !stageTitle) {
      return;
    }
    const selectedStage = getSelectedStage();
    const stepResult = getStepResult(selectedStage);
    const step = state.snapshot?.steps?.find((entry) => entry.key === selectedStage) || null;
    stageTitle.textContent = formatStageLabel(selectedStage, step?.label);
    viewerNode.textContent = "";

    if (!stepResult?.data) {
      const emptyNode = document.createElement("div");
      emptyNode.className = "review-workbench-empty";
      emptyNode.textContent = "当前阶段还没有可用的结构化快照。";
      viewerNode.appendChild(emptyNode);
      return;
    }

    appendStructuredRows(viewerNode, stepResult.data, "", 0);
  }

  function createCardHeading(title, subtitle) {
    const wrapper = document.createElement("div");
    const titleNode = document.createElement("h3");
    titleNode.textContent = title;
    wrapper.appendChild(titleNode);
    if (subtitle) {
      const subtitleNode = document.createElement("p");
      subtitleNode.className = "review-workbench-card-code";
      subtitleNode.textContent = subtitle;
      wrapper.appendChild(subtitleNode);
    }
    return wrapper;
  }

  function createCommandList(commands) {
    const container = document.createElement("div");
    container.className = "review-workbench-command-list";
    (Array.isArray(commands) ? commands : []).forEach((command) => {
      const commandNode = document.createElement("div");
      commandNode.className = "review-workbench-command";
      commandNode.textContent = command;
      container.appendChild(commandNode);
    });
    return container;
  }

  function renderAnnotations() {
    const annotationList = byId("review-workbench-annotation-list");
    const planList = byId("review-workbench-plan-list");
    const generateButton = byId("review-workbench-generate-plan");
    if (!annotationList || !planList || !generateButton) {
      return;
    }

    const selectedStage = getSelectedStage();
    const annotations = getStageAnnotations(selectedStage);
    const activeAnnotations = getOpenStageAnnotations(selectedStage);
    generateButton.disabled = state.busy || activeAnnotations.length === 0;

    annotationList.textContent = "";
    if (annotations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "review-workbench-empty";
      empty.textContent = "当前阶段还没有批注。";
      annotationList.appendChild(empty);
    } else {
      annotations.forEach((annotation) => {
        const card = document.createElement("article");
        card.className = "review-workbench-card";
        card.appendChild(createCardHeading(annotation.status === "archived" ? "已归档批注" : "批注", annotation.targetPath));

        const body = document.createElement("p");
        body.textContent = annotation.content || "（空批注）";
        card.appendChild(body);

        const meta = document.createElement("p");
        meta.textContent = `更新于 ${annotation.updatedAt}`;
        card.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "review-workbench-card-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "编辑";
        editButton.addEventListener("click", () => {
          fillFormFromAnnotation(annotation);
        });
        actions.appendChild(editButton);

        const archiveButton = document.createElement("button");
        archiveButton.type = "button";
        archiveButton.dataset.tone = annotation.status === "archived" ? "ok" : "warning";
        archiveButton.textContent = annotation.status === "archived" ? "重新打开" : "归档";
        archiveButton.addEventListener("click", () => {
          void runAsyncAction(async () => {
            const snapshot = await state.api.updateAnnotation(annotation.id, {
              status: annotation.status === "archived" ? "open" : "archived",
            });
            applySnapshot(snapshot);
          });
        });
        actions.appendChild(archiveButton);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "删除";
        deleteButton.dataset.tone = "warning";
        deleteButton.addEventListener("click", () => {
          void runAsyncAction(async () => {
            const snapshot = await state.api.updateAnnotation(annotation.id, {
              deleted: true,
            });
            if (state.editingAnnotationId === annotation.id) {
              clearForm();
            }
            applySnapshot(snapshot);
          });
        });
        actions.appendChild(deleteButton);

        card.appendChild(actions);
        annotationList.appendChild(card);
      });
    }

    const plans = Array.isArray(state.snapshot?.plans) ? state.snapshot.plans : [];
    planList.textContent = "";
    if (plans.length === 0) {
      const empty = document.createElement("div");
      empty.className = "review-workbench-empty";
      empty.textContent = "还没有生成 deterministic 修订计划。";
      planList.appendChild(empty);
      return;
    }

    plans.slice(0, 4).forEach((plan) => {
      const card = document.createElement("article");
      card.className = "review-workbench-card";
      card.appendChild(createCardHeading(plan.kind || "deterministic-review-plan", plan.id));

      const summary = document.createElement("p");
      summary.textContent = plan.summary || "暂无摘要。";
      card.appendChild(summary);

      if (Array.isArray(plan.actions) && plan.actions.length > 0) {
        const actionSummary = document.createElement("p");
        actionSummary.textContent = plan.actions.map((entry) => formatActionLabel(entry.action)).join("，");
        card.appendChild(actionSummary);
      }

      card.appendChild(createCommandList(plan.validationCommands || []));
      planList.appendChild(card);
    });
  }

  function renderConsole() {
    const consoleBody = byId("review-workbench-console-body");
    if (!consoleBody) {
      return;
    }
    const selectedStage = getSelectedStage();
    const evidence = getStepResult("evidence")?.data || {};
    const gate = getStepResult("gate")?.data || {};
    const patchPlan = getStepResult("patchPlan")?.data || {};
    const diagnostics = state.snapshot?.diagnostics || {};

    consoleBody.textContent = "";
    const cards = [
      {
        title: "当前阶段",
        body: `已选择阶段：${formatStageLabel(selectedStage)}。待刷新阶段：${(state.snapshot?.stale?.stages || []).map((stage) => formatStageLabel(stage)).join("，") || "无"}。`,
        commands: [],
      },
      {
        title: "证据",
        body: evidence.summary || "暂无证据摘要。",
        commands: evidence.nextCommands || [],
      },
      {
        title: "门禁",
        body: gate.summary || "暂无门禁摘要。",
        commands: gate.nextCommand ? [gate.nextCommand] : [],
      },
      {
        title: "补丁计划",
        body: patchPlan.summary || "暂无补丁计划摘要。",
        commands: patchPlan.nextCommands || [],
      },
      {
        title: "诊断",
        body: `批注：${diagnostics.annotationCount || 0}。计划：${diagnostics.planCount || 0}。最近错误：${diagnostics.lastError || "无"}。`,
        commands: [],
      },
    ];

    cards.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "review-workbench-card";
      card.appendChild(createCardHeading(entry.title, null));
      const body = document.createElement("p");
      body.textContent = entry.body;
      card.appendChild(body);
      if (entry.commands.length > 0) {
        card.appendChild(createCommandList(entry.commands));
      }
      consoleBody.appendChild(card);
    });
  }

  function render() {
    renderStepper();
    renderViewer();
    renderAnnotations();
    renderConsole();
    const selectedStage = getSelectedStage();
    const activeAnnotations = getOpenStageAnnotations(selectedStage).length;
    const staleStages = (state.snapshot?.stale?.stages || []).length;
    setStatus(
      `当前阶段：${formatStageLabel(selectedStage)}。本阶段打开批注：${activeAnnotations}。待刷新阶段：${staleStages}。`,
    );
  }

  function applySnapshot(snapshot) {
    state.snapshot = snapshot || null;
    state.selectedStage = state.snapshot?.session?.activeStage || state.selectedStage || "scope";
    render();
  }

  async function runAsyncAction(task) {
    if (state.busy) {
      return;
    }
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setStatus(`工作台操作失败：${error?.message || error}`);
    } finally {
      setBusy(false);
      render();
    }
  }

  async function selectStage(stage) {
    if (!state.api) {
      state.selectedStage = stage;
      render();
      return;
    }
    await runAsyncAction(async () => {
      const snapshot = await state.api.refreshStep(stage);
      clearForm({
        keepPath: true,
      });
      applySnapshot(snapshot);
    });
  }

  function attachEventHandlers() {
    const form = byId("review-workbench-annotation-form");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!state.api) {
          return;
        }
        const selectedStage = getSelectedStage();
        const targetPath = byId("review-workbench-target-path")?.value || state.selectedPath || "";
        const content = byId("review-workbench-annotation-content")?.value || "";
        void runAsyncAction(async () => {
          const snapshot = state.editingAnnotationId
            ? await state.api.updateAnnotation(state.editingAnnotationId, {
              stage: selectedStage,
              targetPath,
              content,
            })
            : await state.api.createAnnotation({
              stage: selectedStage,
              targetPath,
              content,
            });
          clearForm({
            keepPath: true,
          });
          applySnapshot(snapshot);
        });
      });
    }

    const clearButton = byId("review-workbench-clear-annotation");
    if (clearButton && !clearButton.dataset.bound) {
      clearButton.dataset.bound = "true";
      clearButton.addEventListener("click", () => {
        clearForm();
      });
    }

    const refreshButton = byId("review-workbench-refresh-stage");
    if (refreshButton && !refreshButton.dataset.bound) {
      refreshButton.dataset.bound = "true";
      refreshButton.addEventListener("click", () => {
        void selectStage(getSelectedStage());
      });
    }

    const planButton = byId("review-workbench-generate-plan");
    if (planButton && !planButton.dataset.bound) {
      planButton.dataset.bound = "true";
      planButton.addEventListener("click", () => {
        if (!state.api) {
          return;
        }
        void runAsyncAction(async () => {
          const selectedStage = getSelectedStage();
          const activeAnnotationIds = getOpenStageAnnotations(selectedStage).map((entry) => entry.id);
          const result = await state.api.generatePlan({
            stage: selectedStage,
            annotationIds: activeAnnotationIds,
          });
          if (result?.snapshot) {
            applySnapshot(result.snapshot);
          }
          if (result?.ok === false && result?.reason === "no-active-annotations") {
            setStatus("当前阶段没有打开状态的批注，暂不能生成修订计划。");
          }
        });
      });
    }
  }

  function mount(payload) {
    state.api = payload?.api || null;
    state.snapshot = payload?.snapshot || null;
    state.selectedStage = state.snapshot?.session?.activeStage || "scope";
    state.editingAnnotationId = null;
    attachEventHandlers();
    render();
  }

  function unmount() {
    state.api = null;
    state.snapshot = null;
    state.selectedStage = "scope";
    state.editingAnnotationId = null;
    setStatus("工作台窗口已关闭。");
  }

  window.__CleanroomAgentReviewWorkbench__ = {
    mount,
    unmount,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      attachEventHandlers();
      render();
    }, { once: true });
  } else {
    attachEventHandlers();
    render();
  }
})();
