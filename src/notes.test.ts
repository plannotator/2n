import { describe, expect, test } from "bun:test";

import { deriveTitle, parseDirectoryKey, parseNoteId } from "./notes.ts";

describe("note domain", () => {
  test("derives titles from the first Markdown heading", () => {
    expect(deriveTitle("intro\n\n## Product direction ##\nbody")).toBe("Product direction");
  });

  test("falls back to the first non-empty line and collapses whitespace", () => {
    expect(deriveTitle(" \n  one   two  \nlater")).toBe("one two");
  });

  test("keeps empty notes as Untitled and truncates long Unicode titles", () => {
    expect(deriveTitle("\n\t")).toBe("Untitled");
    expect(deriveTitle("# 漢字とノートの長い名前", 8)).toBe("漢字とノートの…");
  });

  test("parses only UUID v4 note IDs", () => {
    expect(parseNoteId("550e8400-e29b-41d4-a716-446655440000")._tag).toBe("ok");
    expect(parseNoteId("not-a-note")._tag).toBe("err");
  });

  test("requires absolute directory keys", () => {
    expect(parseDirectoryKey("/tmp/project")._tag).toBe("ok");
    expect(parseDirectoryKey("tmp/project")._tag).toBe("err");
  });
});
