import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  basePath: "/uniview",
  trailingSlash: true,
  reactStrictMode: true,
};

export default withMDX(config);
