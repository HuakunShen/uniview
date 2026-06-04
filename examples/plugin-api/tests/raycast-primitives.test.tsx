import { describe, expect, test } from "bun:test";
import { isValidElement } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  EmptyView,
  Form,
  Grid,
  Image,
  List,
} from "../src/raycast";

describe("Raycast-style primitives", () => {
  test("List and List.Item emit serializable native node types", () => {
    const dropdown = List.Dropdown({
      value: "open",
      onChange: () => undefined,
      children: [
        List.Dropdown.Item({ value: "open", title: "Open" }),
        List.Dropdown.Item({ value: "closed", title: "Closed" }),
      ],
    });
    const item = List.Item({
      id: "issue-1",
      title: "Fix login",
      subtitle: "#123",
      accessories: ["P1", "bug"],
      keywords: ["auth", "urgent"],
    });
    const list = List({
      searchBarPlaceholder: "Search issues",
      isLoading: false,
      children: [dropdown, item],
    });

    expect(isValidElement(list)).toBe(true);
    expect(list.type).toBe("List");
    expect(list.props.searchBarPlaceholder).toBe("Search issues");
    expect(list.props.isLoading).toBe(false);
    expect(dropdown.type).toBe("ListDropdown");
    expect(dropdown.props.value).toBe("open");
    expect(dropdown.props.children[0].type).toBe("ListDropdownItem");

    expect(isValidElement(item)).toBe(true);
    expect(item.type).toBe("ListItem");
    expect(item.props).toMatchObject({
      id: "issue-1",
      title: "Fix login",
      subtitle: "#123",
      accessories: ["P1", "bug"],
      keywords: ["auth", "urgent"],
    });
  });

  test("ActionPanel, Action, Detail, and EmptyView use child-slot friendly nodes", () => {
    const action = Action({
      title: "Open",
      shortcut: "return",
      onAction: () => undefined,
    });
    const panel = ActionPanel({ children: action });
    const image = Image({
      src: "photo",
      alt: "Preview",
      width: 320,
      height: 180,
      fit: "cover",
    });
    const detail = Detail({
      markdown: "# Issue\n\nReady to inspect.",
      children: image,
      actions: panel,
    });
    const empty = EmptyView({
      title: "No issues",
      description: "Try another query",
    });

    expect(panel.type).toBe("ActionPanel");
    expect(action.type).toBe("Action");
    expect(action.props.title).toBe("Open");
    expect(action.props.shortcut).toBe("return");
    expect(image.type).toBe("img");
    expect(image.props).toMatchObject({
      src: "photo",
      alt: "Preview",
      width: 320,
      height: 180,
      fit: "cover",
    });
    expect(detail.type).toBe("Detail");
    expect(detail.props.markdown).toContain("Issue");
    expect(detail.props.children[0].type).toBe("img");
    expect(detail.props.children[1].type).toBe("ActionPanel");
    expect(empty.type).toBe("EmptyView");
    expect(empty.props.description).toBe("Try another query");
  });

  test("List.Item.Detail and metadata emit clipboard-friendly detail nodes", () => {
    const metadata = List.Item.Detail.Metadata({
      children: [
        List.Item.Detail.Metadata.Label({
          title: "Source",
          text: "Google Chrome",
          icon: "app.dashed",
        }),
        List.Item.Detail.Metadata.Separator({}),
        List.Item.Detail.Metadata.Label({
          title: "Characters",
          text: "54",
        }),
      ],
    });
    const detail = List.Item.Detail({
      markdown: "Copied clipboard text",
      metadata,
    });
    const item = List.Item({
      id: "clip-1",
      title: "Copied clipboard text",
      icon: "doc",
      children: detail,
    });
    const list = List({ isShowingDetail: true, children: item });

    expect(list.props.isShowingDetail).toBe(true);
    expect(detail.type).toBe("ListItemDetail");
    expect(metadata.type).toBe("ListItemDetailMetadata");
    expect(metadata.props.children[0].type).toBe("ListItemDetailMetadataLabel");
    expect(metadata.props.children[1].type).toBe(
      "ListItemDetailMetadataSeparator",
    );
  });

  test("Grid, Grid.Item, and Grid.Section emit image-forward native nodes", () => {
    const dropdown = Grid.Dropdown({
      value: "icons",
      children: Grid.Dropdown.Item({ value: "icons", title: "Icons" }),
    });
    const item = Grid.Item({
      id: "image-1",
      title: "Screenshot",
      subtitle: "710x452",
      content: "photo",
      keywords: ["clipboard", "image"],
    });
    const section = Grid.Section({ title: "Images", children: item });
    const grid = Grid({
      columns: 4,
      searchBarPlaceholder: "Search images",
      children: [dropdown, section],
    });

    expect(grid.type).toBe("Grid");
    expect(grid.props.columns).toBe(4);
    expect(grid.props.searchBarPlaceholder).toBe("Search images");
    expect(dropdown.type).toBe("GridDropdown");
    expect(dropdown.props.children.type).toBe("GridDropdownItem");
    expect(section.type).toBe("GridSection");
    expect(item.type).toBe("GridItem");
    expect(item.props).toMatchObject({
      id: "image-1",
      title: "Screenshot",
      subtitle: "710x452",
      content: "photo",
      keywords: ["clipboard", "image"],
    });
  });

  test("Form primitives emit native form nodes with fields and dropdown items", () => {
    const form = Form({
      actions: ActionPanel({
        children: Action({ title: "Save Preferences", shortcut: "cmd+s" }),
      }),
      children: [
        Form.TextField({
          id: "name",
          title: "Name",
          placeholder: "Extension name",
          value: "Clipboard",
          onChange: () => undefined,
        }),
        Form.TextArea({
          id: "notes",
          title: "Notes",
          placeholder: "Write a note",
        }),
        Form.Checkbox({
          id: "remember",
          label: "Remember selection",
          value: true,
          onChange: () => undefined,
        }),
        Form.Dropdown({
          id: "type",
          title: "Type",
          value: "text",
          children: [
            Form.Dropdown.Item({ value: "text", title: "Text" }),
            Form.Dropdown.Item({ value: "image", title: "Image" }),
          ],
        }),
        Form.Separator({}),
      ],
    });

    expect(form.type).toBe("Form");
    expect(form.props.children[0].type).toBe("FormTextField");
    expect(form.props.children[2].type).toBe("FormCheckbox");
    expect(form.props.children[3].type).toBe("FormDropdown");
    expect(form.props.children[3].props.children[0].type).toBe(
      "FormDropdownItem",
    );
    expect(form.props.children[5].type).toBe("ActionPanel");
    expect(new Set(form.props.children.map((child) => child.key)).size).toBe(
      form.props.children.length,
    );
  });
});
