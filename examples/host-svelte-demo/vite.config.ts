import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// Main-thread mode imports React plugin components directly into the browser,
// so all react imports must resolve to a single React 18 copy (required by
// react-reconciler@0.29.2). Without this, pnpm's isolated node_modules cause
// multiple React instances and "Invalid hook call" errors.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const react18 = path.resolve(
	__dirname,
	"./node_modules/react",
);

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	resolve: {
		alias: {
			react: react18,
		},
	},
});
