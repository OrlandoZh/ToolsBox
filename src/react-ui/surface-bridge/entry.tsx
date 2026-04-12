import {
  createReactSurfaceRendererBridge,
  registerGlobalReactSurfaceBridge,
} from "../shared/renderer-bridge";

type TemplateReactSurfaceProps = {
  addonRef?: string;
  addonName?: string;
  title?: string;
  message?: string;
  statusText?: string | null;
  items?: string[];
  surfaceVariant?: "host-pane" | "floating-panel" | "standalone-window" | string;
};

function normalizeItems(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function SurfaceBridgeApp(
  props: TemplateReactSurfaceProps & { container: HTMLElement },
) {
  const items = normalizeItems(props.items);
  const addonName = String(props.addonName || "").trim() || "Cleanroom Template";
  const addonRef = String(props.addonRef || "").trim() || "cleanroomtemplate";
  const title = String(props.title || "").trim() || `${addonName} React Surface`;
  const message = String(props.message || "").trim()
    || "This host-mounted renderer stays product-neutral. Keep the JS core in charge of host lifecycle, and let the optional React lane own only the mounted component tree.";
  const variant = String(props.surfaceVariant || "").trim() || "host-pane";
  const statusText = String(props.statusText || "").trim() || null;

  return (
    <section
      className="react-surface-bridge-shell"
      data-surface-variant={variant}
      data-addon-ref={addonRef}
    >
      <header className="react-surface-bridge-header">
        <p className="react-surface-bridge-eyebrow">Host-Mounted React Surface</p>
        <h1>{title}</h1>
        <p className="react-surface-bridge-copy">{message}</p>
      </header>
      <dl className="react-surface-bridge-meta">
        <div>
          <dt>Variant</dt>
          <dd>{variant}</dd>
        </div>
        <div>
          <dt>addonRef</dt>
          <dd>{addonRef}</dd>
        </div>
        {statusText ? (
          <div>
            <dt>Status</dt>
            <dd>{statusText}</dd>
          </div>
        ) : null}
      </dl>
      <ul className="react-surface-bridge-list">
        <li>JS core owns host lifecycle, geometry, and evidence contracts.</li>
        <li>React lane stays optional and reusable through a global renderer bridge.</li>
        <li>Switching between docked, floating, and standalone shells should reuse the same mounted surface state.</li>
      </ul>
      {items.length > 0 ? (
        <aside className="react-surface-bridge-items">
          <strong>Context Items</strong>
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </section>
  );
}

const rendererBridge = createReactSurfaceRendererBridge<TemplateReactSurfaceProps>((props) => (
  <SurfaceBridgeApp {...props} />
));

registerGlobalReactSurfaceBridge("__CleanroomTemplateReactSurface__", rendererBridge);
