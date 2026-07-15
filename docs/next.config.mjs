import { createMDX } from "fumadocs-mdx/next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const withMDX = createMDX();
const docsDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  basePath: "/uniview",
  trailingSlash: true,
  reactStrictMode: true,
  // Static export cannot run the default image optimizer. The terminal captures
  // are SVG anyway — already vector, nothing to optimize — and this is what lets
  // `next/image` still resolve them against the basePath.
  images: { unoptimized: true },
  webpack(config, { webpack }) {
    config.plugins ??= [];
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^fumadocs-mdx:collections\/(browser|dynamic|server)$/,
        (resource) => {
          const collectionName = resource.request.split("/").pop();
          if (!collectionName) return;
          resource.request = path.join(docsDir, `.source/${collectionName}.ts`);
        },
      ),
    );
    return config;
  },
};

export default withMDX(config);
