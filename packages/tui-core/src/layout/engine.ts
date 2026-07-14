import { computeLayout, type LayoutInput, type LayoutResult } from "./layout";
import type { Size } from "../surface/types";

/**
 * A pluggable layout engine. The default {@link customLayoutEngine} is the
 * built-in pure-TS flexbox; alternative engines (e.g. a Yoga adapter) implement
 * the same interface so hosts can swap correctness/portability trade-offs.
 */
export interface LayoutEngine {
  computeLayout(root: LayoutInput, container: Size): LayoutResult;
}

/** The built-in flexbox engine (no dependencies; runs in Worker/Deno/Bun). */
export const customLayoutEngine: LayoutEngine = { computeLayout };
