declare module "@babel/core" {
  export interface TransformAsyncOptions {
    filename: string;
    presets: unknown[];
    sourceMaps: boolean;
  }

  export interface TransformResult {
    code?: string | null;
    map?: unknown;
  }

  export function transformAsync(
    code: string,
    options: TransformAsyncOptions,
  ): Promise<TransformResult | null>;
}

declare module "@babel/preset-typescript" {
  const preset: unknown;
  export default preset;
}

declare module "babel-preset-solid" {
  const preset: unknown;
  export default preset;
}
