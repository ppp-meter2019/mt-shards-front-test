/**
 * MVP demo strip: renders a thin bar at the very top of the page that shows
 * which backend host/worker/thread answered the last API call and which
 * Aurora shard it targeted.
 *
 * Subscribes to the api.js diagnostics pub/sub, so it updates automatically
 * after every fetch. Until the first response arrives it shows a waiting
 * placeholder.
 */

import { onDiagnostics } from "./api.js";
import { el } from "./ui.js";

export function mountDiagnosticsBar(host) {
  const bar = el("div", { class: "diagnostics-bar", id: "diagnostics-bar" });
  bar.textContent = "waiting for first API response…";
  host.append(bar);

  onDiagnostics((diag) => {
    bar.textContent = [
      `host: ${diag.servedBy || "—"}`,
      `pid: ${diag.workerPid || "—"}`,
      `thread: ${diag.threadId || "—"}`,
      `shard: ${diag.dbAlias || "—"}`,
    ].join("  ·  ");
  });

  return bar;
}
