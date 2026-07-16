import { PNG } from "pngjs";
import type { RgbaImage } from "@uniview/tui-core";

/**
 * Decode an image file (PNG/JPEG/WebP/AVIF/HEIC/…) to a raw {@link RgbaImage},
 * using Bun's built-in `Bun.Image` — no native `sharp` dependency, runs under
 * `bun`. `Bun.Image` decodes any format it supports and re-encodes to PNG;
 * `pngjs` then expands that to raw RGBA (always 4 channels, so the buffer is
 * exactly `width * height * 4`). The renderer itself never touches a codec —
 * this is the Node/Bun **bridge** decode path from the README.
 */
export async function decodeImageFile(path: string): Promise<RgbaImage> {
  const pngBytes = await new Bun.Image(path).png().bytes();
  const png = PNG.sync.read(Buffer.from(pngBytes));
  return { data: png.data, width: png.width, height: png.height };
}
