import { describe, expect, test } from "bun:test";

import { Autosave, systemAutosaveRuntime, type SaveState } from "./autosave.ts";
import { createBlankNote, parseDirectoryKey, type Note } from "./notes.ts";
import { StorageFailure, type SaveNoteInput } from "./note-store.ts";
import { err, ok, type Result } from "./result.ts";

class RecordingStore {
  readonly saved: Array<Note> = [];
  fail = false;

  saveNote(input: SaveNoteInput): Result<Note, StorageFailure> {
    if (this.fail) {
      return err(new StorageFailure("save note", undefined, "disk unavailable"));
    }
    this.saved.push(input.note);
    return ok(input.note);
  }
}

describe("autosave", () => {
  test("rapid revisions coalesce into the newest body", async () => {
    const store = new RecordingStore();
    const states: Array<SaveState> = [];
    const autosave = makeAutosave(store, states);
    autosave.change("one");
    autosave.change("two");
    autosave.change("three");

    expect((await autosave.flush())._tag).toBe("ok");
    expect(store.saved.map((note) => note.body)).toEqual(["three"]);
    expect(states.at(-1)?._tag).toBe("clean");
  });

  test("a change during a write queues the newer revision", async () => {
    const store = new RecordingStore();
    const autosave = makeAutosave(store, []);
    autosave.change("first");
    const flushing = autosave.flush();
    autosave.change("second");

    expect((await flushing)._tag).toBe("ok");
    expect(store.saved.map((note) => note.body)).toEqual(["first", "second"]);
    expect(autosave.getState()).toEqual({ _tag: "clean", revision: 2 });
  });

  test("save failure retains the live body and a later edit retries", async () => {
    const store = new RecordingStore();
    store.fail = true;
    const autosave = makeAutosave(store, []);
    autosave.change("not lost");
    expect((await autosave.flush())._tag).toBe("err");
    expect(autosave.getBody()).toBe("not lost");
    expect(autosave.getState()._tag).toBe("failed");

    store.fail = false;
    autosave.change("recovered");
    expect((await autosave.flush())._tag).toBe("ok");
    expect(store.saved.at(-1)?.body).toBe("recovered");
  });
});

function makeAutosave(store: RecordingStore, states: Array<SaveState>): Autosave {
  const key = parseDirectoryKey("/tmp/project");
  if (key._tag === "err") {
    throw key.error;
  }
  const note = createBlankNote({ key: key.value, path: "/tmp/project" }, 1);
  return new Autosave(
    note,
    store,
    systemAutosaveRuntime,
    {
      onStateChange: (state) => states.push(state),
      onSaved: () => undefined,
    },
    60_000,
  );
}
