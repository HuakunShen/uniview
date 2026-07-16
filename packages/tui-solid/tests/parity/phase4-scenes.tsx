import { Scrollbar } from "../../src/interactive";
import { LineGauge } from "../../src/charts";
import { TextInput } from "../../src/text-input";
import { Tabs } from "../../src/tabs";

/** Solid-JSX scenes for the Phase 4 React-vs-Solid byte-identical SVG parity checks. */
export const solidScrollbar = () => <Scrollbar total={20} height={10} value={4} />;
export const solidLineGauge = () => <LineGauge fraction={0.6} options={{ width: 10, label: "Load" }} />;
export const solidTextInput = () => <TextInput value="hi" onChange={() => {}} />;
export const solidTabs = () => (
  <Tabs
    value={0}
    onChange={() => {}}
    tabs={[
      { label: "One", content: <text>panel-one</text> },
      { label: "Two", content: <text>panel-two</text> },
    ]}
  />
);
