import { useState, type ReactElement } from "react";
import { Box, LineGauge, Scrollbar, Tabs, Text, TextInput, useInput } from "@uniview/tui-react";

export interface AppHost {
  rerender: () => void;
  quit: () => void;
}

/**
 * A two-tab form exercising all four Phase 4 widgets:
 *   • Login  — a `<TextInput>` name field + a masked password field
 *   • Status — a `<LineGauge>` and a log column beside a standalone `<Scrollbar>`
 * `<Tabs>` switches panels with the arrow keys (after focusing the tablist with
 * Tab); `q` quits via Phase 3's `useInput`.
 */
export function App({ host }: { host: AppHost }): ReactElement {
  const [tab, setTab] = useState(0);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");

  useInput((input) => {
    if (input === "q") host.quit();
  });

  return (
    <Tabs
      value={tab}
      onChange={setTab}
      tabs={[
        {
          label: "Login",
          content: (
            <Box flexDirection="column">
              <Box flexDirection="row">
                <Text>Name: </Text>
                <TextInput value={name} onChange={setName} placeholder="you" />
              </Box>
              <Box flexDirection="row">
                <Text>Pass: </Text>
                <TextInput value={pw} onChange={setPw} mask placeholder="secret" />
              </Box>
            </Box>
          ),
        },
        {
          label: "Status",
          content: (
            <Box flexDirection="column">
              <LineGauge fraction={0.42} options={{ width: 20, label: "Sync" }} />
              <Box flexDirection="row">
                <Box flexDirection="column">
                  <Text>log line one</Text>
                  <Text>log line two</Text>
                  <Text>log line three</Text>
                </Box>
                <Scrollbar total={12} height={3} value={0} />
              </Box>
            </Box>
          ),
        },
      ]}
    />
  );
}
