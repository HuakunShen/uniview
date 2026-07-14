import { createElement } from "react";
import type { ReactElement } from "react";

export interface IconProps {
  /**
   * An SF Symbol name — `"house"`, `"square.grid.2x2"`, `"bolt.fill"`.
   *
   * Named, not drawn: the glyph is the system's, so it carries the weight, the
   * optical size and the localisation the OS gives it, and it changes when the OS
   * does. Shipping our own icon set would look the same on day one and wrong on
   * the next release.
   */
  symbol: string;
  className?: string;
}

export function Icon({ symbol, className }: IconProps): ReactElement {
  return createElement("Icon", { symbol, className });
}
