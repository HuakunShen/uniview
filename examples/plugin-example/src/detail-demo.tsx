import { useState } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Image,
} from "@uniview/example-plugin-api";
import { sampleScreenshotDataURL } from "./sample-assets";

export default function DetailDemo() {
  const [lastAction, setLastAction] = useState("No action yet");

  return (
    <Detail
      markdown={`# Screenshot Detail

This standalone Detail view mirrors commands that focus on one selected record: a captured image, a document, a clipboard item, or a task payload.

The native host renders the explicit image node as a preview, keeps the prose selectable, renders metadata in a compact table, and exposes the same action model used by List and Grid.

Last action: ${lastAction}`}
      children={
        <Image
          src={sampleScreenshotDataURL}
          alt="Screenshot preview"
          width={360}
          height={220}
        />
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Source"
            text="Google Chrome"
            icon="globe"
          />
          <Detail.Metadata.Label
            title="Content type"
            text="Image"
            icon="photo"
          />
          <Detail.Metadata.Label title="Dimensions" text="360 x 220" />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Updated" text="Today" />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title="Copy Detail"
            shortcut="cmd+c"
            style="primary"
            onAction={() => setLastAction("Copied detail")}
          />
          <Action
            title="Open Preview"
            shortcut="return"
            onAction={() => setLastAction("Opened preview")}
          />
        </ActionPanel>
      }
    />
  );
}
