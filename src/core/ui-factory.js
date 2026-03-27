/**
 * UI 元素工厂模块
 * 提供统一的 UI 元素创建接口，支持 XUL 和 HTML 命名空间
 */

const NAMESPACES = {
  xul: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
  html: "http://www.w3.org/1999/xhtml",
};

/**
 * 设置单个属性
 * @param {Element} element - 目标元素
 * @param {string} key - 属性名
 * @param {*} value - 属性值
 */
function setAttribute(element, key, value) {
  if (value === true) {
    element.setAttribute(key, "true");
  } else if (value === false || value === null || value === undefined) {
    element.removeAttribute(key);
  } else {
    element.setAttribute(key, String(value));
  }
}

/**
 * 批量设置属性
 * @param {Element} element - 目标元素
 * @param {Object.<string, *>} attributes - 属性对象
 */
function setAttributes(element, attributes) {
  if (!attributes || typeof attributes !== "object") {
    return;
  }

  Object.entries(attributes).forEach(([key, value]) => {
    setAttribute(element, key, value);
  });
}

/**
 * 批量设置样式
 * @param {Element} element - 目标元素
 * @param {Object.<string, string>} styles - 样式对象
 */
function setStyles(element, styles) {
  if (!styles || typeof styles !== "object") {
    return;
  }

  Object.entries(styles).forEach(([key, value]) => {
    element.style[key] = value;
  });
}

/**
 * 批量添加事件监听器
 * @param {Element} element - 目标元素
 * @param {Array<{type: string, listener: Function, options?: Object}>} listeners - 监听器数组
 * @returns {Function} 清理函数
 */
