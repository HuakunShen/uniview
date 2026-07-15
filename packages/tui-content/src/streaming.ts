export interface StreamingSplit {
  /** Completed blocks — safe to parse/render once and cache. */
  stable: string;
  /** The last, still-growing block — re-parsed on every token. */
  tail: string;
}

const FENCE = /^\s*(?:```|~~~)/;

/**
 * Split a growing Markdown stream into completed blocks (`stable`) and the
 * in-progress final block (`tail`), so a streaming renderer re-parses only the
 * tail (plan §9: "stable content + streaming tail"). A block boundary is a
 * blank line outside a code fence; an unterminated fence makes everything from
 * its opening the tail. `stable + tail` always reconstructs the input.
 */
export function splitStableMarkdown(markdown: string): StreamingSplit {
  const lines = markdown.split("\n");
  let pos = 0;
  let cut = 0;
  let fenceOpen = false;
  let fenceStart = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const lineStart = pos;
    const isFence = FENCE.test(line);
    if (isFence) {
      if (!fenceOpen) {
        fenceOpen = true;
        fenceStart = lineStart;
      } else {
        fenceOpen = false;
      }
    }
    const isLast = i === lines.length - 1;
    pos += line.length + (isLast ? 0 : 1);
    if (!isFence && !fenceOpen && line.trim() === "") {
      cut = pos;
    }
  }
  if (fenceOpen) cut = Math.min(cut, fenceStart);

  return { stable: markdown.slice(0, cut), tail: markdown.slice(cut) };
}
