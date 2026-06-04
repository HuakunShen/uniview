import { useState } from "react";
import { Action, ActionPanel, Form } from "@uniview/example-plugin-api";

export default function FormDemo() {
  const [name, setName] = useState("Clipboard History");
  const [notes, setNotes] = useState("Keep recent text, image, link, and file entries.");
  const [rememberSelection, setRememberSelection] = useState(true);
  const [defaultType, setDefaultType] = useState("text");
  const [lastSaved, setLastSaved] = useState("Not saved yet");

  return (
    <Form
      actions={
        <ActionPanel>
          <Action
            title="Save Preferences"
            shortcut="cmd+s"
            style="primary"
            onAction={() =>
              setLastSaved(
                `Saved ${name} (${defaultType}, remember=${rememberSelection})`,
              )
            }
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Command Name"
        value={name}
        placeholder="Name"
        onChange={setName}
      />
      <Form.TextArea
        id="notes"
        title="Description"
        value={`${notes}\n\n${lastSaved}`}
        placeholder="Describe the command"
        onChange={setNotes}
      />
      <Form.Checkbox
        id="remember"
        label="Remember selected clipboard type"
        value={rememberSelection}
        onChange={setRememberSelection}
      />
      <Form.Dropdown
        id="default-type"
        title="Default Clipboard Type"
        value={defaultType}
        onChange={setDefaultType}
      >
        <Form.Dropdown.Item value="text" title="Text" icon="doc" />
        <Form.Dropdown.Item value="image" title="Image" icon="photo" />
        <Form.Dropdown.Item value="link" title="Link" icon="globe" />
        <Form.Dropdown.Item value="file" title="File" icon="doc.text" />
      </Form.Dropdown>
      <Form.Separator />
      <Form.PasswordField
        id="secret"
        title="Optional Token"
        placeholder="Paste token"
      />
    </Form>
  );
}
