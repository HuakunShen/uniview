import { useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  EmptyView,
  List,
} from "@uniview/example-plugin-api";

interface Issue {
  id: string;
  title: string;
  subtitle: string;
  priority: string;
  keywords: string[];
  detail: string;
}

const issues: Issue[] = [
  {
    id: "issue-login",
    title: "Fix login redirect",
    subtitle: "#128 in Web App",
    priority: "P1",
    keywords: ["auth", "redirect", "urgent"],
    detail:
      "# Fix login redirect\n\nUsers should return to the original route after signing in.\n\nStatus: Ready for implementation",
  },
  {
    id: "issue-sync",
    title: "Audit plugin bridge reconnects",
    subtitle: "#142 in Runtime",
    priority: "P2",
    keywords: ["bridge", "websocket", "runtime"],
    detail:
      "# Audit plugin bridge reconnects\n\nVerify reconnect behavior for long-running Node plugins and host restarts.",
  },
  {
    id: "issue-native",
    title: "Polish native command list",
    subtitle: "#151 in macOS Host",
    priority: "P2",
    keywords: ["mac", "command", "native"],
    detail:
      "# Polish native command list\n\nAdd keyboard actions, empty states, and action panel behavior to the AppKit host.",
  },
];

export default function RaycastDemo() {
  const [searchText, setSearchText] = useState("");
  const [selectedItemId, setSelectedItemId] = useState(issues[0]?.id);
  const [lastAction, setLastAction] = useState("No action yet");

  const visibleIssues = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return issues;

    return issues.filter((issue) =>
      [issue.title, issue.subtitle, issue.priority, ...issue.keywords].some(
        (value) => value.toLowerCase().includes(query),
      ),
    );
  }, [searchText]);

  return (
    <List
      searchText={searchText}
      selectedItemId={selectedItemId}
      searchBarPlaceholder="Search issues"
      onSearchTextChange={setSearchText}
      onSelectionChange={setSelectedItemId}
    >
      {visibleIssues.length === 0 && (
        <EmptyView
          title="No matching issues"
          description="Try a different project, title, or priority"
          icon="magnifyingglass"
        />
      )}

      <List.Section title="Issues">
        {visibleIssues.map((issue) => (
          <List.Item
            key={issue.id}
            id={issue.id}
            title={issue.title}
            subtitle={issue.subtitle}
            icon="doc.text.magnifyingglass"
            accessories={[issue.priority]}
            keywords={issue.keywords}
          >
            <Detail markdown={`${issue.detail}\n\nLast action: ${lastAction}`} />
            <ActionPanel>
              <Action
                title="Open Issue"
                shortcut="return"
                style="primary"
                onAction={() => setLastAction(`Opened ${issue.id}`)}
              />
              <Action
                title="Copy ID"
                shortcut="cmd+c"
                onAction={() => setLastAction(`Copied ${issue.id}`)}
              />
            </ActionPanel>
          </List.Item>
        ))}
      </List.Section>
    </List>
  );
}
