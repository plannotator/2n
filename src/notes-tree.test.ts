import { describe, expect, test } from "bun:test";

import {
  createBlankNote,
  parseDirectoryKey,
  withSavedBody,
  type DirectoryAssociation,
  type Note,
} from "./notes.ts";
import { buildNotesTree } from "./notes-tree.ts";

describe("notes tree", () => {
  test("projects directories into branches and separates missing paths", () => {
    const current = association("/home/me/oss/2n");
    const sibling = association("/home/me/oss/opentui");
    const missing = association("/home/me/old");
    const notes = [
      note(current, "# TUINotes", 4),
      note(sibling, "Renderer", 3),
      note(missing, "Migration", 2),
    ];

    const rows = buildNotesTree({
      notes,
      currentDirectoryKey: current.key,
      collapsed: new Set(),
      homeDirectory: "/home/me",
      directoryExists: (path) => path !== missing.path,
    });

    expect(rows.map((row) => row.label)).toEqual([
      "~",
      "oss",
      "2n",
      "TUINotes",
      "opentui",
      "Renderer",
      "Orphans",
      "~/old",
      "Migration",
    ]);
    const lastRow = rows.at(-1);
    expect(lastRow?._tag === "note" && lastRow.orphan).toBe(true);
  });

  test("collapsed branches hide descendants", () => {
    const directory = association("/home/me/project");
    const rows = buildNotesTree({
      notes: [note(directory, "A", 1)],
      currentDirectoryKey: directory.key,
      collapsed: new Set(["dir:/~"]),
      homeDirectory: "/home/me",
      directoryExists: () => true,
    });
    expect(rows.map((row) => row.label)).toEqual(["~"]);
  });
});

function note(directory: DirectoryAssociation, body: string, updatedAtMs: number): Note {
  return withSavedBody(createBlankNote(directory, 1), body, updatedAtMs);
}

function association(path: string): DirectoryAssociation {
  const key = parseDirectoryKey(path);
  if (key._tag === "err") {
    throw key.error;
  }
  return { key: key.value, path };
}
