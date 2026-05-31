/**
 * Attachment Preview Feature
 * Based on zoterostyle PDF preview pattern.
 * Uses sidePanelArgs + render hijacking for right-sidebar PDF/image preview.
 *
 * Only renders attachment-preview XUL elements via MozXULElement.
 * Does NOT open network connections or load external content.
 */

const XUL_NS = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

const SELECTORS = Object.freeze({
  reader: Object.freeze({
    sidenav: '#zotero-context-pane-sidenav',
    parent: '#zotero-context-pane-inner deck',
  }),
  library: Object.freeze({
    sidenav: '#zotero-view-item-sidenav',
    parent: '#zotero-item-pane-content',
  }),
});

export function createAttachmentPreview(options = {}) {
  const Z = options.zotero || globalThis.Zotero;
  const log = options.logger || { info: (msg) => Z?.debug?.('[ToolsBox] [PDF Preview] ' + msg) };

  let initialized = false;
  const activeIntervals = new Set();
  const activeObservers = new Set();
  let libraryContainer = null;
  let readerContainer = null;
  let itemSelectListenerRegistered = false;
  let savedSidePanelEntry = null;
  const savedSidenavRenders = new Map();

  function debugLog(msg) {
    log?.info?.(msg);
  }

  function getMainWindow() {
    try {
      return typeof Z?.getMainWindow === 'function' ? Z.getMainWindow() : null;
    } catch {
      return null;
    }
  }

  function getMainDocument() {
    return getMainWindow()?.document || null;
  }

  function queryOne(root, selector) {
    try {
      return root && typeof root.querySelector === 'function'
        ? root.querySelector(selector)
        : null;
    } catch {
      return null;
    }
  }

  function queryAll(root, selector) {
    try {
      return root && typeof root.querySelectorAll === 'function'
        ? Array.from(root.querySelectorAll(selector))
        : [];
    } catch {
      return [];
    }
  }

  async function waitForIframe(previewEl) {
    const win = getMainWindow();
    for (let i = 0; i < 30; i++) {
      await (Z?.Promise?.delay?.(500) || new Promise((resolve) => setTimeout(resolve, 500)));
      try {
        const iframeDoc = queryOne(previewEl?._reader?._iframeWindow?.document, 'iframe')?.contentDocument;
        if (iframeDoc) return iframeDoc;
      } catch { break; }
    }
    return null;
  }

  function setupZoomMode(previewEl, win) {
    if (typeof win?.setInterval !== 'function') {
      return;
    }
    const zoomInterval = win.setInterval(() => {
      try {
        const pdfViewer = previewEl._reader._internalReader._lastView._iframeWindow?.PDFViewerApplication?.pdfViewer;
        if (pdfViewer?.currentScaleValue === 'page-height') {
          pdfViewer.currentScaleValue = 'auto';
          pdfViewer.scrollMode = 0;
        }
      } catch { /* expected during navigation */ }
    }, 1);
    activeIntervals.add(zoomInterval);
  }

  async function loadPreview(item, context) {
    const win = getMainWindow();
    const doc = win?.document;
    const previewEl = queryOne(doc, 'attachment-preview.style-attachment-preview.' + context);

    if (!previewEl) {
      debugLog('Preview element not found for context: ' + context);
      return;
    }

    debugLog('Loading preview for item: ' + item.id + ' context: ' + context);

    if (typeof win?.setTimeout !== 'function') {
      return;
    }

    win.setTimeout(async () => {
      try {
        await previewEl._previewInitializePromise?.promise;
        await previewEl._nextPreviewInitializePromise?.promise;
        previewEl.item = item;

        const previewInterval = win.setInterval(() => {
          try {
            previewEl._reader._internalReader._primaryView._preview = false;
          } catch { /* expected during teardown */ }
        }, 1);
        activeIntervals.add(previewInterval);

        await previewEl.render();

        previewEl.style.setProperty('--preview-width', previewEl.clientWidth + 'px', 'important');
        previewEl.style.setProperty('--screen-height', '9999px', 'important');

        debugLog('Element dimensions: ' + JSON.stringify({
          clientWidth: previewEl.clientWidth,
          clientHeight: previewEl.clientHeight,
        }));

        const browsers = queryAll(previewEl, 'browser');
        browsers.forEach((browser, index) => {
          browser.style.pointerEvents = 'auto';
          debugLog('Browser ' + index + ' pointer-events set to auto');
        });

        const btnContainer = queryOne(previewEl, '.btn-container');
        if (btnContainer) {
          btnContainer.style.display = 'none';
          debugLog('Navigation buttons hidden');
        }

        const iframeDoc = await waitForIframe(previewEl);
        if (iframeDoc) {
          const scrollCSS = [
            '#viewerContainer { overflow: auto !important; scroll-behavior: smooth; }',
            '#viewerContainer::-webkit-scrollbar { width: 12px; height: 12px; }',
            '#viewerContainer::-webkit-scrollbar-track { background: var(--material-sidepane); }',
            '#viewerContainer::-webkit-scrollbar-thumb { background: var(--material-border); border-radius: 6px; }',
            '#viewerContainer::-webkit-scrollbar-thumb:hover { background: var(--material-border-hover); }',
          ].join('\n');
          previewEl._reader._injectCSS(iframeDoc, scrollCSS);
        }

        setupZoomMode(previewEl, win);

        const scrollbox = queryOne(previewEl, 'scrollbox');
        if (scrollbox) {
          scrollbox.style.overflow = 'hidden';
          debugLog('Hidden XUL scrollbox scrollbar');
        }

        debugLog('Preview loaded successfully for item: ' + item.id);
      } catch (err) {
        debugLog('Error loading preview: ' + (err?.message || String(err)));
      }
    });
  }

  async function getBestAttachmentForItem(item) {
    if (!item) return null;
    if (item.isPDFAttachment?.()) return item;
    if (item.isRegularItem?.()) {
      const attachment = await item.getBestAttachment?.();
      return attachment || null;
    }
    return null;
  }

  function buildPreviewContent(container, context) {
    debugLog('buildPreviewContent called for context: ' + context);
    const win = getMainWindow();
    if (typeof win?.setTimeout !== 'function' || !win.MozXULElement) {
      debugLog('Preview content skipped: host XUL window unavailable');
      return;
    }

    win.setTimeout(() => {
      try {
        const fragment = win.MozXULElement.parseXULToFragment(
          '<attachment-preview' +
          ' style="width: 100%; height: 100%; max-height: 100%; overflow: auto; display: flex; flex-direction: column;"' +
          ' id="attachment-preview-' + context + '"' +
          ' class="style-attachment-preview ' + context + '"' +
          ' flex="1"/>'
        );
        container.appendChild(fragment);
        debugLog('Empty attachment-preview element created for: ' + context);
      } catch (err) {
        debugLog('Error creating preview element: ' + (err?.message || String(err)));
      }
    });
  }

  function ensurePanelDeck(panelArg, context) {
    const doc = getMainDocument();
    const parentSelector = SELECTORS[context].parent;
    const parentEl = queryOne(doc, parentSelector);

    if (!parentEl) {
      debugLog('Parent element not found: ' + parentSelector);
      return null;
    }

    const panelId = panelArg.name + '-pane';
    let panelDeck = queryOne(parentEl, '#' + panelId);

    if (!panelDeck) {
      if (typeof doc?.createElementNS !== 'function') {
        debugLog('Document cannot create XUL deck for: ' + context);
        return null;
      }
      panelDeck = doc.createElementNS(XUL_NS, 'deck');
      panelDeck.id = panelId;
      panelDeck.classList.add('container');
      panelDeck.style.backgroundColor = 'var(--material-sidepane)';
      panelDeck.style.height = '100%';
      panelDeck.style.maxHeight = '100%';
      panelDeck.style.flex = '1';
      panelDeck.style.overflow = 'hidden';
      parentEl.appendChild(panelDeck);
      debugLog('Panel container created: ' + panelId);
      panelArg.buildContent(panelDeck);
    }

    return panelDeck;
  }

  function injectCustomButton(sidenav, panelArg, context) {
    const doc = getMainDocument();
    const buttonId = panelArg.name + '-' + context + '-button';
    let button = queryOne(sidenav, '#' + buttonId);

    if (!button) {
      const locateBtn = queryOne(sidenav, '[data-action="locate"]');
      const insertTarget = locateBtn?.parentElement;

      if (!insertTarget) {
        debugLog('locate button parent not found in sidenav');
        return;
      }

      if (typeof doc?.createElement !== 'function' || typeof doc?.createElementNS !== 'function') {
        debugLog('Document cannot create preview button for: ' + context);
        return;
      }

      const newButton = doc.createElement('div');
      newButton.id = buttonId;
      newButton.className = 'sidenav-btn preview-panel-btn';
      newButton.setAttribute('role', 'tab');

      const tb = doc.createElementNS(XUL_NS, 'toolbarbutton');
      tb.setAttribute('tooltiptext', panelArg.name[0].toUpperCase() + panelArg.name.slice(1));
      tb.setAttribute('data-pane', panelArg.name);
      tb.setAttribute('aria-selected', 'false');

      const img = doc.createElementNS(XUL_NS, 'image');
      img.classList.add('toolbarbutton-icon');
      img.style.width = '20px';
      img.style.height = '20px';
      img.style.background = 'url(' + panelArg.icon + ') center/contain no-repeat';

      tb.appendChild(img);
      newButton.appendChild(tb);
      insertTarget.parentElement.insertBefore(newButton, insertTarget);

      button = newButton;
      debugLog('Button created: ' + buttonId);
    }
  }

  function expandSidebarIfNeeded(context) {
    const doc = getMainDocument();
    const paneSelector = context === 'library' ? '#zotero-item-pane' : '#zotero-context-pane';
    const pane = queryOne(doc, paneSelector);

    if (pane?.getAttribute('collapsed') === 'true') {
      pane.removeAttribute('collapsed');
      const splitter = pane.previousElementSibling;
      splitter?.removeAttribute('state');
    }
  }

  function setupSidenavClickHandler(sidenav, context) {
    if (typeof sidenav?.getAttribute !== 'function' || typeof sidenav?.setAttribute !== 'function' || typeof sidenav?.addEventListener !== 'function') {
      return;
    }
    if (sidenav.getAttribute('preview-click-init') === 'true') return;
    sidenav.setAttribute('preview-click-init', 'true');

    const doc = getMainDocument();
    const win = getMainWindow();

    sidenav.addEventListener('click', (e) => {
      if (e.button !== 0) return;

      const target = e.target;
      const clickedButton = Array.from(sidenav.children || []).find((child) => child.contains?.(target));
      if (!clickedButton) return;

      const parentDeck = queryOne(doc, SELECTORS[context].parent);
      if (!parentDeck) return;

      const isCustomBtn = clickedButton.classList.contains('preview-panel-btn');

      if (isCustomBtn) {
        e.stopPropagation();

        const panelArg = Z.sidePanelArgs?.find(
          (p) => p.type === context && p.name === 'preview'
        );
        if (!panelArg) return;

        const panelDeck = queryOne(parentDeck, '#' + panelArg.name + '-pane');
        const isAlreadySelected = parentDeck.selectedPanel === panelDeck;

        if (isAlreadySelected) {
          debugLog('Already selected, switching to native panel');
          parentDeck.selectedIndex = 1;
          clickedButton.removeAttribute('selected');
        } else {
          expandSidebarIfNeeded(context);

          if (panelDeck) {
            parentDeck.selectedPanel = panelDeck;
            clickedButton.setAttribute('selected', 'true');
          }

          const items = win.ZoteroPane?.getSelectedItems();
          if (items && items.length > 0) {
            const item = items[0];
            getBestAttachmentForItem(item).then((attachment) => {
              if (attachment) {
                loadPreview(attachment, context);
              }
            });
          }
        }

        setTimeout(() => { try { sidenav.render(true); } catch {} }, 0);
      } else {
        const panelArg = Z.sidePanelArgs?.find(
          (p) => p.type === context && p.name === 'preview'
        );
        if (panelArg) {
          const panelDeck = queryOne(parentDeck, '#' + panelArg.name + '-pane');
          if (panelDeck && parentDeck.selectedPanel === panelDeck) {
            parentDeck.selectedIndex = 1;
          }
        }

        const customButtons = queryAll(sidenav, '.preview-panel-btn[selected]');
        customButtons.forEach((btn) => btn.removeAttribute('selected'));
      }
    }, true);

    debugLog('Sidenav click handler setup for: ' + context);
  }

  function hijackSidenavRender(context) {
    const doc = getMainDocument();
    const sidenav = queryOne(doc, SELECTORS[context].sidenav);

    if (!sidenav) {
      debugLog('Sidenav not found for context: ' + context + ' - will retry');
      return false;
    }

    if (typeof sidenav.render !== 'function') {
      debugLog('Sidenav render unavailable for context: ' + context);
      return false;
    }

    sidenav._render = sidenav._render || sidenav.render;

    const originalRender = sidenav._render;
    savedSidenavRenders.set(context, { sidenav, originalRender });
    sidenav.render = function () {
      originalRender?.bind(this)();

      const panels = (Z.sidePanelArgs?.filter((p) => p.type === context) || []);
      for (const panelArg of panels) {
        injectCustomButton(sidenav, panelArg, context);
        ensurePanelDeck(panelArg, context);
      }

      setupSidenavClickHandler(sidenav, context);
    };

    debugLog('Render hijack applied for: ' + context);
    return true;
  }

  function setupItemSelectionListener() {
    if (itemSelectListenerRegistered) return;

    const win = getMainWindow();
    const doc = win?.document;

    if (win?.ZoteroPane?.itemsView?.onSelect) {
      win.ZoteroPane.itemsView.onSelect.addListener(async () => {
        const button = queryOne(doc, '#preview-library-button[selected]');
        if (!button) return;

        const items = win.ZoteroPane.getSelectedItems();
        if (!items || items.length === 0) return;

        const item = items[0];
        if (!item || item.isNote()) return;

        const attachment = await getBestAttachmentForItem(item);
        if (attachment) {
          await loadPreview(attachment, 'library');
        }
      });

      itemSelectListenerRegistered = true;
      debugLog('Item selection listener registered');
    }
  }

  function register() {
    if (initialized) {
      debugLog('Already initialized, skipping');
      return true;
    }

    if (!Z) {
      debugLog('Module initialization skipped: Zotero unavailable');
      return false;
    }

    debugLog('Module initialization start');

    Z.sidePanelArgs ??= [];

    const previewPanel = {
      type: 'library',
      name: 'preview',
      icon: 'chrome://toolsbox/content/icons/preview.svg',
      buildContent: (container) => {
        libraryContainer = container;
        buildPreviewContent(container, 'library');
      },
    };

    Z.sidePanelArgs.push(previewPanel);
    savedSidePanelEntry = previewPanel;
    debugLog('sidePanelArgs registered');

    let libOk = hijackSidenavRender('library');
    let readerOk = hijackSidenavRender('reader');

    setupItemSelectionListener();

    const doc = getMainDocument();
    const librarySidenav = queryOne(doc, SELECTORS.library.sidenav);
    if (librarySidenav && typeof librarySidenav.render === 'function') {
      librarySidenav.render();
    }

    // Retry hijack for contexts where sidenav wasn't available at registration time.
    // Zotero main window may not have fully rendered the sidebar yet.
    if (!libOk || !readerOk) {
      const win = getMainWindow();
      if (typeof win?.setInterval !== 'function' || typeof win?.clearInterval !== 'function') {
        initialized = true;
        debugLog('Retry hijack skipped: timer APIs unavailable');
        debugLog('Module initialization complete');
        return true;
      }
      let retries = 0;
      const maxRetries = 30;
      const retryInterval = win.setInterval(() => {
        retries++;
        let applied = 0;
        if (!libOk && hijackSidenavRender('library')) { libOk = true; applied++; }
        if (!readerOk && hijackSidenavRender('reader')) { readerOk = true; applied++; }
        if (applied > 0) {
          debugLog('Retry hijack applied for ' + applied + ' context(s) after ' + retries + ' retries');
          const s = queryOne(doc, SELECTORS.library.sidenav);
          if (s && typeof s.render === 'function') s.render();
        }
        if ((libOk && readerOk) || retries >= maxRetries) {
          win.clearInterval(retryInterval);
        }
      }, 1000);
      activeIntervals.add(retryInterval);
    }

    initialized = true;
    debugLog('Module initialization complete');
    return true;
  }

   function cleanup() {
    debugLog('Cleanup called');

    const win = getMainWindow();
    for (const intervalId of activeIntervals) {
      win?.clearInterval?.(intervalId);
    }
    activeIntervals.clear();

    for (const observer of activeObservers) {
      observer.disconnect();
    }
    activeObservers.clear();

    const doc = win?.document;

    for (const context of ['library', 'reader']) {
      const button = queryOne(doc, '#preview-' + context + '-button');
      if (button) button.remove();

      const pane = queryOne(doc, '#preview-pane');
      if (pane) pane.remove();
    }

    for (const [context, { sidenav, originalRender }] of savedSidenavRenders) {
      if (sidenav && typeof originalRender === 'function') {
        sidenav.render = originalRender;
      }
    }
    savedSidenavRenders.clear();

    if (savedSidePanelEntry && Z?.sidePanelArgs) {
      Z.sidePanelArgs = Z.sidePanelArgs.filter((p) => p !== savedSidePanelEntry);
    }
    savedSidePanelEntry = null;

    if (itemSelectListenerRegistered && win?.ZoteroPane?.itemsView?.onSelect) {
      try {
        win.ZoteroPane.itemsView.onSelect.removeListener(updatePreviewAfterItemSelect);
      } catch (_) {}
    }

    libraryContainer = null;
    readerContainer = null;
    itemSelectListenerRegistered = false;
    initialized = false;

    debugLog('Cleanup complete');
    return { stopped: true, resources: ['sidePanelArgs', 'sidenav-hijack', 'preview-elements'] };
  }

  return { register, cleanup, destroy: cleanup };
}
