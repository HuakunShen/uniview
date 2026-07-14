import { createMemo, For, Show, splitProps, type JSX } from "solid-js";
import {
  detectLanguage,
  renderCode,
  renderDiff,
  renderMarkdown,
  splitStableMarkdown,
  type RenderCodeOptions,
  type RenderDiffOptions,
  type RenderMarkdownOptions,
} from "@uniview/tui-content";
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

export interface MarkdownProps extends RenderMarkdownOptions {
  content: string;
}

/**
 * Render Markdown to the terminal: headings, lists, quotes, tables, inline
 * emphasis/code/links and syntax-highlighted fenced code. The parse runs in a
 * `createMemo`, so unchanged content is not re-parsed — this is what makes the
 * streaming reuse below possible (React gets the same property from `memo`).
 */
export function Markdown(props: MarkdownProps): JSX.Element {
  const [local, options] = splitProps(props, ["content"]);
  const node = createMemo(() => renderMarkdown(local.content, { ...options }));
  return <>{renderNodeToElement(node())}</>;
}

export interface StreamingMarkdownProps extends RenderMarkdownOptions {
  content: string;
}

/**
 * Streaming Markdown for AI output. Splits the growing text into the
 * already-complete blocks and the in-progress tail, so an incoming token only
 * re-parses the small tail.
 *
 * `stable` and `tail` are their own memos on purpose. `splitStableMarkdown`
 * returns a fresh object every call, so subscribing straight to it would push a
 * new value on every token and re-parse the whole completed document. Narrowing
 * to the two strings lets `createMemo`'s `===` check stop the unchanged prefix
 * from propagating — the Solid equivalent of React's memoized stable subtree.
 */
export function StreamingMarkdown(props: StreamingMarkdownProps): JSX.Element {
  const [local, options] = splitProps(props, ["content"]);
  const split = createMemo(() => splitStableMarkdown(local.content));
  const stable = createMemo(() => split().stable);
  const tail = createMemo(() => split().tail);
  return (
    <Box flexDirection="column">
      <Show when={stable().length > 0}>
        <Markdown content={stable()} {...options} />
      </Show>
      <Show when={tail().length > 0}>
        <Markdown content={tail()} {...options} />
      </Show>
    </Box>
  );
}

export interface CodeProps extends RenderCodeOptions {
  content: string;
  /** Language id; if omitted, inferred from `filename`. */
  language?: string;
  /** File name used to infer the language when `language` is not given. */
  filename?: string;
}

/**
 * Render syntax-highlighted code. `language` wins; otherwise the language is
 * detected from `filename`.
 */
export function Code(props: CodeProps): JSX.Element {
  const [local, options] = splitProps(props, ["content", "language", "filename"]);
  const node = createMemo(() => {
    const rest = { ...options };
    const lang = local.language ?? (local.filename ? detectLanguage(local.filename) : rest.lang);
    return renderCode(local.content, { ...rest, lang });
  });
  return <>{renderNodeToElement(node())}</>;
}

export interface DiffProps extends RenderDiffOptions {
  patch: string;
  /** Language id for the diff content. */
  language?: string;
}

/** Render a unified diff with gutters, sign column, highlight and bands. */
export function Diff(props: DiffProps): JSX.Element {
  const [local, options] = splitProps(props, ["patch", "language"]);
  const node = createMemo(() => {
    const rest = { ...options };
    return renderDiff(local.patch, { ...rest, lang: local.language ?? rest.lang });
  });
  return <>{renderNodeToElement(node())}</>;
}
