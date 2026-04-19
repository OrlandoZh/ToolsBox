import React from "react";
import { createRoot } from "react-dom/client";

type ShellContext = {
  addonRef: string;
  addonName: string;
};

function readShellContext(rootElement: HTMLElement): ShellContext {
  const documentElement = rootElement.ownerDocument?.documentElement;
  return {
    addonRef: documentElement?.getAttribute("data-addon-ref")
      || rootElement.dataset.addonRef
      || "tool",
    addonName: documentElement?.getAttribute("data-addon-name")
      || rootElement.dataset.addonName
      || "Tool",
  };
}

function App({ context }: { context: ShellContext }) {
  return (
    <main className="react-ui-demo-shell">
      <header className="react-ui-demo-header">
        <p className="react-ui-demo-eyebrow">Optional Bundle</p>
        <h1>{context.addonName} React UI Demo</h1>
        <p className="react-ui-demo-copy">
          This standalone window is intentionally product-neutral. It shows how a downstream
          project can keep the template core in plain JS while isolating a React/TS lane behind
          an opt-in bundle contract, then reuse the same lane for host-mounted surface bridges.
        </p>
      </header>
      <section className="react-ui-demo-grid">
        <article>
          <h2>Lane Contract</h2>
          <ul>
            <li>Default disabled</li>
            <li>Built only through build:react-ui</li>
            <li>Ships both a window shell and a host-mounted renderer bridge</li>
          </ul>
        </article>
        <article>
          <h2>Context Governance</h2>
          <ul>
            <li>JS core keeps host/runtime truth</li>
            <li>Bundle surface stays opt-in and isolated</li>
            <li>Future agent lanes should reuse compact truth refs</li>
          </ul>
        </article>
      </section>
      <footer className="react-ui-demo-footer">
        <span>addonRef: {context.addonRef}</span>
      </footer>
    </main>
  );
}

function mount() {
  const rootElement = document.getElementById("react-ui-demo-root");
  if (!(rootElement instanceof HTMLElement)) {
    return;
  }

  const root = createRoot(rootElement);
  root.render(<App context={readShellContext(rootElement)} />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
