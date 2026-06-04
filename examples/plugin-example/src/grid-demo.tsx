import { useMemo, useState } from "react";
import { Action, ActionPanel, Grid } from "@uniview/example-plugin-api";
import { sampleScreenshotDataURL } from "./sample-assets";

interface GridAsset {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  keywords: string[];
}

type AssetFilter = "All Assets" | GridAsset["subtitle"];

const assets: GridAsset[] = [
  {
    id: "asset-photo",
    title: "Screenshot",
    subtitle: "Image",
    content: sampleScreenshotDataURL,
    keywords: ["image", "clipboard", "screenshot"],
  },
  {
    id: "asset-doc",
    title: "Document",
    subtitle: "Text",
    content: "doc.text",
    keywords: ["text", "file"],
  },
  {
    id: "asset-link",
    title: "Link Preview",
    subtitle: "URL",
    content: "globe",
    keywords: ["link", "url", "browser"],
  },
  {
    id: "asset-color",
    title: "Brand Color",
    subtitle: "Color",
    content: "paintpalette",
    keywords: ["color", "palette"],
  },
  {
    id: "asset-app",
    title: "Application",
    subtitle: "Source",
    content: "app.dashed",
    keywords: ["app", "source"],
  },
  {
    id: "asset-code",
    title: "Code Snippet",
    subtitle: "Swift",
    content: "chevron.left.forwardslash.chevron.right",
    keywords: ["code", "swift"],
  },
];

export default function GridDemo() {
  const [searchText, setSearchText] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<AssetFilter>("All Assets");
  const [selectedItemId, setSelectedItemId] = useState(assets[0]?.id);
  const [lastAction, setLastAction] = useState("");

  const visibleAssets = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const matchingKindAssets =
      selectedFilter === "All Assets"
        ? assets
        : assets.filter((asset) => asset.subtitle === selectedFilter);

    if (!query) return matchingKindAssets;

    return matchingKindAssets.filter((asset) =>
      [asset.title, asset.subtitle, ...asset.keywords].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [searchText, selectedFilter]);

  return (
    <Grid
      columns={4}
      searchText={searchText}
      selectedItemId={selectedItemId}
      searchBarPlaceholder="Search visual assets"
      onSearchTextChange={setSearchText}
      onSelectionChange={setSelectedItemId}
    >
      <Grid.Dropdown
        tooltip="Filter by asset type"
        value={selectedFilter}
        onChange={(value) => setSelectedFilter(value as AssetFilter)}
      >
        <Grid.Dropdown.Item value="All Assets" title="All Assets" />
        <Grid.Dropdown.Item value="Image" title="Image" icon="photo" />
        <Grid.Dropdown.Item value="Text" title="Text" icon="doc.text" />
        <Grid.Dropdown.Item value="URL" title="URL" icon="globe" />
        <Grid.Dropdown.Item value="Color" title="Color" icon="paintpalette" />
        <Grid.Dropdown.Item value="Source" title="Source" icon="app.dashed" />
        <Grid.Dropdown.Item value="Swift" title="Swift" icon="swift" />
      </Grid.Dropdown>

      <Grid.Section title="Clipboard Types">
        {visibleAssets.map((asset) => (
          <Grid.Item
            key={asset.id}
            id={asset.id}
            title={asset.title}
            subtitle={
              lastAction.startsWith(asset.id)
                ? lastAction.replace(`${asset.id}:`, "")
                : asset.subtitle
            }
            content={asset.content}
            keywords={asset.keywords}
          >
            <ActionPanel>
              <Action
                title="Copy Asset Name"
                shortcut="cmd+c"
                style="primary"
                onAction={() => setLastAction(`${asset.id}:Copied ${asset.title}`)}
              />
              <Action
                title="Open Preview"
                shortcut="return"
                onAction={() => setLastAction(`${asset.id}:Opened ${asset.title}`)}
              />
            </ActionPanel>
          </Grid.Item>
        ))}
      </Grid.Section>
    </Grid>
  );
}
