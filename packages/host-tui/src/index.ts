export { MutableTree } from "./mutable-tree";
export { uinodeToRenderNode, extractHandlers } from "./convert";
export { TuiHost } from "./tui-host";
export type { TuiHostOptions } from "./tui-host";
export { InputRouter } from "./input-router";
export { createControllerHost } from "./controller-host";
export type {
  RemoteController,
  ControllerHost,
  ControllerHostOptions,
} from "./controller-host";
export {
  buildSemanticTree,
  queryByRole,
  queryByText,
  queryById,
} from "./semantics";
export type { SemanticNode, RoleQuery } from "./semantics";
export { AutomationSession } from "./automation";
export type {
  SemanticTarget,
  NodeAssertion,
  RecordedAction,
  AutomationTrace,
  WaitOptions,
} from "./automation";
export {
  executeAction,
  runTrace,
  AUTOMATION_PROTOCOL_VERSION,
} from "./automation-runner";
export type {
  AutomationActionJson,
  SemanticTargetJson,
  AutomationErrorCode,
  ActionResult,
} from "./automation-runner";
