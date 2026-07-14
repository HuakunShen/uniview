import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { GitWorkspaceModel } from "./model";

/**
 * A keyboard-first TUI view over the shared {@link GitWorkspaceModel}. It reads
 * the model's state and issues commands; the same model can back a Web or
 * native view. Rendered to a terminal via @uniview/tui-react.
 */
export function GitWorkspaceTui({ model }: { model: GitWorkspaceModel }): ReactElement {
  const [, bump] = useState(0);
  useEffect(() => model.subscribe(() => bump((n) => n + 1)), [model]);

  const state = model.getState();

  const button = (name: string, onClick: () => void): ReactElement =>
    h("box", { name, onClick, backgroundColor: "blue" }, h("text", { color: "white" }, `[ ${name} ]`));

  return h(
    "box",
    { flexDirection: "column", padding: 1, gap: 0 },
    h("text", { color: "cyan", bold: true }, `Git — ${state.branch}`),
    h("text", { role: "status" }, state.statusLine),
    button("Refresh", () => model.refresh()),
    ...state.files.map((file) =>
      h(
        "box",
        { flexDirection: "row", gap: 1, key: file.path },
        h("text", null, `${file.status === "staged" ? "●" : "○"} ${file.path}`),
        button(`Stage ${file.path}`, () => model.stage(file.path)),
      ),
    ),
  );
}
