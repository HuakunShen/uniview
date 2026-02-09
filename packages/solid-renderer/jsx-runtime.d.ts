import type { JSX as SolidJSX } from "solid-js";
import type { UILayoutTag } from "@uniview/protocol";

type LayoutTagElements = {
	[K in UILayoutTag]: Record<string, unknown>;
};

declare module "solid-js" {
	namespace JSX {
		interface IntrinsicElements extends LayoutTagElements {
			[tag: string]: Record<string, unknown>;
		}
	}
}

export {};
