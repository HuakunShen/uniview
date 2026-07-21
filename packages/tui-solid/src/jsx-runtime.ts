import type { JSX as SolidJSX } from "solid-js";

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      // The SolidJSX reference keeps this a module augmentation when tsdown
      // bundles declarations; the union remains an intentionally loose type.
      [tag: string]: unknown | SolidJSX.Element;
    }
  }
}

export {};
