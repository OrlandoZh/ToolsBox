function buildToken(parts) {
  return parts.join("");
}

export const HOST_ACTION_READINESS_IDS = Object.freeze({
  readerSummary: buildToken(["reader", "-", "summary"]),
});
