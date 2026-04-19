import { createSurfaceDescriptors as createProtectedSurfaceDescriptors } from "./surface-descriptors-protected.js";

export function createSurfaceDescriptors(config = {}) {
  const descriptors = createProtectedSurfaceDescriptors(config);
  return Object.freeze({
    ...descriptors,
    preferenceBindingMode: "bridge",
  });
}
