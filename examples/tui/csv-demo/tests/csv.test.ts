import { describe, expect, it } from "vitest";
import { compileQuery, naturalCompare, parseCsv } from "../src/csv";
import { SAMPLE_CSV } from "../src/sample";

describe("parseCsv", () => {
  it("splits a simple grid into header + rows", () => {
    const { header, rows } = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(header).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const { rows } = parseCsv('h1,h2\n"a,b","she said ""hi"""\n');
    expect(rows).toEqual([["a,b", 'she said "hi"']]);
  });

  it("keeps embedded newlines inside quotes", () => {
    const { rows } = parseCsv('h\n"line1\nline2"\n');
    expect(rows).toEqual([["line1\nline2"]]);
  });

  it("tolerates CRLF and a missing trailing newline", () => {
    const { header, rows } = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(header).toEqual(["a", "b"]);
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("pads ragged rows to the header width", () => {
    const { rows } = parseCsv("a,b,c\n1,2\n");
    expect(rows).toEqual([["1", "2", ""]]);
  });

  it("parses the bundled sample into 30 rows of 5 columns", () => {
    const { header, rows } = parseCsv(SAMPLE_CSV);
    expect(header).toEqual(["rank", "city", "country", "population", "founded"]);
    expect(rows).toHaveLength(30);
    expect(rows.every((r) => r.length === 5)).toBe(true);
    expect(rows[0]).toEqual(["1", "Tokyo", "Japan", "37400068", "1457"]);
  });
});

describe("naturalCompare", () => {
  it("orders embedded numbers numerically, not lexically", () => {
    const items = ["item10", "item2", "item1"];
    expect(items.slice().sort(naturalCompare)).toEqual(["item1", "item2", "item10"]);
  });

  it("is case-insensitive on text", () => {
    expect(naturalCompare("Apple", "apple")).toBe(0);
  });

  it("compares plain text lexically", () => {
    expect(naturalCompare("alpha", "beta")).toBeLessThan(0);
  });
});

describe("compileQuery", () => {
  it("matches by regex, case-insensitively", () => {
    const pred = compileQuery("ch.na");
    expect(pred("China")).toBe(true);
    expect(pred("Japan")).toBe(false);
  });

  it("falls back to literal substring when the regex is invalid", () => {
    const pred = compileQuery("(unclosed");
    expect(pred("a (unclosed group")).toBe(true);
    expect(pred("nope")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(compileQuery("")("anything")).toBe(true);
  });
});
