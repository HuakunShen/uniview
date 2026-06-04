import { useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  EmptyView,
  Image,
  List,
} from "@uniview/example-plugin-api";
import { sampleScreenshotDataURL } from "./sample-assets";

type ClipboardType = "Text" | "Image" | "Link" | "File";
type ClipboardFilter = ClipboardType | "All Types";

interface ClipboardEntry {
  id: string;
  type: ClipboardType;
  title: string;
  subtitle: string;
  content: string;
  image?: string;
  source: string;
  icon: string;
  keywords: string[];
  characters?: number;
  words?: number;
}

const entries: ClipboardEntry[] = [
  {
    id: "clip-note-1",
    type: "Text",
    title: "然后帮我把那个enter full screen和keep screen on这两个都关掉吧",
    subtitle: "Google Chrome - 14:07",
    content:
      "然后帮我把那个enter full screen和keep screen on这两个都关掉吧，都直接删掉就好",
    source: "Google Chrome",
    icon: "doc",
    keywords: ["screen", "chrome", "text"],
    characters: 54,
    words: 6,
  },
  {
    id: "clip-image-1",
    type: "Image",
    title: "Image (710x452)",
    subtitle: "Screenshot - Today",
    content: "A copied screenshot from a compact command window.",
    image: sampleScreenshotDataURL,
    source: "Screen Capture",
    icon: "photo",
    keywords: ["image", "screenshot", "clipboard"],
  },
  {
    id: "clip-link-1",
    type: "Link",
    title: "https://chromewebstore.google.com/detail/...",
    subtitle: "Google Chrome - Today",
    content: "https://chromewebstore.google.com/detail/example-extension",
    source: "Google Chrome",
    icon: "globe",
    keywords: ["chrome", "link", "url"],
    characters: 58,
    words: 1,
  },
  {
    id: "clip-file-1",
    type: "File",
    title: "in [CrossCopy]/apps/mac/CrossCopyApp.swift",
    subtitle: "Finder - Yesterday",
    content: "/Users/hk/Dev/CrossCopy/apps/mac/CrossCopyApp.swift",
    source: "Finder",
    icon: "doc.text",
    keywords: ["file", "swift", "finder"],
  },
];

export default function ClipboardHistoryDemo() {
  const [searchText, setSearchText] = useState("");
  const [selectedType, setSelectedType] =
    useState<ClipboardFilter>("All Types");
  const [selectedItemId, setSelectedItemId] = useState(entries[0]?.id);
  const [lastAction, setLastAction] = useState("Ready");

  const visibleEntries = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const matchingTypeEntries =
      selectedType === "All Types"
        ? entries
        : entries.filter((entry) => entry.type === selectedType);

    if (!query) return matchingTypeEntries;

    return matchingTypeEntries.filter((entry) =>
      [
        entry.title,
        entry.subtitle,
        entry.type,
        entry.source,
        ...entry.keywords,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [searchText, selectedType]);

  return (
    <List
      isShowingDetail
      searchText={searchText}
      selectedItemId={selectedItemId}
      searchBarPlaceholder="Type to filter entries..."
      onSearchTextChange={setSearchText}
      onSelectionChange={setSelectedItemId}
    >
      <List.Dropdown
        tooltip="Filter by content type"
        value={selectedType}
        onChange={(value) => setSelectedType(value as ClipboardFilter)}
      >
        <List.Dropdown.Item value="All Types" title="All Types" />
        <List.Dropdown.Item value="Text" title="Text" icon="doc" />
        <List.Dropdown.Item value="Image" title="Image" icon="photo" />
        <List.Dropdown.Item value="Link" title="Link" icon="globe" />
        <List.Dropdown.Item value="File" title="File" icon="doc.text" />
      </List.Dropdown>

      {visibleEntries.length === 0 && (
        <EmptyView
          title="No clipboard entries"
          description="Try another type, source, or phrase"
          icon="clipboard"
        />
      )}

      <List.Section title="Today">
        {visibleEntries.map((entry) => (
          <List.Item
            key={entry.id}
            id={entry.id}
            title={entry.title}
            subtitle={entry.subtitle}
            icon={entry.icon}
            accessories={[entry.type]}
            keywords={entry.keywords}
          >
            <List.Item.Detail
              markdown={`${entry.content}\n\nLast action: ${lastAction}`}
            >
              {entry.image && (
                <Image
                  src={entry.image}
                  alt={entry.title}
                  width={360}
                  height={220}
                />
              )}
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label
                  title="Source"
                  text={entry.source}
                  icon={entry.source === "Google Chrome" ? "globe" : entry.icon}
                />
                <List.Item.Detail.Metadata.Separator />
                <List.Item.Detail.Metadata.Label
                  title="Content type"
                  text={entry.type}
                />
                {entry.characters != null && (
                  <List.Item.Detail.Metadata.Label
                    title="Characters"
                    text={String(entry.characters)}
                  />
                )}
                {entry.words != null && (
                  <List.Item.Detail.Metadata.Label
                    title="Words"
                    text={String(entry.words)}
                  />
                )}
              </List.Item.Detail.Metadata>
            </List.Item.Detail>
            <ActionPanel>
              <Action
                title="Paste to Codex"
                shortcut="return"
                style="primary"
                onAction={() => setLastAction(`Pasted ${entry.id}`)}
              />
              <Action
                title="Copy to Clipboard"
                shortcut="cmd+return"
                onAction={() => setLastAction(`Copied ${entry.id}`)}
              />
              <Action
                title="Pin Entry"
                shortcut="cmd+shift+p"
                onAction={() => setLastAction(`Pinned ${entry.id}`)}
              />
            </ActionPanel>
          </List.Item>
        ))}
      </List.Section>
    </List>
  );
}
