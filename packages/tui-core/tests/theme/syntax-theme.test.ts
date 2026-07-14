import { describe, expect, it } from "vitest";
import {
  CORE_SYNTAX_SCOPES,
  defaultSyntaxTheme,
  styleForScope,
  syntaxThemes,
} from "../../src/theme/syntax-theme";

describe("syntax theme", () => {
  it("provides a foreground for every core scope", () => {
    for (const scope of CORE_SYNTAX_SCOPES) {
      expect(styleForScope(defaultSyntaxTheme, scope).fg).toBeDefined();
    }
  });

  it("distinguishes keyword from string", () => {
    expect(styleForScope(defaultSyntaxTheme, "keyword")).not.toEqual(
      styleForScope(defaultSyntaxTheme, "string"),
    );
  });

  it("renders comments as dim or italic", () => {
    const comment = styleForScope(defaultSyntaxTheme, "comment");
    expect(comment.italic === true || comment.dim === true).toBe(true);
  });

  it("falls back to the plain text style for an unmapped scope", () => {
    // "unknown" is not a mapped scope — resolver returns the theme's text base.
    expect(styleForScope(defaultSyntaxTheme, "unknown")).toEqual(
      defaultSyntaxTheme.styles.text ?? {},
    );
  });

  it("exposes a registry of named themes", () => {
    expect(syntaxThemes[defaultSyntaxTheme.name]).toBe(defaultSyntaxTheme);
    expect(Object.keys(syntaxThemes).length).toBeGreaterThanOrEqual(2);
  });
});
