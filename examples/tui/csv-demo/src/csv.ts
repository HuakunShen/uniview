/**
 * A small, dependency-free CSV core: an RFC-4180-ish parser (quoted fields,
 * escaped `""`, CRLF) and a natural-order comparator (so `file10` sorts after
 * `file9`). Both pure and unit-tested — the same split csvlens draws between its
 * `csv` reader and `sort::natural_cmp`.
 */

export interface CsvData {
  header: string[];
  rows: string[][];
}

/** Parse CSV text into a header row + data rows. Tolerates quotes and CRLF. */
export function parseCsv(text: string): CsvData {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let started = false; // did the current record get any content/field yet?

  const endField = (): void => {
    record.push(field);
    field = "";
  };
  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
    started = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    started = true;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRecord();
    } else if (ch === "\r") {
      // swallow — a following \n ends the record; a lone \r also ends it
      if (text[i + 1] !== "\n") endRecord();
    } else {
      field += ch;
    }
  }
  // Flush a trailing field/record when the text doesn't end in a newline.
  if (started || field.length > 0 || record.length > 0) endRecord();

  const header = records.shift() ?? [];
  // Normalize ragged rows to the header's column count.
  const width = header.length;
  const rows = records
    .filter((r) => !(r.length === 1 && r[0] === "")) // drop blank trailing line
    .map((r) => {
      const out = r.slice(0, width);
      while (out.length < width) out.push("");
      return out;
    });
  return { header, rows };
}

/**
 * Natural comparison: compare digit runs numerically and everything else
 * lexically, case-insensitively. `"item2" < "item10"`, unlike a raw string
 * compare. Non-numeric-aware and stable for equal keys.
 */
export function naturalCompare(a: string, b: string): number {
  const ax = chunk(a);
  const bx = chunk(b);
  const n = Math.min(ax.length, bx.length);
  for (let i = 0; i < n; i += 1) {
    const av = ax[i]!;
    const bv = bx[i]!;
    if (av.num !== null && bv.num !== null) {
      if (av.num !== bv.num) return av.num - bv.num;
    } else {
      const cmp = av.text.localeCompare(bv.text, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp;
    }
  }
  return ax.length - bx.length;
}

interface Chunk {
  text: string;
  num: number | null;
}

/** Split a string into alternating numeric / non-numeric chunks. */
function chunk(s: string): Chunk[] {
  const out: Chunk[] = [];
  const re = /(\d+)|(\D+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) out.push({ text: m[1], num: Number(m[1]) });
    else out.push({ text: m[2]!, num: null });
  }
  return out;
}

/** Compile a case-insensitive regex; falls back to a literal-substring match if invalid. */
export function compileQuery(query: string): (text: string) => boolean {
  if (query === "") return () => true;
  try {
    const re = new RegExp(query, "i");
    return (text) => re.test(text);
  } catch {
    const needle = query.toLowerCase();
    return (text) => text.toLowerCase().includes(needle);
  }
}