function addEventListeners(element, listeners) {
  const cleanups = [];

  if (!Array.isArray(listeners)) {
    return () => {};
  }

  listeners.forEach(({ type, listener, options }) => {
    if (!type || typeof listener !== "function") {
      return;
    }

    try {
      element.addEventListener(type, listener, options);
      cleanups.push(() => {
        element.removeEventListener(type, listener, options);
      });
    } catch (error) {
      // 静默失败
    }
  });

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

/**
 * 根据命名空间创建元素
 * @param {Document} doc - Document 对象
 * @param {string} tag - 标签名
 * @param {string} [namespace] - 命名空间：'xul' | 'html'
 * @returns {Element|null} 创建的元素
 */
function createElementWithNamespace(doc, tag, namespace) {
  if (!doc || !tag) {
    return null;
  }

  // XUL 元素优先使用 createXULElement
  if (namespace === "xul") {
    if (typeof doc.createXULElement === "function") {
      return doc.createXULElement(tag);
    }
    if (NAMESPACES.xul) {
      return doc.createElementNS(NAMESPACES.xul, tag);
    }
  }

  // HTML 元素
  if (namespace === "html" && NAMESPACES.html) {
    return doc.createElementNS(NAMESPACES.html, tag);
  }

  // 默认使用 createElement
  return doc.createElement(tag);
}

/**
 * 创建子元素
 * @param {Document} doc - Document 对象
 * @param {Element|Object|string} child - 子元素配置
 * @param {Object} factory - 工厂实例（用于递归调用）
 * @returns {Node|null} 创建的节点
 */
function createChild(doc, child, factory) {
  // 已有元素
  if (child instanceof Element) {
    return child;
  }

  // 文本节点
  if (typeof child === "string" || typeof child === "number") {
    return doc.createTextNode(String(child));
  }

  // 配置对象
  if (child && typeof child === "object" && child.tag) {
    const { element } = factory.createElement(doc, child.tag, child);
    return element;
  }

  return null;
}

/**
 * 批量添加子元素
 * @param {Element} parent - 父元素
 * @param {Array} children - 子元素数组
 * @param {Document} doc - Document 对象
 * @param {Object} factory - 工厂实例
 */
function appendChildren(parent, children, doc, factory) {
  if (!parent || !Array.isArray(children)) {
    return;
  }

  children.forEach((child) => {
    const node = createChild(doc, child, factory);
    if (node) {
      parent.appendChild(node);
    }
  });
}

/**
 * 创建 UI 工厂
 * @param {Object} options - 配置选项
 * @param {Object} [options.logger] - 日志记录器
 * @returns {Object} UI 工厂实例
 */
export function createUIFactory({ logger } = {}) {
  /**
   * 记录调试信息
   * @param {string} message - 消息
   * @param {Object} [details] - 详情
   */
  function debug(message, details) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  /**
   * 创建元素
   * @param {Document} doc - Document 对象
   * @param {string} tag - 标签名
   * @param {Object} [options] - 元素配置
   * @param {string} [options.namespace] - 命名空间：'xul' | 'html'，默认 'html'
   * @param {Object} [options.attributes] - 属性对象
   * @param {Object} [options.styles] - 样式对象
   * @param {Array} [options.listeners] - 事件监听器数组
   * @param {Array} [options.children] - 子元素数组
   * @param {string} [options.text] - 文本内容
   * @param {string} [options.html] - HTML 内容
   * @param {string} [options.id] - 元素 ID
   * @param {string} [options.className] - CSS 类名
   * @param {Object} [options.properties] - 直接设置到元素上的属性
   * @returns {{element: Element|null, cleanup: Function}}
   */
  function createElement(doc, tag, options = {}) {
    const {
      namespace = "html",
      attributes = {},
      styles = {},
      listeners = [],
      children = [],
      text,
      html,
      id,
      className,
      properties = {},
    } = options;

    // 创建元素
    const element = createElementWithNamespace(doc, tag, namespace);
    if (!element) {
      debug("ui-factory.createElement.failed", { tag, namespace });
      return { element: null, cleanup: () => {} };
    }

    // 简写属性
    if (id) {
      element.setAttribute("id", id);
    }
    if (className) {
      element.setAttribute("class", className);
    }

    // 属性
    setAttributes(element, attributes);

    // 样式
    setStyles(element, styles);

    // 直接属性
    Object.entries(properties).forEach(([key, value]) => {
      try {
        element[key] = value;
      } catch (error) {
        // 静默失败
      }
    });

    // 文本内容
    if (text !== undefined && text !== null) {
      element.textContent = String(text);
    }

    // HTML 内容
    if (html !== undefined && html !== null) {
      element.innerHTML = String(html);
    }

    // 事件监听器
    const cleanupListeners = addEventListeners(element, listeners);

    // 子元素
    appendChildren(element, children, doc, { createElement });

    debug("ui-factory.createElement.created", { tag, namespace, id });

    return {
      element,
      cleanup: cleanupListeners,
    };
  }

  /**
   * 创建 XUL 元素
   * @param {Document} doc - Document 对象
   * @param {string} tag - 标签名
   * @param {Object} [options] - 元素配置
   * @returns {{element: Element|null, cleanup: Function}}
   */
  function createXULElement(doc, tag, options = {}) {
    return createElement(doc, tag, { ...options, namespace: "xul" });
  }

  /**
   * 创建 HTML 元素
   * @param {Document} doc - Document 对象
   * @param {string} tag - 标签名
   * @param {Object} [options] - 元素配置
   * @returns {{element: Element|null, cleanup: Function}}
   */
  function createHTMLElement(doc, tag, options = {}) {
    return createElement(doc, tag, { ...options, namespace: "html" });
  }

  /**
   * 批量添加子元素到父元素
   * @param {Element} parent - 父元素
   * @param {Array} children - 子元素数组
   * @param {Document} doc - Document 对象
   */
  function appendChildrenToParent(parent, children, doc) {
    appendChildren(parent, children, doc, { createElement });
  }

  /**
   * 批量设置元素属性
   * @param {Element} element - 目标元素
   * @param {Object} attributes - 属性对象
   */
  function setElementAttributes(element, attributes) {
    setAttributes(element, attributes);
  }

  /**
   * 批量添加事件监听器到元素
   * @param {Element} element - 目标元素
   * @param {Array} listeners - 监听器数组
   * @returns {Function} 清理函数
   */
  function addElementListeners(element, listeners) {
    return addEventListeners(element, listeners);
  }

  /**
   * 批量设置元素样式
   * @param {Element} element - 目标元素
   * @param {Object} styles - 样式对象
   */
  function setElementStyles(element, styles) {
    setStyles(element, styles);
  }

  return {
    createElement,
    createXULElement,
    createHTMLElement,
    appendChildren: appendChildrenToParent,
    setAttributes: setElementAttributes,
    addEventListeners: addElementListeners,
    setStyles: setElementStyles,
  };
}
