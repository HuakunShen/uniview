export { toOpenTuiDescriptor } from "./mapping";
export type {
  OpenTuiDescriptor,
  OpenTuiBoxDescriptor,
  OpenTuiTextDescriptor,
} from "./mapping";
export { mountDescriptor } from "./mount";
export type { OpenTuiApi, OpenTuiNode } from "./mount";
export { charFrameToBuffer } from "./capture";
export {
  createOpenTuiBackend,
  createOpenTuiBackendFromDeps,
  isOpenTuiAvailable,
  OpenTuiUnavailableError,
} from "./backend";
export type { OpenTuiRenderDeps, OpenTuiBackendOptions } from "./backend";
