import { For, type JSX } from "solid-js";
import type { CellStyle, RenderNode } from "@uniview/tui-core";
import { Box, RichText, Text } from "./primitives";

/**
 * Convert a tui-core {@link RenderNode} (as produced by the content/chart
 * renderers) into Solid elements of the `box`/`richtext`/`text` host
 * primitives. The tree then flows Solid → UINode → host → cells like any other
 * plugin output — the `spans` prop is JSON-safe, so it survives the RPC
 * boundary unchanged. Mirrors `@uniview/tui-react`'s `renderNodeToElement`
 * field→prop mapping exactly (`textStyle.fg` → `color`, `background` →
 * `backgroundColor`, `style` spread last).
 */
interface NodeViewProps {
  node: RenderNode;
}

/**
 * Recursive view over one {@link RenderNode}. Dispatch order matters and
 * matches the React port: richtext → text leaf → box.
 *
 * NOTE: props are never destructured (that would break Solid's fine-grained
 * reactivity); `props.node` is read directly.
 */
function NodeView(props: NodeViewProps): JSX.Element {
  if (props.node.type === "richtext") {
    return (
      <RichText
        spans={props.node.spans ?? []}
        backgroundColor={props.node.background}
        {...(props.node.style ?? {})}
      />
    );
  }
  if (props.node.text !== undefined && (props.node.children?.length ?? 0) === 0) {
    const textStyle: CellStyle = props.node.textStyle ?? {};
    return (
      <Text
        color={textStyle.fg}
        backgroundColor={props.node.background}
        bold={textStyle.bold}
        dim={textStyle.dim}
        italic={textStyle.italic}
        underline={textStyle.underline}
        strikethrough={textStyle.strikethrough}
        inverse={textStyle.inverse}
        {...(props.node.style ?? {})}
      >
        {props.node.text}
      </Text>
    );
  }
  return (
    <Box backgroundColor={props.node.background} {...(props.node.style ?? {})}>
      <For each={props.node.children ?? []}>{(child) => <NodeView node={child} />}</For>
    </Box>
  );
}

/** Render a content/chart {@link RenderNode} as a Solid element. */
export function renderNodeToElement(node: RenderNode): JSX.Element {
  return <NodeView node={node} />;
}
