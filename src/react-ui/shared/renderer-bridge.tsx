import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

export interface ReactSurfaceBridge<Props = Record<string, unknown>> {
  mount(container: HTMLElement, props: Props): void;
  update(container: HTMLElement, props: Props): void;
  unmount(container: HTMLElement): void;
}

export function createReactSurfaceRendererBridge<Props>(
  renderApp: (props: Props & { container: HTMLElement }) => ReactNode,
): ReactSurfaceBridge<Props> {
  const rootRegistry = new WeakMap<HTMLElement, Root>();

  function render(container: HTMLElement, props: Props) {
    const existingRoot = rootRegistry.get(container);
    const root = existingRoot || createRoot(container);
    const normalizedProps = (
      props && typeof props === "object" ? props : {}
    ) as Props;
    root.render(renderApp({ ...normalizedProps, container }));
    rootRegistry.set(container, root);
  }

  return {
    mount(container, props) {
      render(container, props);
    },
    update(container, props) {
      render(container, props);
    },
    unmount(container) {
      const root = rootRegistry.get(container);
      if (!root) {
        return;
      }
      root.unmount();
      rootRegistry.delete(container);
    },
  };
}

export function registerGlobalReactSurfaceBridge<Props>(
  globalKey: string,
  bridge: ReactSurfaceBridge<Props>,
): ReactSurfaceBridge<Props> {
  const normalizedKey = String(globalKey || "").trim();
  if (!normalizedKey) {
    throw new Error("React surface bridge globalKey is required");
  }

  const targets = [
    typeof window !== "undefined" ? window : null,
    typeof self !== "undefined" ? self : null,
    typeof globalThis !== "undefined" ? globalThis : null,
  ];

  for (const target of targets) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      continue;
    }
    (target as Record<string, unknown>)[normalizedKey] = bridge;
  }

  return bridge;
}
