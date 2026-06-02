import { Fragment } from "react";
import { describe, expect, test } from "vitest";
import { Box, Button, Input, Newline, Text, createTuiRoot } from "../src";

describe("tui renderer components", () => {
  test("creates React elements for terminal primitives", () => {
    expect(Box({ children: "content", gap: 1, padding: 2 })).toMatchObject({
      type: "Box",
      props: {
        children: "content",
        gap: 1,
        padding: 2,
      },
    });
    expect(
      Text({ children: "label", color: "cyan", bold: true }),
    ).toMatchObject({
      type: "Text",
      props: {
        children: "label",
        color: "cyan",
        bold: true,
      },
    });
    expect(Button({ children: "Run", disabled: true })).toMatchObject({
      type: "Button",
      props: {
        children: "Run",
        disabled: true,
      },
    });
    expect(Input({ value: "typed", placeholder: "name" })).toMatchObject({
      type: "Input",
      props: {
        value: "typed",
        placeholder: "name",
      },
    });
  });

  test("expands Newline count into terminal newline primitives", () => {
    expect(Newline({ count: 3 })).toMatchObject({
      type: Fragment,
      props: {
        children: [
          { type: "Newline" },
          { type: "Newline" },
          { type: "Newline" },
        ],
      },
    });
  });

  test("exposes a root factory", () => {
    expect(createTuiRoot).toBeDefined();
  });
});
