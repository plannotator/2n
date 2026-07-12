import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createBlankNote,
  parseDirectoryKey,
  withSavedBody,
  type DirectoryAssociation,
} from "./notes.ts";
import { NoteStore } from "./note-store.ts";

const temporaryDirectories: Array<string> = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite note store", () => {
  test("creates, loads, updates, moves, lists, and deletes notes", () => {
    const { store } = openTemporaryStore();
    const firstDirectory = association("/tmp/first");
    const secondDirectory = association("/tmp/second");
    const draft = createBlankNote(firstDirectory, 100);
    const note = withSavedBody(draft, "# Hello\nworld", 200);

    expect(store.saveNote({ note })._tag).toBe("ok");
    expect(store.loadRecent(firstDirectory.key)).toEqual({ _tag: "ok", value: note });
    expect(store.moveNote(note.id, secondDirectory, 300)._tag).toBe("ok");
    const listed = store.listNotes();
    expect(listed._tag).toBe("ok");
    expect(listed._tag === "ok" && listed.value[0]?.directory).toEqual(secondDirectory);
    expect(store.deleteNote(note.id)._tag).toBe("ok");
    expect(store.listNotes()).toEqual({ _tag: "ok", value: [] });
    store.close();
  });

  test("persists the launch animation preference", () => {
    const { store } = openTemporaryStore();
    expect(store.getAnimationEnabled()).toEqual({ _tag: "ok", value: true });
    expect(store.setAnimationEnabled(false)._tag).toBe("ok");
    expect(store.getAnimationEnabled()).toEqual({ _tag: "ok", value: false });
    store.close();
  });

  test("rejects invalid stored rows at the persistence boundary", () => {
    const { store, databasePath } = openTemporaryStore();
    const database = new Database(databasePath, { strict: true });
    database
      .query(
        `INSERT INTO notes (
          id, directory_key, directory_path, body, title,
          created_at_ms, updated_at_ms, last_opened_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("bad-id", "/tmp/project", "/tmp/project", "secret body", "Title", 1, 1, 1);
    database.close();

    const result = store.listNotes();
    expect(result._tag).toBe("err");
    expect(result._tag === "err" && result.error.message.includes("secret body")).toBe(false);
    store.close();
  });
});

function openTemporaryStore(): { readonly store: NoteStore; readonly databasePath: string } {
  const directory = mkdtempSync(join(tmpdir(), "tuinotes-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "notes.sqlite3");
  const opened = NoteStore.openAt(databasePath);
  if (opened._tag === "err") {
    throw opened.error;
  }
  return { store: opened.value, databasePath };
}

function association(path: string): DirectoryAssociation {
  const key = parseDirectoryKey(path);
  if (key._tag === "err") {
    throw key.error;
  }
  return { key: key.value, path };
}
