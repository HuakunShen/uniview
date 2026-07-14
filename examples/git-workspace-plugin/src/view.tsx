import { useEffect, useState, type ReactElement } from "react";
import { Box, Text } from "@uniview/tui-react";
import type { GitWorkspaceModel } from "./model";

/**
 * A keyboard-first TUI view over the shared {@link GitWorkspaceModel}, authored
 * in JSX. It reads the model's state and issues commands; the same model can
 * back a Web or native view. Rendered to a terminal via @uniview/tui-react.
 */
function Button({ name, onClick }: { name: string; onClick: () => void }): ReactElement {
  // A button hugs its label and shows blue behind it. alignSelf="start" stops a
  // column's default align-items: stretch from bleeding the fill across the
  // whole row; the label's transparent background composites over the box fill.
  return (
    <Box name={name} onClick={onClick} backgroundColor="blue" alignSelf="start">
      <Text color="white">{`[ ${name} ]`}</Text>
    </Box>
  );
}

export function GitWorkspaceTui({ model }: { model: GitWorkspaceModel }): ReactElement {
  const [, bump] = useState(0);
  useEffect(() => model.subscribe(() => bump((n) => n + 1)), [model]);

  const state = model.getState();

  return (
    <Box flexDirection="column" padding={1} gap={0}>
      <Text color="cyan" bold>{`Git — ${state.branch}`}</Text>
      <Text role="status">{state.statusLine}</Text>
      <Button name="Refresh" onClick={() => model.refresh()} />
      {state.files.map((file) => (
        <Box key={file.path} flexDirection="row" gap={1}>
          <Text>{`${file.status === "staged" ? "●" : "○"} ${file.path}`}</Text>
          <Button name={`Stage ${file.path}`} onClick={() => model.stage(file.path)} />
        </Box>
      ))}
    </Box>
  );
}
