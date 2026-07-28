import { Buffer } from "node:buffer";
import { DEFAULT_MAX_CLIPBOARD_BYTES } from "../selection/text-selection";

export { DEFAULT_MAX_CLIPBOARD_BYTES };

export function encodeOsc52Clipboard(
  text: string,
  maxBytes = DEFAULT_MAX_CLIPBOARD_BYTES,
): string {
  if (text.length === 0) {
    throw new Error("Cannot copy empty text with OSC 52");
  }
  const utf8 = Buffer.from(text, "utf8");
  if (utf8.byteLength > maxBytes) {
    throw new Error(
      `OSC 52 clipboard payload is ${utf8.byteLength} bytes, exceeding the ${maxBytes} bytes limit`,
    );
  }
  return `\u001b]52;c;${utf8.toString("base64")}\u0007`;
}
